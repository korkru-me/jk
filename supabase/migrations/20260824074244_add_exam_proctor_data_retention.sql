-- Phase 5 exam-integrity privacy controls. Proctoring signals are operational
-- evidence, not permanent student records. Keep one attempt's data together
-- for 90 days after its last heartbeat, then remove it automatically.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE INDEX idx_exam_proctor_sessions_retention
  ON public.exam_proctor_sessions(last_seen_at, submission_id);

CREATE OR REPLACE FUNCTION public.purge_expired_exam_proctor_data(
  p_before timestamptz DEFAULT now() - interval '90 days'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_events_deleted bigint := 0;
  v_connections_deleted bigint := 0;
  v_sessions_deleted bigint := 0;
BEGIN
  IF p_before IS NULL OR p_before > now() THEN
    RAISE EXCEPTION 'invalid proctor retention cutoff' USING ERRCODE = '22023';
  END IF;

  -- Delete child records first while the session row still identifies every
  -- expired attempt. The session cutoff index and child submission indexes
  -- keep the daily job bounded to attempts that are actually due.
  DELETE FROM public.exam_proctor_events event
  USING public.exam_proctor_sessions session
  WHERE event.submission_id = session.submission_id
    AND session.last_seen_at < p_before;
  GET DIAGNOSTICS v_events_deleted = ROW_COUNT;

  DELETE FROM public.exam_proctor_connections connection
  USING public.exam_proctor_sessions session
  WHERE connection.submission_id = session.submission_id
    AND session.last_seen_at < p_before;
  GET DIAGNOSTICS v_connections_deleted = ROW_COUNT;

  DELETE FROM public.exam_proctor_sessions
  WHERE last_seen_at < p_before;
  GET DIAGNOSTICS v_sessions_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'eventsDeleted', v_events_deleted,
    'connectionsDeleted', v_connections_deleted,
    'sessionsDeleted', v_sessions_deleted
  );
END;
$$;

COMMENT ON FUNCTION public.purge_expired_exam_proctor_data(timestamptz) IS
  'Deletes proctor events, per-tab leases, and session summaries after 90 days without a heartbeat. Does not delete submissions, answers, or scores.';

REVOKE ALL ON FUNCTION public.purge_expired_exam_proctor_data(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_exam_proctor_data(timestamptz)
  TO service_role;

-- Manual deletion is service-role-only. The Server Action authenticates the
-- caller first, and this function independently repeats the exact assignment
-- authorization so an accidentally broad admin query cannot purge another
-- teacher's evidence. Active live sessions are never interrupted.
CREATE OR REPLACE FUNCTION public.purge_exam_proctor_data_for_assignment(
  p_assignment_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_submission_id uuid;
  v_events_deleted bigint := 0;
  v_connections_deleted bigint := 0;
  v_sessions_deleted bigint := 0;
BEGIN
  SELECT assignment.org_id
    INTO v_org_id
  FROM public.assignments assignment
  WHERE assignment.id = p_assignment_id
    AND (
      assignment.created_by = p_actor_id
      OR EXISTS (
        SELECT 1
        FROM public.assignment_classrooms assignment_classroom
        JOIN public.classroom_co_teachers co_teacher
          ON co_teacher.classroom_id = assignment_classroom.classroom_id
        WHERE assignment_classroom.assignment_id = assignment.id
          AND co_teacher.user_id = p_actor_id
          AND co_teacher.permission IN ('admin', 'manage')
      )
      OR EXISTS (
        SELECT 1
        FROM public.super_admins super_admin
        WHERE super_admin.user_id = p_actor_id
      )
    );

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'actor cannot purge this assignment' USING ERRCODE = '42501';
  END IF;

  -- Serialize with record_exam_proctor_signal(), which locks each submission
  -- by the same hash. Deterministic ordering avoids two assignment-wide purge
  -- calls taking these locks in different orders.
  FOR v_submission_id IN
    SELECT submission.id
    FROM public.submissions submission
    WHERE submission.assignment_id = p_assignment_id
    ORDER BY submission.id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_submission_id::text, 0));
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.exam_proctor_sessions session
    WHERE session.assignment_id = p_assignment_id
      AND session.is_online = true
      AND session.completed_at IS NULL
      AND session.last_seen_at >= now() - interval '45 seconds'
  ) THEN
    RAISE EXCEPTION 'active proctor sessions cannot be purged' USING ERRCODE = '55006';
  END IF;

  DELETE FROM public.exam_proctor_events
  WHERE assignment_id = p_assignment_id;
  GET DIAGNOSTICS v_events_deleted = ROW_COUNT;

  DELETE FROM public.exam_proctor_connections
  WHERE assignment_id = p_assignment_id;
  GET DIAGNOSTICS v_connections_deleted = ROW_COUNT;

  DELETE FROM public.exam_proctor_sessions
  WHERE assignment_id = p_assignment_id;
  GET DIAGNOSTICS v_sessions_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'eventsDeleted', v_events_deleted,
    'connectionsDeleted', v_connections_deleted,
    'sessionsDeleted', v_sessions_deleted
  );
END;
$$;

COMMENT ON FUNCTION public.purge_exam_proctor_data_for_assignment(uuid, uuid) IS
  'Atomically deletes only proctoring evidence for one authorized assignment while refusing to interrupt an active live room.';

REVOKE ALL ON FUNCTION public.purge_exam_proctor_data_for_assignment(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_exam_proctor_data_for_assignment(uuid, uuid)
  TO service_role;

-- Run every day at 19:30 UTC (02:30 Asia/Bangkok). Replacing an existing job
-- with the same name keeps repaired/replayed environments deterministic.
DO $$
DECLARE
  v_existing_job_id bigint;
BEGIN
  SELECT jobid
    INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'exam-proctor-retention-daily';

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'exam-proctor-retention-daily',
    '30 19 * * *',
    $job$SELECT public.purge_expired_exam_proctor_data();$job$
  );
END;
$$;
