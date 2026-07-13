-- Co-teacher invite links, scoped per-classroom. Mirrors org_invitations'
-- shape (20260510162108_org_invitations.sql) but keyed to a classroom instead
-- of an org, and grants classroom_co_teachers on accept instead of
-- organization_members. No real email sending — same as the existing student
-- invite-panel.tsx, the teacher copies a link and shares it manually.

CREATE TABLE IF NOT EXISTS public.classroom_invitations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid        NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  token        text        UNIQUE NOT NULL
                            DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  permission   text        NOT NULL DEFAULT 'manage' CHECK (permission IN ('admin', 'manage', 'view')),
  email        text,
  created_by   uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_at      timestamptz,
  used_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classroom_invitations_classroom ON public.classroom_invitations(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_invitations_token     ON public.classroom_invitations(token);

ALTER TABLE public.classroom_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classroom_invitations_owner_all" ON public.classroom_invitations
  FOR ALL TO authenticated
  USING (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin'])
  )
  WITH CHECK (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin'])
  );

-- Token holder (not yet a member of anything) must be able to read the invite
-- to see what they're accepting — same shape as org_invitations_token_select
CREATE POLICY "classroom_invitations_token_select" ON public.classroom_invitations
  FOR SELECT TO authenticated
  USING (used_at IS NULL AND expires_at > now());

CREATE POLICY "classroom_invitations_mark_used" ON public.classroom_invitations
  FOR UPDATE TO authenticated
  USING (used_at IS NULL AND expires_at > now());
