-- Per-account protection against password guessing, so the hosted Auth
-- per-IP sign-in limit can be raised for exam-day bursts. Only FAILED
-- password attempts are counted; a student who types the right password is
-- never slowed by this table. Keys are server-side HMACs: no raw email or IP.
--
--   p:<account+network>  10 failures / 15 min -> wait 5 min   (normal lockout)
--   a:<account>          30 failures / 60 min -> wait 15 min  (many networks)
--   i:<network>         500 failures / 15 min -> wait 5 min   (password spraying)
--
-- A classmate on another network needs 30 wrong guesses to lock an account,
-- so one prank cannot keep a student out of an exam for long.
CREATE TABLE public.auth_login_failure_limits (
  bucket_key text PRIMARY KEY CHECK (bucket_key ~ '^[api]:[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  locked_until timestamptz,
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_login_failure_limits_expiry_idx
  ON public.auth_login_failure_limits (expires_at);
ALTER TABLE public.auth_login_failure_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_login_failure_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_login_failure_limits TO service_role;

-- Read-only gate before the password is checked. has_failures lets the caller
-- skip the clean-up write after a normal successful login.
CREATE FUNCTION public.check_login_attempt(
  p_account_key text, p_pair_key text DEFAULT NULL, p_ip_key text DEFAULT NULL)
RETURNS TABLE (allowed boolean, retry_after_seconds integer, has_failures boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_lock timestamptz;
  v_has boolean;
BEGIN
  IF p_account_key IS NULL OR p_account_key !~ '^[a-f0-9]{64}$'
    OR (p_pair_key IS NOT NULL AND p_pair_key !~ '^[a-f0-9]{64}$')
    OR (p_ip_key IS NOT NULL AND p_ip_key !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'Invalid request key' USING ERRCODE = '22023';
  END IF;

  SELECT max(l.locked_until) INTO v_lock
    FROM public.auth_login_failure_limits l
    WHERE l.bucket_key IN ('a:' || p_account_key, 'p:' || p_pair_key, 'i:' || p_ip_key)
      AND l.locked_until > v_now;
  SELECT EXISTS (
    SELECT 1 FROM public.auth_login_failure_limits l
    WHERE l.bucket_key IN ('a:' || p_account_key, 'p:' || p_pair_key) AND l.failures > 0
  ) INTO v_has;

  IF v_lock IS NOT NULL THEN
    RETURN QUERY SELECT false, greatest(1, ceil(extract(epoch FROM v_lock - v_now))::integer), v_has;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, 0, v_has;
END;
$$;
REVOKE ALL ON FUNCTION public.check_login_attempt(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_attempt(text, text, text) TO service_role;

-- Called only after Auth rejected the email/password pair. Each bucket is one
-- atomic upsert, taken in a fixed key order so concurrent calls cannot deadlock.
CREATE FUNCTION public.record_login_failure(
  p_account_key text, p_pair_key text DEFAULT NULL, p_ip_key text DEFAULT NULL)
RETURNS TABLE (locked boolean, retry_after_seconds integer)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_bucket record;
  v_row public.auth_login_failure_limits%ROWTYPE;
  v_lock timestamptz;
BEGIN
  IF p_account_key IS NULL OR p_account_key !~ '^[a-f0-9]{64}$'
    OR (p_pair_key IS NOT NULL AND p_pair_key !~ '^[a-f0-9]{64}$')
    OR (p_ip_key IS NOT NULL AND p_ip_key !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'Invalid request key' USING ERRCODE = '22023';
  END IF;

  FOR v_bucket IN
    SELECT * FROM (VALUES
      ('a:' || p_account_key, 30, 3600, 900),
      ('i:' || p_ip_key, 500, 900, 300),
      ('p:' || p_pair_key, 10, 900, 300)
    ) AS b(key, maximum, window_seconds, lock_seconds)
    WHERE key IS NOT NULL ORDER BY key
  LOOP
    INSERT INTO public.auth_login_failure_limits AS l
      (bucket_key, window_started_at, failures, locked_until, expires_at)
      VALUES (v_bucket.key, v_now, 1, NULL, v_now + interval '24 hours')
    ON CONFLICT (bucket_key) DO UPDATE SET
      failures = CASE WHEN l.window_started_at + make_interval(secs => v_bucket.window_seconds) <= v_now
        THEN 1 ELSE l.failures + 1 END,
      window_started_at = CASE WHEN l.window_started_at + make_interval(secs => v_bucket.window_seconds) <= v_now
        THEN v_now ELSE l.window_started_at END,
      expires_at = v_now + interval '24 hours'
    RETURNING * INTO v_row;

    IF v_row.locked_until > v_now THEN
      v_lock := greatest(v_lock, v_row.locked_until);
    ELSIF v_row.failures >= v_bucket.maximum THEN
      -- Start a fresh count once the wait is over.
      UPDATE public.auth_login_failure_limits SET
        locked_until = v_now + make_interval(secs => v_bucket.lock_seconds),
        failures = 0,
        window_started_at = v_now
      WHERE bucket_key = v_bucket.key;
      v_lock := greatest(v_lock, v_now + make_interval(secs => v_bucket.lock_seconds));
    END IF;
  END LOOP;

  IF v_lock IS NOT NULL THEN
    RETURN QUERY SELECT true, greatest(1, ceil(extract(epoch FROM v_lock - v_now))::integer);
    RETURN;
  END IF;
  RETURN QUERY SELECT false, 0;
END;
$$;
REVOKE ALL ON FUNCTION public.record_login_failure(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_failure(text, text, text) TO service_role;

-- A correct password forgives earlier typos for that account. An active wait
-- is never lifted here (check_login_attempt stops the login before this runs).
CREATE FUNCTION public.clear_login_failures(p_account_key text, p_pair_key text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_account_key IS NULL OR p_account_key !~ '^[a-f0-9]{64}$'
    OR (p_pair_key IS NOT NULL AND p_pair_key !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'Invalid request key' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.auth_login_failure_limits
    WHERE bucket_key IN ('a:' || p_account_key, 'p:' || p_pair_key)
      AND (locked_until IS NULL OR locked_until <= clock_timestamp());
END;
$$;
REVOKE ALL ON FUNCTION public.clear_login_failures(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_login_failures(text, text) TO service_role;

CREATE FUNCTION public.purge_auth_login_failure_limits()
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_deleted bigint;
BEGIN
  DELETE FROM public.auth_login_failure_limits WHERE expires_at < clock_timestamp();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_auth_login_failure_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_auth_login_failure_limits() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('auth-login-limit-cleanup', '23 * * * *',
      'SELECT public.purge_auth_login_failure_limits()');
  END IF;
END;
$$;

COMMENT ON TABLE public.auth_login_failure_limits IS
  'Server-only HMAC counters of failed password logins (per account+network, account, network). No browser grants or policies. Expired rows purged hourly when pg_cron is installed.';
