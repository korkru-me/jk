-- Per-question requires_work_image is set on the question itself, but a
-- teacher assembling an exam from questions they don't own/control (shared
-- sets etc.) may want to opt out of enforcing it for this particular
-- assignment without touching the underlying question. Asked at
-- assignment-creation time (only relevant when the selected questions
-- include at least one with requires_work_image = true); defaults to true
-- (keep enforcing) so behavior is unchanged unless a teacher explicitly
-- opts out.
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS require_work_image boolean NOT NULL DEFAULT true;
