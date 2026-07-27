-- How to reconcile a student's score across multiple attempts (max_attempts
-- can now exceed 1 for exercises and exams alike): keep the best attempt,
-- average all graded attempts, or use the latest attempt. Defaults to the
-- previous implicit behavior (best score, tie-broken by most recent attempt).
ALTER TABLE public.assignments
  ADD COLUMN score_strategy text NOT NULL DEFAULT 'best'
    CHECK (score_strategy IN ('best', 'average', 'latest'));
