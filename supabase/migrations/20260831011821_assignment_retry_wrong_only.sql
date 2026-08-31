-- What a retry re-asks. 'all' rebuilds the whole attempt, which is the only
-- behavior that existed before this column, so it stays the default for every
-- assignment already handed out. 'wrong_only' rebuilds just the questions the
-- previous attempt did not earn full marks on; the rest are copied forward
-- untouched (see submission_answers.carried_over below).
ALTER TABLE public.assignments
  ADD COLUMN retry_scope text NOT NULL DEFAULT 'all'
    CHECK (retry_scope IN ('all', 'wrong_only'));

-- Marks an answer row that was copied from the student's previous attempt
-- rather than answered in this one. A carried row keeps the earlier attempt's
-- answer, score and work images, so the attempt's max_score — and therefore
-- score_strategy, analytics and every "out of" the student sees — stays the
-- same as a full attempt's. It is deliberately excluded from the exam-taking
-- view (the student never sees it again) and from auto-grading on submit,
-- which is what protects a teacher-graded or teacher-adjusted score from
-- being recomputed to zero on a later attempt.
ALTER TABLE public.submission_answers
  ADD COLUMN carried_over boolean NOT NULL DEFAULT false;
