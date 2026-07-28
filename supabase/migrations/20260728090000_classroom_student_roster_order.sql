-- Lets a homeroom advisor set a custom display order for students in a
-- classroom roster (e.g. matching the school's official roll-call order),
-- independent of any other field.
ALTER TABLE public.classroom_students
  ADD COLUMN IF NOT EXISTS roster_order integer;
