-- Durable aggregate alert receipts only: no recipient, secret, provider body or user data.
-- Prepared locally; apply only after the target migration ledger has been reviewed.
CREATE TABLE public.resend_quota_alert_deliveries (
  delivery_key uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('local', 'staging', 'production')),
  period text NOT NULL CHECK (period IN ('daily', 'monthly')),
  window_key text NOT NULL CHECK (
    (period = 'daily' AND window_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    OR (period = 'monthly' AND window_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$')
  ),
  level integer NOT NULL CHECK (level IN (80, 90, 95)),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  UNIQUE (scope, period, window_key, level)
);

ALTER TABLE public.resend_quota_alert_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.resend_quota_alert_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.resend_quota_alert_deliveries TO service_role;

CREATE FUNCTION public.claim_resend_quota_alert(
  p_scope text,
  p_period text,
  p_window_key text,
  p_level integer,
  p_payload_hash text
)
RETURNS TABLE(status text, delivery_key text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_existing public.resend_quota_alert_deliveries%ROWTYPE;
  v_existing_found boolean;
  v_delivery_key uuid;
  v_valid_window boolean := false;
BEGIN
  IF p_scope IS NULL OR p_scope NOT IN ('local', 'staging', 'production')
    OR p_period IS NULL OR p_period NOT IN ('daily', 'monthly')
    OR p_level IS NULL OR p_level NOT IN (80, 90, 95)
    OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$'
    OR p_window_key IS NULL THEN
    RAISE EXCEPTION 'Invalid quota alert claim' USING ERRCODE = '22023';
  END IF;

  BEGIN
    IF p_period = 'daily' AND p_window_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      v_valid_window := pg_catalog.to_char(p_window_key::date, 'YYYY-MM-DD') = p_window_key;
    ELSIF p_period = 'monthly'
      AND p_window_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' THEN
      -- Provider's monthly reset instant, not an assumed calendar-month boundary.
      v_valid_window := pg_catalog.to_char(
        p_window_key::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ) = p_window_key;
    END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    v_valid_window := false;
  END;
  IF NOT v_valid_window THEN
    RAISE EXCEPTION 'Invalid quota alert window' USING ERRCODE = '22023';
  END IF;

  -- All levels of a window share one transaction lock, including the first insert.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'korkru:resend-quota:' || p_scope || ':' || p_period || ':' || p_window_key, 0
  ));

  SELECT d.* INTO v_existing
  FROM public.resend_quota_alert_deliveries AS d
  WHERE d.scope = p_scope AND d.period = p_period
    AND d.window_key = p_window_key AND d.level = p_level;
  v_existing_found := FOUND;

  IF (v_existing_found AND v_existing.sent_at IS NOT NULL) OR EXISTS (
    SELECT 1 FROM public.resend_quota_alert_deliveries AS d
    WHERE d.scope = p_scope AND d.period = p_period AND d.window_key = p_window_key
      AND d.level > p_level AND d.sent_at IS NOT NULL
  ) THEN
    RETURN QUERY SELECT 'already_sent'::text, NULL::text;
    RETURN;
  END IF;

  IF v_existing_found AND v_existing.payload_hash <> p_payload_hash THEN
    RETURN QUERY SELECT 'payload_mismatch'::text, NULL::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.resend_quota_alert_deliveries AS d
    WHERE d.scope = p_scope AND d.period = p_period AND d.window_key = p_window_key
      AND d.level > p_level
  ) THEN
    -- A possibly accepted higher alert must never permit a lower alert on counter decrease.
    RETURN QUERY SELECT 'ignored_higher'::text, NULL::text;
    RETURN;
  END IF;

  IF v_existing_found THEN
    -- Stop before Resend's 24-hour idempotency expiry; never allocate a replacement key.
    IF v_existing.created_at <= pg_catalog.clock_timestamp() - interval '23 hours' THEN
      RETURN QUERY SELECT 'delivery_uncertain'::text, NULL::text;
    ELSE
      RETURN QUERY SELECT 'ready'::text, v_existing.delivery_key::text;
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.resend_quota_alert_deliveries(scope, period, window_key, level, payload_hash)
  VALUES (p_scope, p_period, p_window_key, p_level, p_payload_hash)
  RETURNING resend_quota_alert_deliveries.delivery_key INTO v_delivery_key;
  RETURN QUERY SELECT 'ready'::text, v_delivery_key::text;
END;
$$;

CREATE FUNCTION public.complete_resend_quota_alert(p_delivery_key uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.resend_quota_alert_deliveries AS d
  SET sent_at = COALESCE(d.sent_at, pg_catalog.clock_timestamp())
  WHERE d.delivery_key = p_delivery_key;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_resend_quota_alert(text, text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_resend_quota_alert(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_resend_quota_alert(text, text, text, integer, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_resend_quota_alert(uuid) TO service_role;

COMMENT ON TABLE public.resend_quota_alert_deliveries IS
  'Service-only aggregate alert idempotency and high-water receipts; retain completed and uncertain windows.';
