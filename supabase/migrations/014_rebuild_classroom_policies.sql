-- =============================================================================
-- Migration 014: Full rebuild of classrooms + classroom_students policies
-- Drops EVERY policy on both tables then recreates clean, recursion-free versions
-- =============================================================================

-- ── Step 1: Drop ALL policies on classrooms ───────────────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'classrooms' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.classrooms', pol.policyname);
    RAISE NOTICE 'Dropped classrooms policy: %', pol.policyname;
  END LOOP;
END $$;

-- ── Step 2: Drop ALL policies on classroom_students ───────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'classroom_students' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.classroom_students', pol.policyname);
    RAISE NOTICE 'Dropped classroom_students policy: %', pol.policyname;
  END LOOP;
END $$;


-- ── Step 3: Helper functions (SECURITY DEFINER = bypass RLS) ─────────────────

-- Returns all org_ids the current user belongs to
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ), ARRAY[]::uuid[]);
$$;

-- Returns classroom ids the current user owns as teacher (no RLS on classrooms)
CREATE OR REPLACE FUNCTION public.get_my_teaching_classroom_ids()
RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT id FROM public.classrooms WHERE teacher_id = auth.uid()
  ), ARRAY[]::uuid[]);
$$;

-- Returns classroom ids the current user is enrolled in as student (no RLS on classroom_students)
CREATE OR REPLACE FUNCTION public.get_my_enrolled_classroom_ids()
RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT classroom_id FROM public.classroom_students WHERE student_id = auth.uid()
  ), ARRAY[]::uuid[]);
$$;


-- ── Step 4: Recreate classrooms policies (no subqueries into classroom_students) ──

-- Teacher: full access to their own classrooms in their org
CREATE POLICY "classrooms_teacher_all" ON public.classrooms
  FOR ALL USING (
    teacher_id = auth.uid()
    AND org_id = ANY(get_user_org_ids())
  );

-- Org admin/owner: read all classrooms in their org
CREATE POLICY "classrooms_admin_select" ON public.classrooms
  FOR SELECT USING (
    org_id = ANY(get_user_org_ids())
  );

-- Student: see classrooms they are enrolled in (uses SECURITY DEFINER — no recursion)
CREATE POLICY "classrooms_student_select" ON public.classrooms
  FOR SELECT USING (
    id = ANY(get_my_enrolled_classroom_ids())
  );

-- Super admin bypass
CREATE POLICY "classrooms_super_admin_all" ON public.classrooms
  FOR ALL USING (is_super_admin());


-- ── Step 5: Recreate classroom_students policies (no subqueries into classrooms) ──

-- Teacher: see roster of their classrooms (uses SECURITY DEFINER — no recursion)
CREATE POLICY "classroom_students_teacher_select" ON public.classroom_students
  FOR SELECT USING (
    classroom_id = ANY(get_my_teaching_classroom_ids())
  );

-- Student: join a classroom
CREATE POLICY "classroom_students_join" ON public.classroom_students
  FOR INSERT WITH CHECK (student_id = auth.uid());

-- Student: see their own memberships
CREATE POLICY "classroom_students_own_select" ON public.classroom_students
  FOR SELECT USING (student_id = auth.uid());

-- Student: leave a classroom
CREATE POLICY "classroom_students_own_delete" ON public.classroom_students
  FOR DELETE USING (student_id = auth.uid());

-- Super admin bypass
CREATE POLICY "classroom_students_super_admin_all" ON public.classroom_students
  FOR ALL USING (is_super_admin());


-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('classrooms', 'classroom_students')
ORDER BY tablename, policyname;
