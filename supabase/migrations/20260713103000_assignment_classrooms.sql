-- Multi-classroom assignments. assignments.classroom_id stays NOT NULL as the
-- "primary" classroom (backward compat for legacy queries); this join table
-- becomes the authoritative source of which classrooms an assignment targets.

CREATE TABLE IF NOT EXISTS public.assignment_classrooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  classroom_id  uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, classroom_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_classrooms_assignment ON public.assignment_classrooms(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_classrooms_classroom  ON public.assignment_classrooms(classroom_id);

-- Backfill: every existing assignment gets a row mirroring its legacy classroom_id
INSERT INTO public.assignment_classrooms (assignment_id, classroom_id)
SELECT id, classroom_id FROM public.assignments
ON CONFLICT (assignment_id, classroom_id) DO NOTHING;

-- ── Helper functions ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_created_assignment_ids()
RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT id FROM public.assignments WHERE created_by = auth.uid()
  ), ARRAY[]::uuid[]);
$$;

CREATE OR REPLACE FUNCTION public.get_my_co_teaching_assignment_ids()
RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT ac.assignment_id
    FROM public.assignment_classrooms ac
    JOIN public.classroom_co_teachers ct ON ct.classroom_id = ac.classroom_id
    WHERE ct.user_id = auth.uid() AND ct.permission IN ('admin', 'manage')
  ), ARRAY[]::uuid[]);
$$;

CREATE OR REPLACE FUNCTION public.get_my_visible_assignment_ids()
RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT a.id
    FROM public.assignments a
    WHERE a.status = 'published'
      AND EXISTS (
        SELECT 1 FROM public.assignment_classrooms ac
        WHERE ac.assignment_id = a.id
          AND ac.classroom_id = ANY(get_my_enrolled_classroom_ids())
      )
  ), ARRAY[]::uuid[]);
$$;

-- ── assignment_classrooms RLS ─────────────────────────────────────────────
ALTER TABLE public.assignment_classrooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignment_classrooms_select" ON public.assignment_classrooms
  FOR SELECT TO authenticated
  USING (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR classroom_id = ANY(get_my_enrolled_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage', 'view'])
    OR assignment_id = ANY(get_my_created_assignment_ids())
  );

CREATE POLICY "assignment_classrooms_insert" ON public.assignment_classrooms
  FOR INSERT TO authenticated
  WITH CHECK (
    assignment_id = ANY(get_my_created_assignment_ids())
    AND (
      classroom_id = ANY(get_my_teaching_classroom_ids())
      OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage'])
    )
  );

CREATE POLICY "assignment_classrooms_delete" ON public.assignment_classrooms
  FOR DELETE TO authenticated
  USING (
    assignment_id = ANY(get_my_created_assignment_ids())
    AND (
      classroom_id = ANY(get_my_teaching_classroom_ids())
      OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage'])
    )
  );

-- Co-teacher access to assignments already linked to their classroom.
-- NOTE: creating a brand-new assignment is covered separately by the EXISTING
-- "assignments_org_teacher_all" policy (012_multi_tenancy.sql — FOR ALL USING
-- (created_by = auth.uid() AND org_id = ANY(get_user_org_ids())), no explicit
-- WITH CHECK so USING doubles as the insert check) — that's always true for a
-- self-authored row, so a co-teacher inserting a new assignment succeeds even
-- though get_my_co_teaching_assignment_ids() is necessarily empty for a
-- not-yet-linked row. Do not rename/replace that policy.
CREATE POLICY "assignments_co_teacher_all" ON public.assignments
  FOR ALL TO authenticated
  USING (id = ANY(get_my_co_teaching_assignment_ids()))
  WITH CHECK (id = ANY(get_my_co_teaching_assignment_ids()));

-- Rewrite student-visibility to route through assignment_classrooms instead
-- of the legacy single classroom_id column.
DROP POLICY IF EXISTS "assignments_student_select" ON public.assignments;
CREATE POLICY "assignments_student_select" ON public.assignments
  FOR SELECT TO authenticated
  USING (id = ANY(get_my_visible_assignment_ids()));

CREATE OR REPLACE FUNCTION public.get_my_assigned_question_ids()
RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT UNNEST(a.question_ids)
    FROM public.assignments a
    WHERE a.id = ANY(get_my_visible_assignment_ids())
  ), ARRAY[]::uuid[]);
$$;
-- questions_student_assigned (018) references this function by name only — CREATE OR REPLACE is sufficient.
