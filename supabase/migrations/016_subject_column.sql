-- =============================================================================
-- Migration 016: Add subject column to questions
-- =============================================================================

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS subject TEXT NULL;

CREATE INDEX IF NOT EXISTS questions_subject_idx ON public.questions(subject)
  WHERE subject IS NOT NULL;
