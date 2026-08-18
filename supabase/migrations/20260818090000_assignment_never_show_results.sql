ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_show_results_check;

ALTER TABLE assignments
  ADD CONSTRAINT assignments_show_results_check
  CHECK (show_results IN ('immediate', 'after_due', 'never'));
