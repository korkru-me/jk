-- classrooms_student_select and classroom_students_teacher_select each did a
-- plain subquery into the OTHER table instead of using the SECURITY DEFINER
-- helpers (get_my_enrolled_classroom_ids / get_my_teaching_classroom_ids)
-- that migrations 013/014 introduced specifically to avoid this. The result:
-- classrooms RLS -> subquery classroom_students RLS -> subquery classrooms
-- RLS -> "infinite recursion detected in policy for relation classrooms".
-- This silently broke every plain (non-admin-client) SELECT on classrooms
-- for a teacher/co-teacher — e.g. /assignments/new showed "no classrooms"
-- for teachers who clearly have some, because the query errored and the
-- app code treated the error as an empty result.
DROP POLICY IF EXISTS "classrooms_student_select" ON public.classrooms;
CREATE POLICY "classrooms_student_select" ON public.classrooms
  FOR SELECT TO authenticated
  USING (id = ANY(get_my_enrolled_classroom_ids()));

DROP POLICY IF EXISTS "classroom_students_teacher_select" ON public.classroom_students;
CREATE POLICY "classroom_students_teacher_select" ON public.classroom_students
  FOR SELECT TO authenticated
  USING (classroom_id = ANY(get_my_teaching_classroom_ids()));
