-- Co-teacher permission table + SECURITY DEFINER helpers.
-- Follows the established recursion-safe pattern from 013/014/018: every
-- cross-table RLS check routes through a SECURITY DEFINER STABLE helper,
-- never a raw subquery into another RLS-enabled table.

CREATE TABLE IF NOT EXISTS public.classroom_co_teachers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission   text NOT NULL DEFAULT 'manage' CHECK (permission IN ('admin', 'manage', 'view')),
  invited_by   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_classroom_co_teachers_classroom ON public.classroom_co_teachers(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_co_teachers_user      ON public.classroom_co_teachers(user_id);

DROP TRIGGER IF EXISTS classroom_co_teachers_updated_at ON public.classroom_co_teachers;
CREATE TRIGGER classroom_co_teachers_updated_at
  BEFORE UPDATE ON public.classroom_co_teachers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Helper functions (SECURITY DEFINER — reads classroom_co_teachers as
-- table owner, does not re-enter RLS on any other table) ────────────────────

CREATE OR REPLACE FUNCTION public.get_my_co_teaching_classroom_ids(
  p_perms text[] DEFAULT ARRAY['admin', 'manage', 'view']
)
RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT classroom_id FROM public.classroom_co_teachers
    WHERE user_id = auth.uid() AND permission = ANY(p_perms)
  ), ARRAY[]::uuid[]);
$$;

CREATE OR REPLACE FUNCTION public.is_classroom_co_teacher(p_classroom_id uuid, p_perms text[])
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classroom_co_teachers
    WHERE classroom_id = p_classroom_id AND user_id = auth.uid() AND permission = ANY(p_perms)
  );
$$;

-- ── RLS on classroom_co_teachers itself ──────────────────────────────────────
ALTER TABLE public.classroom_co_teachers ENABLE ROW LEVEL SECURITY;

-- Classroom owner manages the co-teacher roster
CREATE POLICY "classroom_co_teachers_owner_all" ON public.classroom_co_teachers
  FOR ALL TO authenticated
  USING (classroom_id = ANY(get_my_teaching_classroom_ids()))
  WITH CHECK (classroom_id = ANY(get_my_teaching_classroom_ids()));

-- Admin-permission co-teachers may also manage the roster
CREATE POLICY "classroom_co_teachers_admin_all" ON public.classroom_co_teachers
  FOR ALL TO authenticated
  USING (is_classroom_co_teacher(classroom_id, ARRAY['admin']))
  WITH CHECK (is_classroom_co_teacher(classroom_id, ARRAY['admin']));

-- Any co-teacher can see their own row (so the UI knows its own permission level)
CREATE POLICY "classroom_co_teachers_self_select" ON public.classroom_co_teachers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── Extend classrooms / classroom_students so co-teachers can read what they teach ──
CREATE POLICY "classrooms_co_teacher_select" ON public.classrooms
  FOR SELECT TO authenticated
  USING (id = ANY(get_my_co_teaching_classroom_ids()));

CREATE POLICY "classroom_students_co_teacher_select" ON public.classroom_students
  FOR SELECT TO authenticated
  USING (classroom_id = ANY(get_my_co_teaching_classroom_ids()));
