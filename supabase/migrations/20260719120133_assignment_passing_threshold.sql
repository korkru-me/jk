-- Per-assignment passing score, opt-in (both null = no threshold set, no
-- pass/fail UI shown anywhere). Teacher picks either an absolute score
-- ('score') or a percentage of max_score ('percent').
ALTER TABLE public.assignments
  ADD COLUMN passing_type  text CHECK (passing_type IN ('score', 'percent')),
  ADD COLUMN passing_value numeric CHECK (passing_value >= 0);
