-- Cache auth.uid() as an init plan instead of re-evaluating it for every row.
-- These ALTER POLICY statements preserve each policy's command, roles, and
-- authorization predicates; only direct auth.uid() calls become scalar
-- subqueries as recommended by the Supabase performance advisor.

ALTER POLICY "org_members_delete" ON public.organization_members
  USING (
    is_super_admin()
    OR get_org_role(org_id) = ANY(ARRAY['owner'::text, 'admin'::text])
    OR user_id = (SELECT auth.uid())
  );

ALTER POLICY "users_select_own" ON public.users
  USING ((SELECT auth.uid()) = id);

ALTER POLICY "users_update_own" ON public.users
  USING ((SELECT auth.uid()) = id);

ALTER POLICY "classrooms_org_teacher_all" ON public.classrooms
  USING (
    teacher_id = (SELECT auth.uid())
    AND org_id = ANY(get_user_org_ids())
  );

ALTER POLICY "classroom_students_join" ON public.classroom_students
  WITH CHECK (student_id = (SELECT auth.uid()));

ALTER POLICY "classroom_students_own_select" ON public.classroom_students
  USING (student_id = (SELECT auth.uid()));

ALTER POLICY "classroom_co_teachers_self_select" ON public.classroom_co_teachers
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY "questions_creator_all" ON public.questions
  USING (created_by = (SELECT auth.uid()));

ALTER POLICY "question_sets_owner_all" ON public.question_sets
  USING (
    created_by = (SELECT auth.uid())
    AND org_id = ANY(get_user_org_ids())
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND org_id = ANY(get_user_org_ids())
  );

ALTER POLICY "assignments_org_teacher_all" ON public.assignments
  USING (
    created_by = (SELECT auth.uid())
    AND org_id = ANY(get_user_org_ids())
  );

ALTER POLICY "submissions_student_own" ON public.submissions
  USING (student_id = (SELECT auth.uid()));

ALTER POLICY "submissions_org_teacher_select" ON public.submissions
  USING (
    org_id = ANY(get_user_org_ids())
    AND assignment_id IN (
      SELECT id
      FROM public.assignments
      WHERE created_by = (SELECT auth.uid())
    )
  );

ALTER POLICY "submissions_org_teacher_update" ON public.submissions
  USING (
    org_id = ANY(get_user_org_ids())
    AND assignment_id IN (
      SELECT id
      FROM public.assignments
      WHERE created_by = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id = ANY(get_user_org_ids())
    AND assignment_id IN (
      SELECT id
      FROM public.assignments
      WHERE created_by = (SELECT auth.uid())
    )
  );

ALTER POLICY "submission_answers_student_own" ON public.submission_answers
  USING (
    submission_id IN (
      SELECT id
      FROM public.submissions
      WHERE student_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "submission_answers_org_teacher_select" ON public.submission_answers
  USING (
    org_id = ANY(get_user_org_ids())
    AND submission_id IN (
      SELECT s.id
      FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE a.created_by = (SELECT auth.uid())
    )
  );

ALTER POLICY "submission_answers_org_teacher_update" ON public.submission_answers
  USING (
    org_id = ANY(get_user_org_ids())
    AND submission_id IN (
      SELECT s.id
      FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE a.created_by = (SELECT auth.uid())
        AND s.status IN ('submitted', 'graded')
    )
  )
  WITH CHECK (
    org_id = ANY(get_user_org_ids())
    AND submission_id IN (
      SELECT s.id
      FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE a.created_by = (SELECT auth.uid())
        AND s.status IN ('submitted', 'graded')
    )
    AND score >= 0
    AND score <= max_score
  );

ALTER POLICY "notifications_recipient_select" ON public.notifications
  USING (recipient_id = (SELECT auth.uid()));

ALTER POLICY "notifications_recipient_update" ON public.notifications
  USING (recipient_id = (SELECT auth.uid()))
  WITH CHECK (recipient_id = (SELECT auth.uid()));

ALTER POLICY "notifications_recipient_delete" ON public.notifications
  USING (recipient_id = (SELECT auth.uid()));

ALTER POLICY "classroom_invitations_mark_used" ON public.classroom_invitations
  USING (used_at IS NULL AND expires_at > now())
  WITH CHECK (used_by = (SELECT auth.uid()));

ALTER POLICY "assignment_extensions_student_select" ON public.assignment_extensions
  USING (student_id = (SELECT auth.uid()));

ALTER POLICY "post_comments_insert" ON public.post_comments
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND post_id IN (
      SELECT cp.id
      FROM public.classroom_posts cp
      WHERE cp.classroom_id = ANY(get_my_teaching_classroom_ids())
        OR is_classroom_co_teacher(cp.classroom_id, ARRAY['admin', 'manage', 'view'])
        OR cp.classroom_id = ANY(get_my_enrolled_classroom_ids())
    )
  );
