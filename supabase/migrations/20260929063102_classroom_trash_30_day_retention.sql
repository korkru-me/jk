-- Classroom trash is a short recovery window, not long-term storage. Purge
-- deleted classrooms and their ON DELETE CASCADE children after 30 days even
-- when no teacher opens the trash page.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.purge_expired_classrooms(
  p_before timestamptz DEFAULT now() - interval '30 days'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint := 0;
BEGIN
  IF p_before IS NULL OR p_before > now() THEN
    RAISE EXCEPTION 'invalid classroom trash cutoff' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.classrooms
  WHERE status = 'deleted'
    AND deleted_at IS NOT NULL
    AND deleted_at < p_before;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.purge_expired_classrooms(timestamptz) IS
  'Permanently deletes classrooms that have remained in trash for more than 30 days, including cascade-owned classroom data.';

REVOKE ALL ON FUNCTION public.purge_expired_classrooms(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_classrooms(timestamptz)
  TO service_role;

-- Apply the shorter policy immediately for rows that are already overdue.
SELECT public.purge_expired_classrooms();

-- Run every day at 19:15 UTC (02:15 Asia/Bangkok). Replacing an existing job
-- with the same name keeps repaired/replayed environments deterministic.
DO $$
DECLARE
  v_existing_job_id bigint;
BEGIN
  SELECT jobid
    INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'classroom-trash-retention-daily';

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'classroom-trash-retention-daily',
    '15 19 * * *',
    $job$SELECT public.purge_expired_classrooms();$job$
  );
END;
$$;
