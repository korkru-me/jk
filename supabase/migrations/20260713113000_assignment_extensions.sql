-- Per-student deadline extension. UNIQUE(assignment_id, student_id) makes
-- "grant" an upsert and "revoke" a delete of one row — the assignment's own
-- end_at is never touched, so other students are unaffected.

CREATE TABLE IF NOT EXISTS public.assignment_extensions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  extended_end_at timestamptz NOT NULL,
  note            text,
  granted_by      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_extensions_assignment ON public.assignment_extensions(assignment_id);

ALTER TABLE public.assignment_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignment_extensions_teacher_all" ON public.assignment_extensions
  FOR ALL TO authenticated
  USING (
    assignment_id = ANY(get_my_created_assignment_ids())
    OR assignment_id = ANY(get_my_co_teaching_assignment_ids())
  )
  WITH CHECK (
    assignment_id = ANY(get_my_created_assignment_ids())
    OR assignment_id = ANY(get_my_co_teaching_assignment_ids())
  );

CREATE POLICY "assignment_extensions_student_select" ON public.assignment_extensions
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());
