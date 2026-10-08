-- Parsing ISO timestamps into timestamptz uses PostgreSQL's STABLE input
-- routine, so keep the validator's declared volatility honest. The late-band
-- JSON requires an explicit Z or numeric offset, which keeps validation
-- deterministic for every row while avoiding an incorrect IMMUTABLE marker.
ALTER FUNCTION public.is_valid_assignment_late_bands(
  timestamptz,
  timestamptz,
  timestamptz,
  jsonb
) STABLE;
