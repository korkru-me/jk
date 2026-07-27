-- =============================================================================
-- Migration: Multi-team question sharing
--
-- A question's `org_id` stays the single, immutable "home" team (unchanged
-- behavior). This adds `question_shares` as an *additional* many-to-many
-- layer so a question can also be made visible to other teams the creator
-- belongs to, without touching org_id/ownership semantics.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.question_shares (
  question_id uuid        NOT NULL REFERENCES public.questions(id)     ON DELETE CASCADE,
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_question_shares_org      ON public.question_shares(org_id);
CREATE INDEX IF NOT EXISTS idx_question_shares_question ON public.question_shares(question_id);

ALTER TABLE public.question_shares ENABLE ROW LEVEL SECURITY;

-- Creator of the question manages its shares; can only share to teams they belong to.
DROP POLICY IF EXISTS "question_shares_owner_all" ON public.question_shares;
CREATE POLICY "question_shares_owner_all" ON public.question_shares
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = question_shares.question_id AND q.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = question_shares.question_id AND q.created_by = auth.uid()
    )
    AND org_id = ANY(get_user_org_ids())
  );

-- Team members can see which questions were shared into their own team
-- (needed so the questions_org_shared_select EXISTS-subquery below resolves).
DROP POLICY IF EXISTS "question_shares_member_select" ON public.question_shares;
CREATE POLICY "question_shares_member_select" ON public.question_shares
  FOR SELECT USING (org_id = ANY(get_user_org_ids()));

DROP POLICY IF EXISTS "question_shares_super_admin_all" ON public.question_shares;
CREATE POLICY "question_shares_super_admin_all" ON public.question_shares
  FOR ALL USING (is_super_admin());

-- Extend question visibility: members of any team a question was shared to can read it.
DROP POLICY IF EXISTS "questions_org_shared_select" ON public.questions;
CREATE POLICY "questions_org_shared_select" ON public.questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.question_shares qs
      WHERE qs.question_id = questions.id AND qs.org_id = ANY(get_user_org_ids())
    )
  );
