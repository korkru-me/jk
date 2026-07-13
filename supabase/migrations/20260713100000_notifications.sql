-- Minimal in-app notification inbox. No email/SMS infra exists in this repo,
-- so this is the sole delivery channel for reminders/invites for now.
-- Deliberately no INSERT policy: rows are written exclusively via
-- createAdminClient() from trusted server actions (service role bypasses
-- RLS), same privileged-write pattern already used in lib/actions/classrooms.ts.

CREATE TABLE IF NOT EXISTS public.notifications (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id               uuid REFERENCES public.users(id) ON DELETE SET NULL,
  type                   text NOT NULL CHECK (type IN ('assignment_reminder', 'co_teacher_invite', 'extension_granted')),
  title                  text NOT NULL,
  body                   text,
  link                   text,
  related_assignment_id  uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  related_classroom_id   uuid REFERENCES public.classrooms(id) ON DELETE CASCADE,
  is_read                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications(recipient_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_recipient_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "notifications_recipient_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "notifications_recipient_delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());
