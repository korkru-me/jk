-- Lets a teacher set a custom column order for assignments in a classroom's
-- scores/submissions matrix (e.g. move a recent exam to the front), separate
-- per classroom since the same assignment can be linked to several
-- classrooms via assignment_classrooms. Mirrors classroom_students.roster_order.
ALTER TABLE public.assignment_classrooms
  ADD COLUMN IF NOT EXISTS display_order integer;
