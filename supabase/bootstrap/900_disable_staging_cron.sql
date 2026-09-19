-- Fresh Staging bootstrap only. Historical migrations create these jobs so
-- their functions match Production, then this step disables automatic runs.
-- Re-run is safe: an already-removed job simply does not enter the loop.

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'homeroom-weekly-digest',
      'exam-proctor-retention-daily',
      'exam-android-approval-retention-daily'
    )
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
END;
$$;
