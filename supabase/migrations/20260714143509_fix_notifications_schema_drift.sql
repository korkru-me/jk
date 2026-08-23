-- The remote `notifications` table had been created out-of-band with a
-- schema (user_id/message/related_id, different `type` enum) that never
-- matched lib/actions/notifications.ts or the original checked-in migration
-- 20260713100000_notifications.sql (recipient_id/body/link/
-- related_assignment_id/related_classroom_id/org_id). The table had 0 rows
-- in production, so it was safe to drop and recreate matching the code that
-- already reads/writes it, rather than rewriting the app to match the
-- out-of-band schema.
DROP TABLE IF EXISTS public.notifications;

CREATE TABLE public.notifications (
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

CREATE INDEX idx_notifications_recipient
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
