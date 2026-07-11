-- Migration 013: Organization Invitations
-- Supports both "add by email" and "shareable invite link"

CREATE TABLE IF NOT EXISTS public.org_invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token       text        UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  role        text        NOT NULL DEFAULT 'teacher'
                          CHECK (role IN ('admin', 'teacher', 'student')),
  email       text,
  created_by  uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org   ON public.org_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON public.org_invitations(token);

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_invitations_owner_select" ON public.org_invitations;
CREATE POLICY "org_invitations_owner_select" ON public.org_invitations
  FOR SELECT USING (
    public.is_super_admin()
    OR (org_id = ANY(public.get_user_org_ids()) AND public.get_org_role(org_id) IN ('owner','admin'))
  );

DROP POLICY IF EXISTS "org_invitations_owner_insert" ON public.org_invitations;
CREATE POLICY "org_invitations_owner_insert" ON public.org_invitations
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (org_id = ANY(public.get_user_org_ids()) AND public.get_org_role(org_id) IN ('owner','admin'))
  );

DROP POLICY IF EXISTS "org_invitations_owner_delete" ON public.org_invitations;
CREATE POLICY "org_invitations_owner_delete" ON public.org_invitations
  FOR DELETE USING (
    public.is_super_admin()
    OR (org_id = ANY(public.get_user_org_ids()) AND public.get_org_role(org_id) IN ('owner','admin'))
  );

DROP POLICY IF EXISTS "org_invitations_token_select" ON public.org_invitations;
CREATE POLICY "org_invitations_token_select" ON public.org_invitations
  FOR SELECT USING (used_at IS NULL AND expires_at > now());

DROP POLICY IF EXISTS "org_invitations_mark_used" ON public.org_invitations;
CREATE POLICY "org_invitations_mark_used" ON public.org_invitations
  FOR UPDATE USING (used_at IS NULL AND expires_at > now());
