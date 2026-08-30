-- A successful SEB system check happens before an attempt exists. Keep only
-- the latest, deliberately small verification record so a proctor can see
-- who is ready without creating a submission or starting the exam timer.
-- Raw Config Key / Browser Exam Key values, request hashes, IP addresses,
-- user agents, and device identifiers are never stored here.

CREATE TABLE public.exam_seb_checkins (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  platform text NOT NULL CHECK (platform IN ('windows', 'macos', 'ios')),
  version text NOT NULL CHECK (
    char_length(version) BETWEEN 5 AND 240
    AND version !~ '[[:cntrl:]]'
  ),
  PRIMARY KEY (assignment_id, student_id),
  CONSTRAINT exam_seb_checkins_validity_window_check CHECK (
    valid_until > verified_at
    AND valid_until <= verified_at + interval '12 hours'
  )
);

COMMENT ON TABLE public.exam_seb_checkins IS
  'Latest successful pre-attempt SEB verification per assignment and student. It is readiness evidence, not a device identity or misconduct verdict.';
COMMENT ON COLUMN public.exam_seb_checkins.verified_at IS
  'Trusted application-server issue time of the signed SEB session.';
COMMENT ON COLUMN public.exam_seb_checkins.valid_until IS
  'Expiry of that signed SEB session; the UI must not show the check-in as ready after this time.';
COMMENT ON COLUMN public.exam_seb_checkins.platform IS
  'Coarse verified SEB platform only: windows, macos, or ios.';
COMMENT ON COLUMN public.exam_seb_checkins.version IS
  'Validated SafeExamBrowser.version string; no raw verification key or request hash is retained.';

CREATE INDEX idx_exam_seb_checkins_org
  ON public.exam_seb_checkins(org_id);
CREATE INDEX idx_exam_seb_checkins_student
  ON public.exam_seb_checkins(student_id);
CREATE INDEX idx_exam_seb_checkins_retention
  ON public.exam_seb_checkins(verified_at, assignment_id, student_id);

ALTER TABLE public.exam_seb_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_seb_checkins_teacher_select"
  ON public.exam_seb_checkins
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR assignment_id = ANY(public.get_my_created_assignment_ids())
    OR assignment_id = ANY(public.get_my_co_teaching_assignment_ids())
  );

REVOKE ALL ON public.exam_seb_checkins FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.exam_seb_checkins FROM authenticated;
GRANT SELECT ON public.exam_seb_checkins TO authenticated;

