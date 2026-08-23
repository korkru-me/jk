-- Allow questions.org_id to become NULL when its team org is deleted, instead of
-- cascading the delete onto the question itself. Also exempt questions from the
-- generic org_id-immutability trigger (classrooms/assignments/submissions keep it),
-- since a question's org_id must be settable when a teacher shares it to a team.

ALTER TABLE public.questions ALTER COLUMN org_id DROP NOT NULL;

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_org_id_fkey;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS prevent_org_id_change ON public.questions;
;
