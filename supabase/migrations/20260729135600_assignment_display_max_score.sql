-- Lets a teacher rescale the *reported* max score of an assignment
-- independently from its actual point structure — e.g. questions add up to
-- 15 structural points, but the teacher wants it recorded/shown as "out of
-- 10" in the gradebook. Unlike question_points (which is frozen into each
-- submission at attempt-start time, so edits only affect future attempts),
-- display_max_score is applied at read time as a proportional rescale of
-- each submission's already-stored total_score/max_score. That means it can
-- be changed at any point — including after students have already
-- completed the assignment — and the change applies retroactively to every
-- existing submission without needing to touch stored data.
-- NULL means "show the raw structural total" (the pre-existing behavior).
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS display_max_score numeric
  CHECK (display_max_score IS NULL OR display_max_score > 0);