-- The Server Action authenticates the student, validates its short-lived
-- signed challenge, and verifies the exact Config Key / Browser Exam Key
-- request hashes first. This service-role-only function independently checks
-- the assignment state and current roster membership before persisting the
-- small verification result. A late older request cannot replace a newer one.
CREATE OR REPLACE FUNCTION public.record_exam_seb_checkin(
  p_assignment_id uuid,
  p_student_id uuid,
  p_platform text,
  p_version text,
  p_verified_at timestamptz,
  p_valid_until timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF p_assignment_id IS NULL
    OR p_student_id IS NULL
    OR p_platform IS NULL
    OR p_platform NOT IN ('windows', 'macos', 'ios')
    OR p_version IS NULL
    OR char_length(p_version) NOT BETWEEN 5 AND 240
    OR p_version ~ '[[:cntrl:]]'
    OR p_verified_at IS NULL
    OR p_valid_until IS NULL
    OR p_verified_at < now() - interval '5 minutes'
    OR p_verified_at > now() + interval '1 minute'
    OR p_valid_until <= now()
    OR p_valid_until <= p_verified_at
    OR p_valid_until > p_verified_at + interval '12 hours'
  THEN
    RAISE EXCEPTION 'invalid SEB check-in' USING ERRCODE = '22023';
  END IF;

  -- Serialize with the teacher's assignment-wide manual purge. A check that
  -- committed before the purge lock is removed by that purge; a genuinely new
  -- check after it may create the latest readiness row again.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_assignment_id::text, 1));

  SELECT assignment.org_id
    INTO v_org_id
  FROM public.assignments assignment
  WHERE assignment.id = p_assignment_id
    AND assignment.status = 'published'
    AND assignment.secure_browser_mode = 'seb_required'
    AND EXISTS (
      SELECT 1
      FROM public.assignment_classrooms assignment_classroom
      JOIN public.classroom_students classroom_student
        ON classroom_student.classroom_id = assignment_classroom.classroom_id
      WHERE assignment_classroom.assignment_id = assignment.id
        AND classroom_student.student_id = p_student_id
    );

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'student is not eligible for this SEB check-in' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.exam_seb_checkins (
    org_id,
    assignment_id,
    student_id,
    verified_at,
    valid_until,
    platform,
    version
  ) VALUES (
    v_org_id,
    p_assignment_id,
    p_student_id,
    p_verified_at,
    p_valid_until,
    p_platform,
    p_version
  )
  ON CONFLICT (assignment_id, student_id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    verified_at = EXCLUDED.verified_at,
    valid_until = EXCLUDED.valid_until,
    platform = EXCLUDED.platform,
    version = EXCLUDED.version
  WHERE EXCLUDED.verified_at >= public.exam_seb_checkins.verified_at;
END;
$$;

COMMENT ON FUNCTION public.record_exam_seb_checkin(uuid, uuid, text, text, timestamptz, timestamptz) IS
  'Stores the latest server-verified pre-attempt SEB readiness record after independently checking assignment state and roster membership.';

REVOKE ALL ON FUNCTION public.record_exam_seb_checkin(uuid, uuid, text, text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_exam_seb_checkin(uuid, uuid, text, text, timestamptz, timestamptz)
  TO service_role;

-- Include check-ins in the same 90-day privacy boundary and the existing
-- teacher-initiated purge. The result shape grows by one explicit counter so
-- the UI can confirm that this data was removed too.
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
  v_checkins_deleted bigint := 0;
BEGIN
  IF p_before IS NULL OR p_before > now() THEN
    RAISE EXCEPTION 'invalid proctor retention cutoff' USING ERRCODE = '22023';
  END IF;

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

  DELETE FROM public.exam_seb_checkins
  WHERE verified_at < p_before;
  GET DIAGNOSTICS v_checkins_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'eventsDeleted', v_events_deleted,
    'connectionsDeleted', v_connections_deleted,
    'sessionsDeleted', v_sessions_deleted,
    'checkinsDeleted', v_checkins_deleted
  );
END;
$$;

COMMENT ON FUNCTION public.purge_expired_exam_proctor_data(timestamptz) IS
  'Deletes proctor events, per-tab leases, session summaries, and SEB preflight check-ins after 90 days. Does not delete submissions, answers, or scores.';

REVOKE ALL ON FUNCTION public.purge_expired_exam_proctor_data(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_exam_proctor_data(timestamptz)
  TO service_role;

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
  v_checkins_deleted bigint := 0;
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

  -- Coordinate with record_exam_seb_checkin() before taking the existing
  -- per-submission locks used by live proctor writes.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_assignment_id::text, 1));

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

  DELETE FROM public.exam_seb_checkins
  WHERE assignment_id = p_assignment_id;
  GET DIAGNOSTICS v_checkins_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'eventsDeleted', v_events_deleted,
    'connectionsDeleted', v_connections_deleted,
    'sessionsDeleted', v_sessions_deleted,
    'checkinsDeleted', v_checkins_deleted
  );
END;
$$;

COMMENT ON FUNCTION public.purge_exam_proctor_data_for_assignment(uuid, uuid) IS
  'Atomically deletes proctor evidence and SEB preflight check-ins for one authorized assignment while refusing to interrupt an active live room.';

REVOKE ALL ON FUNCTION public.purge_exam_proctor_data_for_assignment(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_exam_proctor_data_for_assignment(uuid, uuid)
  TO service_role;

-- Deliberately do not add this table to supabase_realtime. Postgres Changes
-- cannot apply RLS to DELETE payloads, and the composite key contains student
-- and assignment UUIDs. The proctor UI refreshes this small, latest-only table
-- through normal RLS-protected SELECT queries instead.
