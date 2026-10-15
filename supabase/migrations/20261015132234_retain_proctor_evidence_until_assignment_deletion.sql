-- The live room is now the evidence viewer. Keep evidence for the lifetime
-- of its assignment rather than deleting it by age or a separate purge UI.
-- No student rows are modified by this migration. Existing ON DELETE CASCADE
-- relations still remove evidence when its assignment is permanently deleted.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR v_job_id IN
      SELECT jobid FROM cron.job
      WHERE jobname IN ('exam-proctor-retention-daily', 'exam-android-approval-retention-daily')
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.purge_expired_exam_proctor_data(timestamptz);
DROP FUNCTION IF EXISTS public.purge_exam_proctor_data_for_assignment(uuid, uuid);
DROP FUNCTION IF EXISTS public.purge_expired_exam_android_approvals(timestamptz);
DROP INDEX IF EXISTS public.idx_exam_proctor_sessions_retention;
DROP INDEX IF EXISTS public.idx_exam_android_approvals_retention;

COMMENT ON TABLE public.exam_proctor_events IS
  'Browser signals retained with the assignment for review inside the live room. No age-based or standalone purge. Signals are not proof of misconduct.';
COMMENT ON TABLE public.exam_proctor_sessions IS
  'Per-attempt signal summaries retained with the assignment. Existing parent deletion cascades remain in effect.';
COMMENT ON TABLE public.exam_proctor_connections IS
  'Per-tab connection evidence retained with the assignment. Connection lease expiry still controls live status, not retention.';
COMMENT ON TABLE public.exam_seb_checkins IS
  'Latest SEB readiness check-in retained with the assignment. Validity and config-revision invalidation still control exam access independently.';
COMMENT ON TABLE public.exam_android_approvals IS
  'Device approval evidence retained with the assignment. Approval expiry still controls access independently.';
