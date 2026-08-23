-- Lets a teacher set a custom total score for an assignment and split it
-- across questions unevenly (e.g. 20 questions worth 10 points total = 0.5
-- each by default, adjustable per question). NULL means "use each
-- question's own structural point value" — the pre-existing behavior, so
-- every assignment created before this feature keeps grading exactly as
-- before. Keyed by question_id (text, not uuid, since dangling ids from a
-- since-deleted question should not break the map).
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS question_points jsonb;
