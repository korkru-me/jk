-- =============================================================================
-- Migration 018: Fix RLS infinite recursion on questions/assignments/classroom_students
--
-- Root cause:
--   questions_student_assigned (on questions) directly joins assignments + classroom_students
--   assignments_student_select (on assignments) directly subqueries classroom_students
--   → evaluating one re-enters RLS on the other, tripping Postgres's recursion guard (42P17)
--
-- Fix: route through SECURITY DEFINER helpers (same pattern as migration 014) so no
--      policy on questions/assignments ever queries another RLS-protected table directly.
-- =============================================================================

-- All question_ids visible to the current student via a published assignment in a
-- classroom they're enrolled in. SECURITY DEFINER + uses get_my_enrolled_classroom_ids()
-- (also SECURITY DEFINER) so neither assignments' nor classroom_students' RLS is triggered.
CREATE OR REPLACE FUNCTION public.get_my_assigned_question_ids()
RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT UNNEST(a.question_ids)
    FROM public.assignments a
    WHERE a.status = 'published'
      AND a.classroom_id = ANY(get_my_enrolled_classroom_ids())
  ), ARRAY[]::uuid[]);
$$;

DROP POLICY IF EXISTS "questions_student_assigned" ON public.questions;
CREATE POLICY "questions_student_assigned" ON public.questions
  FOR SELECT USING (
    id = ANY(get_my_assigned_question_ids())
  );

DROP POLICY IF EXISTS "assignments_student_select" ON public.assignments;
CREATE POLICY "assignments_student_select" ON public.assignments
  FOR SELECT USING (
    status = 'published'
    AND classroom_id = ANY(get_my_enrolled_classroom_ids())
  );
