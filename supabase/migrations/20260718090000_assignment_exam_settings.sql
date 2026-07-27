-- Real backing columns for the assignment-creation "settings" step
-- (shuffle question order, shuffle MCQ option order, when results become
-- visible), plus attempt limits for exercises and an optional access code
-- for exams. These previously existed only as decorative UI toggles that
-- were never sent to createAssignment().
ALTER TABLE public.assignments
  ADD COLUMN shuffle_questions boolean NOT NULL DEFAULT false,
  ADD COLUMN shuffle_options   boolean NOT NULL DEFAULT false,
  ADD COLUMN show_results      text NOT NULL DEFAULT 'immediate'
    CHECK (show_results IN ('immediate', 'after_due')),
  ADD COLUMN max_attempts      integer,
  ADD COLUMN access_code       text;

-- Per-submission persisted question order (fixes pre-existing bug: question
-- order was never guaranteed to match assignments.question_ids, since
-- startSubmission() fetched via `.in('id', ...)` with no ORDER BY) and,
-- when shuffle_options is on, a persisted permutation of MCQ option indices
-- so the shuffle is stable across reloads/resumes instead of re-randomizing.
ALTER TABLE public.submission_answers
  ADD COLUMN order_index  integer NOT NULL DEFAULT 0,
  ADD COLUMN option_order jsonb;
