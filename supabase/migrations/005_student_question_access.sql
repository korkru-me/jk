-- Migration 005: Allow students to read questions assigned to them
-- Run this in Supabase SQL Editor

-- Without this policy, students cannot read private/school questions
-- even when those questions are in an assignment they're taking.
-- This blocks startSubmission from fetching questions and grading from reading tolerances.

CREATE POLICY "questions_student_assigned" ON public.questions
  FOR SELECT USING (
    id = ANY(
      SELECT UNNEST(a.question_ids)
      FROM public.assignments a
      JOIN public.classroom_students cs ON cs.classroom_id = a.classroom_id
      WHERE cs.student_id = auth.uid()
        AND a.status = 'published'
    )
  );
