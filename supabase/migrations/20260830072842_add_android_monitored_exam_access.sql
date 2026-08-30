-- Android cannot provide the Safe Exam Browser security boundary without a
-- native/managed-device component. This migration adds a deliberately lower-
-- assurance, teacher-approved monitored mode for student-owned Android
-- devices. It stores no user agent, device identifier, IP address, screen
-- content, camera, microphone, or device fingerprint.

ALTER TABLE public.assignments
  ADD COLUMN android_exam_mode text NOT NULL DEFAULT 'blocked';

ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_android_exam_mode_check
  CHECK (android_exam_mode IN ('blocked', 'monitored'));

COMMENT ON COLUMN public.assignments.android_exam_mode IS
  'For seb_required exams only: blocked rejects Android; monitored allows a normal Android browser after an exact teacher approval and keeps browser proctoring enabled. This is not a kiosk or screenshot-prevention boundary.';

CREATE TABLE public.exam_android_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id),
  CONSTRAINT exam_android_approvals_review_state_check CHECK (
    (
      status = 'pending'
      AND reviewed_at IS NULL
      AND reviewed_by IS NULL
      AND expires_at IS NULL
    )
    OR
    (
      status = 'approved'
      AND reviewed_at IS NOT NULL
      AND reviewed_by IS NOT NULL
      AND expires_at IS NOT NULL
      AND expires_at > reviewed_at
    )
    OR
    (
      status = 'denied'
      AND reviewed_at IS NOT NULL
      AND reviewed_by IS NOT NULL
      AND expires_at IS NULL
    )
  )
);

CREATE INDEX idx_exam_android_approvals_assignment_status
  ON public.exam_android_approvals(assignment_id, status, requested_at DESC);
CREATE INDEX idx_exam_android_approvals_student
  ON public.exam_android_approvals(student_id, assignment_id);
CREATE INDEX idx_exam_android_approvals_retention
  ON public.exam_android_approvals(COALESCE(expires_at, reviewed_at, requested_at));

-- Keep tenant/identity scope correct even for privileged server writes. The
-- review action may change decision fields only, never move a request to a
-- different assignment, student, or organization.
CREATE FUNCTION public.validate_exam_android_approval_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.org_id IS DISTINCT FROM NEW.org_id
    OR OLD.assignment_id IS DISTINCT FROM NEW.assignment_id
    OR OLD.student_id IS DISTINCT FROM NEW.student_id
  ) THEN
    RAISE EXCEPTION 'Android exam approval identity and scope are immutable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.assignments assignment
    WHERE assignment.id = NEW.assignment_id
      AND assignment.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'Android exam approval must match assignment organization';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_exam_android_approval_scope()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER exam_android_approvals_scope
  BEFORE INSERT OR UPDATE ON public.exam_android_approvals
  FOR EACH ROW EXECUTE FUNCTION public.validate_exam_android_approval_scope();

CREATE TRIGGER exam_android_approvals_updated_at
  BEFORE UPDATE ON public.exam_android_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.exam_android_approvals IS
  'One minimal Android monitored-mode access decision per student and assignment. Teacher approval is an operational control after physical device inspection, not proof of Android identity or screenshot prevention.';

ALTER TABLE public.exam_android_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_android_approvals_student_select"
  ON public.exam_android_approvals
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.assignments assignment
      JOIN public.assignment_classrooms assignment_classroom
        ON assignment_classroom.assignment_id = assignment.id
      JOIN public.classroom_students classroom_student
        ON classroom_student.classroom_id = assignment_classroom.classroom_id
      WHERE assignment.id = exam_android_approvals.assignment_id
        AND assignment.status = 'published'
        AND classroom_student.student_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "exam_android_approvals_teacher_select"
  ON public.exam_android_approvals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assignments assignment
      WHERE assignment.id = exam_android_approvals.assignment_id
        AND (
          assignment.created_by = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.assignment_classrooms assignment_classroom
            JOIN public.classroom_co_teachers co_teacher
              ON co_teacher.classroom_id = assignment_classroom.classroom_id
            WHERE assignment_classroom.assignment_id = assignment.id
              AND co_teacher.user_id = (SELECT auth.uid())
              AND co_teacher.permission IN ('admin', 'manage')
          )
          OR EXISTS (
            SELECT 1
            FROM public.super_admins super_admin
            WHERE super_admin.user_id = (SELECT auth.uid())
          )
        )
    )
  );

