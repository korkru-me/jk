-- Prepared locally only. Check migration parity and commit with dependent code
-- before any hosted rollout; do not replay unrelated pending migrations.
CREATE TABLE public.auth_email_request_limits (
  bucket_key text PRIMARY KEY CHECK (length(bucket_key) BETWEEN 69 AND 80),
  window_started_at timestamptz NOT NULL,
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_email_request_limits_expiry_idx
  ON public.auth_email_request_limits (expires_at);
ALTER TABLE public.auth_email_request_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_email_request_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_email_request_limits TO service_role;

-- Invoker-only and service-role-only; no identity/tenant data or raw email/IP.
-- All email entry points share these counters, including failed provider calls.
CREATE FUNCTION public.reserve_auth_email_request(p_email_key text, p_ip_key text DEFAULT NULL)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_bucket record;
  v_state public.auth_email_request_limits%ROWTYPE;
  v_wait integer := 0;
BEGIN
  IF p_email_key IS NULL OR p_email_key !~ '^[a-f0-9]{64}$'
    OR (p_ip_key IS NOT NULL AND p_ip_key !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'Invalid request key' USING ERRCODE = '22023';
  END IF;

  -- Deterministic row-lock order prevents deadlocks between shared IP/email
  -- buckets. Insert+FOR UPDATE serializes concurrent server instances.
  FOR v_bucket IN
    SELECT * FROM (VALUES
      ('email:' || p_email_key || ':c', 1, 60),
      ('email:' || p_email_key || ':h', 5, 3600),
      ('email:' || p_email_key || ':d', 10, 86400),
      ('ip:' || p_ip_key || ':h', 120, 3600)
    ) AS b(key, maximum, seconds)
    WHERE key IS NOT NULL ORDER BY CASE WHEN key LIKE 'ip:%' THEN 0 ELSE 1 END, key
  LOOP
    INSERT INTO public.auth_email_request_limits (bucket_key, window_started_at, expires_at)
      VALUES (v_bucket.key, v_now, v_now + interval '48 hours')
      ON CONFLICT (bucket_key) DO NOTHING;
    SELECT * INTO STRICT v_state FROM public.auth_email_request_limits
      WHERE bucket_key = v_bucket.key FOR UPDATE;
    IF v_state.window_started_at + make_interval(secs => v_bucket.seconds) > v_now
      AND v_state.requests >= v_bucket.maximum THEN
      v_wait := greatest(v_wait, ceil(extract(epoch FROM
        v_state.window_started_at + make_interval(secs => v_bucket.seconds) - v_now))::integer);
      -- Do not allocate recipient rows for unlimited new addresses after this
      -- network is exhausted. A denied request must not become storage abuse.
      IF v_bucket.key LIKE 'ip:%' THEN
        RETURN QUERY SELECT false, v_wait;
        RETURN;
      END IF;
    END IF;
  END LOOP;
  IF v_wait > 0 THEN
    RETURN QUERY SELECT false, v_wait;
    RETURN;
  END IF;

  FOR v_bucket IN
    SELECT * FROM (VALUES
      ('email:' || p_email_key || ':c', 60),
      ('email:' || p_email_key || ':h', 3600),
      ('email:' || p_email_key || ':d', 86400),
      ('ip:' || p_ip_key || ':h', 3600)
    ) AS b(key, seconds) WHERE key IS NOT NULL
    ORDER BY CASE WHEN key LIKE 'ip:%' THEN 0 ELSE 1 END, key
  LOOP
    UPDATE public.auth_email_request_limits SET
      requests = CASE WHEN window_started_at + make_interval(secs => v_bucket.seconds) <= v_now
        THEN 1 ELSE requests + 1 END,
      window_started_at = CASE WHEN window_started_at + make_interval(secs => v_bucket.seconds) <= v_now
        THEN v_now ELSE window_started_at END,
      expires_at = v_now + interval '48 hours'
    WHERE bucket_key = v_bucket.key;
  END LOOP;
  RETURN QUERY SELECT true, 0;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_auth_email_request(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_auth_email_request(text, text) TO service_role;

CREATE FUNCTION public.purge_auth_email_request_limits()
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_deleted bigint;
BEGIN
  DELETE FROM public.auth_email_request_limits WHERE expires_at < clock_timestamp();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_auth_email_request_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_auth_email_request_limits() TO service_role;

-- Hosted Supabase has pg_cron; a local minimal Postgres can run the purge
-- explicitly. No email is sent by this job.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('auth-email-limit-cleanup', '17 * * * *',
      'SELECT public.purge_auth_email_request_limits()');
  END IF;
END;
$$;

COMMENT ON TABLE public.auth_email_request_limits IS
  'Server-only HMAC email/IP counters for anonymous auth-email reservations. No browser grants or policies. Expired counters purged hourly when pg_cron is installed.';
