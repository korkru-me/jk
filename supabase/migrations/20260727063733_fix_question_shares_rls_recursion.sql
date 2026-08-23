-- The straightforward EXISTS-subquery version of these policies caused mutual
-- infinite recursion: questions_org_shared_select queries question_shares,
-- whose own policy queries questions, whose policy queries question_shares...
-- SECURITY DEFINER functions bypass RLS on their internal query, breaking the cycle.

CREATE OR REPLACE FUNCTION public.is_question_creator(p_question_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.questions WHERE id = p_question_id AND created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.question_shared_with_my_orgs(p_question_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.question_shares
    WHERE question_id = p_question_id AND org_id = ANY(get_user_org_ids())
  );
$$;

DROP POLICY IF EXISTS "question_shares_owner_all" ON public.question_shares;
CREATE POLICY "question_shares_owner_all" ON public.question_shares
  FOR ALL USING (
    is_question_creator(question_id)
  )
  WITH CHECK (
    is_question_creator(question_id)
    AND org_id = ANY(get_user_org_ids())
  );

DROP POLICY IF EXISTS "questions_org_shared_select" ON public.questions;
CREATE POLICY "questions_org_shared_select" ON public.questions
  FOR SELECT USING (
    question_shared_with_my_orgs(id)
  );
