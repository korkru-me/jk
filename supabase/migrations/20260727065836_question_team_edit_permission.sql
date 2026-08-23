-- Lets a question's creator decide whether teammates who can see a shared
-- question (via org_id or question_shares) may also edit it, not just view it.
-- Default true so existing shared questions behave the same as before.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS team_edit_allowed boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "questions_team_editor_update" ON public.questions;
CREATE POLICY "questions_team_editor_update" ON public.questions
  FOR UPDATE USING (
    team_edit_allowed = true
    AND (
      question_shared_with_my_orgs(id)
      OR (
        org_id = ANY(get_user_org_ids())
        AND visibility IN ('organization', 'school')
      )
    )
  )
  WITH CHECK (
    team_edit_allowed = true
    AND (
      question_shared_with_my_orgs(id)
      OR (
        org_id = ANY(get_user_org_ids())
        AND visibility IN ('organization', 'school')
      )
    )
  );
