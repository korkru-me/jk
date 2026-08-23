-- Multi-team sharing for question sets — view/use only (a set is just a
-- picked list of existing questions, so unlike single questions there is no
-- "let teammates edit this" toggle; editing a set stays creator-only).

ALTER TABLE public.question_sets
  ADD COLUMN IF NOT EXISTS visibility public.visibility NOT NULL DEFAULT 'private';

CREATE TABLE IF NOT EXISTS public.question_set_shares (
  question_set_id uuid        NOT NULL REFERENCES public.question_sets(id)  ON DELETE CASCADE,
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_set_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_question_set_shares_org ON public.question_set_shares(org_id);
CREATE INDEX IF NOT EXISTS idx_question_set_shares_set ON public.question_set_shares(question_set_id);

ALTER TABLE public.question_set_shares ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helpers — bypass RLS on their internal query so the
-- question_sets <-> question_set_shares policies below don't recurse into
-- each other (this bit us on question_shares/questions; not repeating it).
CREATE OR REPLACE FUNCTION public.is_question_set_creator(p_set_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.question_sets WHERE id = p_set_id AND created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.question_set_shared_with_my_orgs(p_set_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.question_set_shares
    WHERE question_set_id = p_set_id AND org_id = ANY(get_user_org_ids())
  );
$$;

DROP POLICY IF EXISTS "question_set_shares_owner_all" ON public.question_set_shares;
CREATE POLICY "question_set_shares_owner_all" ON public.question_set_shares
  FOR ALL USING (
    is_question_set_creator(question_set_id)
  )
  WITH CHECK (
    is_question_set_creator(question_set_id)
    AND org_id = ANY(get_user_org_ids())
  );

DROP POLICY IF EXISTS "question_set_shares_member_select" ON public.question_set_shares;
CREATE POLICY "question_set_shares_member_select" ON public.question_set_shares
  FOR SELECT USING (org_id = ANY(get_user_org_ids()));

DROP POLICY IF EXISTS "question_set_shares_super_admin_all" ON public.question_set_shares;
CREATE POLICY "question_set_shares_super_admin_all" ON public.question_set_shares
  FOR ALL USING (is_super_admin());

-- Members of the home team can view a set shared with visibility='organization'.
DROP POLICY IF EXISTS "question_sets_org_select" ON public.question_sets;
CREATE POLICY "question_sets_org_select" ON public.question_sets
  FOR SELECT USING (
    visibility = 'organization'
    AND org_id = ANY(get_user_org_ids())
  );

-- Members of any *additionally* shared team can view it too.
DROP POLICY IF EXISTS "question_sets_shared_select" ON public.question_sets;
CREATE POLICY "question_sets_shared_select" ON public.question_sets
  FOR SELECT USING (
    question_set_shared_with_my_orgs(id)
  );
