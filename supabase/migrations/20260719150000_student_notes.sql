-- Private homeroom-advisor notes about a student (health, family, behavior),
-- kept separate from grades. Deliberately no RLS policies for `authenticated`
-- (RLS enabled, zero policies = default-deny) — read/write only ever happens
-- via createAdminClient() from lib/actions/homeroom-notes.ts after an
-- explicit ownership/co-teacher check, same privileged-write pattern as
-- the notifications table.
CREATE TABLE public.student_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_notes_classroom_student
  ON public.student_notes(classroom_id, student_id, created_at DESC);

ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;
