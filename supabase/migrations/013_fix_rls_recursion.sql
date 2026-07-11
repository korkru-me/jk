-- =============================================================================
-- Migration 013: Fix RLS Infinite Recursion on classrooms ↔ classroom_students
--
-- Root cause:
--   classrooms_student_select  → queries classroom_students (triggers its RLS)
--   classroom_students_teacher_select → queries classrooms   (triggers its RLS)
--   → infinite loop
--
-- Fix: replace both subqueries with SECURITY DEFINER functions
--      that bypass RLS at one side of the loop.
-- =============================================================================


-- ── Helper: all classroom_ids the current student is enrolled in ──────────────
-- SECURITY DEFINER queries classroom_students without its own RLS,
-- so classroom_students_teacher_select is never evaluated here.
CREATE OR REPLACE FUNCTION public.get_my_enrolled_classroom_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT classroom_id
      FROM public.classroom_students
      WHERE student_id = auth.uid()
    ),
    ARRAY[]::uuid[]
  );
$$;


-- ── Helper: all classroom ids this teacher owns ───────────────────────────────
-- SECURITY DEFINER queries classrooms without its own RLS,
-- so classrooms_student_select is never evaluated here.
CREATE OR REPLACE FUNCTION public.get_my_teaching_classroom_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT id
      FROM public.classrooms
      WHERE teacher_id = auth.uid()
    ),
    ARRAY[]::uuid[]
  );
$$;


-- ── Fix classrooms_student_select ─────────────────────────────────────────────
DROP POLICY IF EXISTS "classrooms_student_select" ON public.classrooms;
CREATE POLICY "classrooms_student_select" ON public.classrooms
  FOR SELECT USING (
    id = ANY(get_my_enrolled_classroom_ids())
  );


-- ── Fix classroom_students_teacher_select ────────────────────────────────────
DROP POLICY IF EXISTS "classroom_students_teacher_select" ON public.classroom_students;
CREATE POLICY "classroom_students_teacher_select" ON public.classroom_students
  FOR SELECT USING (
    classroom_id = ANY(get_my_teaching_classroom_ids())
  );
