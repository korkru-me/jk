-- Creator always manages their own questions, regardless of org_id (which can now be
-- NULL after their team org is deleted, or no longer in their org list after leaving).
DROP POLICY IF EXISTS "questions_creator_all" ON public.questions;
CREATE POLICY "questions_creator_all" ON public.questions
  FOR ALL USING (created_by = auth.uid());

-- Org members can read 'school' (legacy) or 'organization' (team) visibility questions
-- that belong to an org they currently belong to.
DROP POLICY IF EXISTS "questions_org_school_select" ON public.questions;
CREATE POLICY "questions_org_school_select" ON public.questions
  FOR SELECT USING (
    visibility IN ('school', 'organization')
    AND org_id IS NOT NULL
    AND org_id = ANY(get_user_org_ids())
  );
;
