-- Lets a teacher (the owning assignment's created_by) manually adjust a
-- student's per-question score after submission — e.g. bump an auto-graded
-- 0 up to partial/full credit, or grade a pending manual fill-blank. Bounds
-- are enforced in the WITH CHECK itself (0..max_score) rather than a
-- separate CHECK constraint, so the pre-existing student-side auto-grading
-- path (submission_answers_student_all, unrelated to this policy) is never
-- at risk of tripping a constraint over rounding.

ALTER TABLE public.submission_answers
  ADD COLUMN IF NOT EXISTS score_edited_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS score_edited_at timestamptz;

DROP POLICY IF EXISTS "submission_answers_org_teacher_update" ON public.submission_answers;
CREATE POLICY "submission_answers_org_teacher_update" ON public.submission_answers
  FOR UPDATE
  USING (
    org_id = ANY(get_user_org_ids())
    AND submission_id IN (
      SELECT s.id FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE a.created_by = auth.uid() AND s.status IN ('submitted', 'graded')
    )
  )
  WITH CHECK (
    org_id = ANY(get_user_org_ids())
    AND submission_id IN (
      SELECT s.id FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE a.created_by = auth.uid() AND s.status IN ('submitted', 'graded')
    )
    AND score >= 0 AND score <= max_score
  );

-- Needed so the same action can also write back the recomputed
-- submissions.total_score / status after a per-question score edit.
DROP POLICY IF EXISTS "submissions_org_teacher_update" ON public.submissions;
CREATE POLICY "submissions_org_teacher_update" ON public.submissions
  FOR UPDATE
  USING (
    org_id = ANY(get_user_org_ids())
    AND assignment_id IN (
      SELECT id FROM public.assignments WHERE created_by = auth.uid()
    )
  )
  WITH CHECK (
    org_id = ANY(get_user_org_ids())
    AND assignment_id IN (
      SELECT id FROM public.assignments WHERE created_by = auth.uid()
    )
  );
