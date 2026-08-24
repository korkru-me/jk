-- Keep answer keys and grading state behind server-only boundaries while an
-- attempt is active. RLS controls rows (not columns), so students must not be
-- allowed to SELECT full question/submission_answer rows before the configured
-- result-release point.

CREATE OR REPLACE FUNCTION public.current_user_can_manage_question_bank()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = (SELECT auth.uid())
      AND role IN ('teacher', 'admin')
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_manage_question_bank() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_question_bank() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_current_user_view_submission_score(p_submission_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    WHERE s.id = p_submission_id
      AND s.student_id = (SELECT auth.uid())
      AND (
        s.status = 'in_progress'
        OR (
          s.status IN ('submitted', 'graded')
          AND (
            a.show_results IN ('immediate', 'score_only')
            OR (a.show_results = 'after_due' AND (a.end_at IS NULL OR a.end_at < now()))
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_current_user_view_submission_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_current_user_view_submission_score(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_current_user_view_submission_answers(p_submission_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    WHERE s.id = p_submission_id
      AND s.student_id = (SELECT auth.uid())
      AND s.status IN ('submitted', 'graded')
      AND (
        a.show_results = 'immediate'
        OR (a.show_results = 'after_due' AND (a.end_at IS NULL OR a.end_at < now()))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_current_user_view_submission_answers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_current_user_view_submission_answers(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_current_user_view_question_solution(p_question_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.submission_answers sa
    WHERE sa.question_id = p_question_id
      AND public.can_current_user_view_submission_answers(sa.submission_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_current_user_view_question_solution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_current_user_view_question_solution(uuid) TO authenticated;

-- A student could otherwise change users.role through the broad self-profile
-- update policy and then satisfy teacher-only RLS. Keep profile edits working,
-- but make authority fields immutable to the account itself.
CREATE OR REPLACE FUNCTION public.protect_user_authority_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) = OLD.id
     AND NOT public.is_super_admin()
     AND (
       NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
     ) THEN
    RAISE EXCEPTION 'role and status may only be changed by an administrator'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_user_authority_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_user_authority_fields ON public.users;
CREATE TRIGGER protect_user_authority_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_authority_fields();

-- Full question-bank rows contain answer_formula, answer_parts formulas,
-- mcq_options.is_correct and answer-bearing extra_data. Restrict every broad
-- visibility policy to trusted question-bank roles. Students only regain a
-- full row after answer review is explicitly released for their submission.
DROP POLICY IF EXISTS "questions_student_assigned" ON public.questions;

DROP POLICY IF EXISTS "questions_creator_all" ON public.questions;
CREATE POLICY "questions_creator_all" ON public.questions
  FOR ALL TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND public.current_user_can_manage_question_bank()
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.current_user_can_manage_question_bank()
  );

DROP POLICY IF EXISTS "questions_public_select" ON public.questions;
CREATE POLICY "questions_public_select" ON public.questions
  FOR SELECT TO authenticated
  USING (
    visibility = 'public'
    AND public.current_user_can_manage_question_bank()
  );

DROP POLICY IF EXISTS "questions_org_school_select" ON public.questions;
CREATE POLICY "questions_org_school_select" ON public.questions
  FOR SELECT TO authenticated
  USING (
    visibility IN ('school', 'organization')
    AND org_id IS NOT NULL
    AND org_id = ANY(public.get_user_org_ids())
    AND public.current_user_can_manage_question_bank()
  );

DROP POLICY IF EXISTS "questions_org_shared_select" ON public.questions;
CREATE POLICY "questions_org_shared_select" ON public.questions
  FOR SELECT TO authenticated
  USING (
    public.question_shared_with_my_orgs(id)
    AND public.current_user_can_manage_question_bank()
  );

DROP POLICY IF EXISTS "questions_team_editor_update" ON public.questions;
CREATE POLICY "questions_team_editor_update" ON public.questions
  FOR UPDATE TO authenticated
  USING (
    team_edit_allowed = true
    AND public.current_user_can_manage_question_bank()
    AND (
      public.question_shared_with_my_orgs(id)
      OR (
        org_id = ANY(public.get_user_org_ids())
        AND visibility IN ('organization', 'school')
      )
    )
  )
  WITH CHECK (
    team_edit_allowed = true
    AND public.current_user_can_manage_question_bank()
    AND (
      public.question_shared_with_my_orgs(id)
      OR (
        org_id = ANY(public.get_user_org_ids())
        AND visibility IN ('organization', 'school')
      )
    )
  );

DROP POLICY IF EXISTS "questions_student_results_select" ON public.questions;
CREATE POLICY "questions_student_results_select" ON public.questions
  FOR SELECT TO authenticated
  USING (public.can_current_user_view_question_solution(id));

-- assignments.access_code is plaintext on legacy rows, so row-level SELECT
-- cannot safely expose the table to students. Student pages now read explicit
-- safe columns through authenticated server code after classroom-membership
-- checks; teachers and super admins retain their existing policies.
DROP POLICY IF EXISTS "assignments_student_select" ON public.assignments;

-- Students can see the active submission header so the app can resume it,
-- and can see completed scores only under the assignment's release policy.
-- Mutations are server-only and use the service role after exact auth/authz.
DROP POLICY IF EXISTS "submissions_student_own" ON public.submissions;
CREATE POLICY "submissions_student_select" ON public.submissions
  FOR SELECT TO authenticated
  USING (public.can_current_user_view_submission_score(id));

DROP POLICY IF EXISTS "submission_answers_student_own" ON public.submission_answers;
CREATE POLICY "submission_answers_student_results_select" ON public.submission_answers
  FOR SELECT TO authenticated
  USING (public.can_current_user_view_submission_answers(submission_id));

REVOKE INSERT, UPDATE, DELETE ON TABLE public.submissions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.submission_answers FROM anon, authenticated;
