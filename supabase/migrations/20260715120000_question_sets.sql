-- Question Sets: reusable, classroom-independent question collections.
-- Decouples "content" (a set of questions, tagged, reusable) from
-- "delivery" (an Assignment: classroom(s), schedule, mode, grading).
-- Assignments still snapshot question_ids at creation time — set_id is
-- provenance-only, not a live reference — so editing a set later never
-- retroactively changes assignments already created from it.

CREATE TABLE IF NOT EXISTS public.question_sets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  question_ids uuid[] NOT NULL DEFAULT '{}',
  tags         text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_sets_created_by ON public.question_sets(created_by);
CREATE INDEX IF NOT EXISTS idx_question_sets_org        ON public.question_sets(org_id);
CREATE INDEX IF NOT EXISTS idx_question_sets_tags        ON public.question_sets USING GIN(tags);

ALTER TABLE public.question_sets ENABLE ROW LEVEL SECURITY;

-- v1 scope: creator-only within org. No co-teacher sharing yet (unlike
-- assignments, where co-teachers with admin/manage permission already have
-- access via assignment_classrooms) — a known limitation for this version.
DROP POLICY IF EXISTS "question_sets_owner_all" ON public.question_sets;
CREATE POLICY "question_sets_owner_all" ON public.question_sets
  FOR ALL TO authenticated
  USING (created_by = auth.uid() AND org_id = ANY(get_user_org_ids()))
  WITH CHECK (created_by = auth.uid() AND org_id = ANY(get_user_org_ids()));

DROP POLICY IF EXISTS "question_sets_super_admin_all" ON public.question_sets;
CREATE POLICY "question_sets_super_admin_all" ON public.question_sets
  FOR ALL USING (is_super_admin());

DROP TRIGGER IF EXISTS question_sets_updated_at ON public.question_sets;
CREATE TRIGGER question_sets_updated_at
  BEFORE UPDATE ON public.question_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Provenance-only link from an assignment back to the set it was created
-- from. No extra RLS needed — assignments is already RLS'd, this is just a
-- column on it.
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS set_id uuid REFERENCES public.question_sets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_set_id ON public.assignments(set_id);
