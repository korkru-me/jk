-- Phase 3 exam-integrity controls:
-- 1. Let an assignment act as a question pool and freeze a smaller random
--    subset into each submission's existing submission_answers snapshot.
-- 2. Let teachers opt into an on-screen, per-attempt identity watermark.

ALTER TABLE public.assignments
  ADD COLUMN random_question_count integer,
  ADD COLUMN exam_watermark_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_random_question_count_valid
  CHECK (
    random_question_count IS NULL
    OR random_question_count BETWEEN 1 AND cardinality(question_ids)
  );

COMMENT ON COLUMN public.assignments.random_question_count IS
  'Optional number of questions sampled from question_ids when a new attempt starts. The sampled rows are frozen in submission_answers.';

COMMENT ON COLUMN public.assignments.exam_watermark_enabled IS
  'Shows a browser-level identity/attempt watermark during an online exam. This is a screenshot deterrent, not an OS-level prevention boundary.';