REVOKE ALL ON public.exam_android_approvals FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.exam_android_approvals FROM authenticated;
GRANT SELECT ON public.exam_android_approvals TO authenticated;

-- Record the assurance mode on the attempt separately from the SEB audit
-- fields. Android approval never populates secure_browser_* columns.
ALTER TABLE public.submissions
  ADD COLUMN exam_access_mode text NOT NULL DEFAULT 'browser',
  ADD COLUMN android_approved_at timestamptz,
  ADD COLUMN android_approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.submissions
SET exam_access_mode = 'seb'
WHERE secure_browser_verified_at IS NOT NULL;

ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_exam_access_mode_check
  CHECK (exam_access_mode IN ('browser', 'seb', 'android_monitored')),
  ADD CONSTRAINT submissions_android_approval_complete_check
  CHECK (
    (android_approved_at IS NULL AND android_approved_by IS NULL)
    OR
    (android_approved_at IS NOT NULL AND android_approved_by IS NOT NULL)
  ),
  ADD CONSTRAINT submissions_exam_access_audit_check
  CHECK (
    (
      exam_access_mode = 'browser'
      AND secure_browser_verified_at IS NULL
      AND android_approved_at IS NULL
    )
    OR
    (
      exam_access_mode = 'seb'
      AND secure_browser_verified_at IS NOT NULL
    )
    OR
    (
      exam_access_mode = 'android_monitored'
      AND android_approved_at IS NOT NULL
    )
  );

COMMENT ON COLUMN public.submissions.exam_access_mode IS
  'Current access assurance: browser, server-verified seb, or teacher-approved android_monitored. SEB/Android audit fields may both remain populated if an attempt changed access mode; the current value must always show the lower/actual mode in use.';

ALTER TABLE public.exam_proctor_sessions
  ADD COLUMN exam_access_mode text NOT NULL DEFAULT 'browser',
  ADD COLUMN android_approved_at timestamptz,
  ADD COLUMN android_approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.exam_proctor_sessions
  ADD CONSTRAINT exam_proctor_sessions_exam_access_mode_check
  CHECK (exam_access_mode IN ('browser', 'seb', 'android_monitored'));

-- Replace the phase-1 trigger so every heartbeat copies both the strong SEB
-- audit and the lower-assurance Android approval from the submission. The
-- browser cannot forge either badge shown in the live room.
CREATE OR REPLACE FUNCTION public.sync_exam_proctor_session_secure_browser()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT
    submission.secure_browser_verified_at,
    submission.secure_browser_platform,
    submission.secure_browser_version,
    submission.exam_access_mode,
    submission.android_approved_at,
    submission.android_approved_by
  INTO
    NEW.secure_browser_verified_at,
    NEW.secure_browser_platform,
    NEW.secure_browser_version,
    NEW.exam_access_mode,
    NEW.android_approved_at,
    NEW.android_approved_by
  FROM public.submissions submission
  WHERE submission.id = NEW.submission_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_exam_proctor_session_secure_browser()
  FROM PUBLIC, anon, authenticated;

UPDATE public.exam_proctor_sessions session
SET
  secure_browser_verified_at = submission.secure_browser_verified_at,
  secure_browser_platform = submission.secure_browser_platform,
  secure_browser_version = submission.secure_browser_version,
  exam_access_mode = submission.exam_access_mode,
  android_approved_at = submission.android_approved_at,
  android_approved_by = submission.android_approved_by
FROM public.submissions submission
WHERE submission.id = session.submission_id;

-- Approval rows are operational access data, not permanent student records.
-- Keep the same 90-day ceiling as live proctor evidence.
CREATE OR REPLACE FUNCTION public.purge_expired_exam_android_approvals(
  p_before timestamptz DEFAULT now() - interval '90 days'
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
    RAISE EXCEPTION 'invalid Android approval retention cutoff' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.exam_android_approvals approval
  WHERE COALESCE(approval.expires_at, approval.reviewed_at, approval.requested_at) < p_before;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_exam_android_approvals(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_exam_android_approvals(timestamptz)
  TO service_role;

DO $$
DECLARE
  v_existing_job_id bigint;
BEGIN
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'exam-android-approval-retention-daily';

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'exam-android-approval-retention-daily',
    '35 19 * * *',
    $job$SELECT public.purge_expired_exam_android_approvals();$job$
  );
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'exam_android_approvals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_android_approvals;
  END IF;
END;
$$;
