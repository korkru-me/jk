-- Assignment type: exercise (multi-attempt) vs exam (single-attempt, existing behavior)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'exam'
    CHECK (type IN ('exercise', 'exam'));

CREATE INDEX IF NOT EXISTS idx_assignments_type ON public.assignments(type);

-- Multi-attempt support for submissions (exercises may be retried; exams stay single-attempt)
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1;

ALTER TABLE public.submissions
  DROP CONSTRAINT IF EXISTS submissions_assignment_id_student_id_key;

ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_assignment_student_attempt_key
    UNIQUE (assignment_id, student_id, attempt_number);

-- The old 2-column unique constraint also served as the lookup index for
-- "does this student have a submission for this assignment" — replace it
-- explicitly since the new 3-column unique constraint doesn't cover that.
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_student
  ON public.submissions(assignment_id, student_id);
