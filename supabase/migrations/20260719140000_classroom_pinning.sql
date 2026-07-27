-- Lets a teacher pin a subject classroom so it sorts first on their
-- /classrooms list. Nullable timestamp (not a boolean) so multiple pins
-- order by most-recently-pinned first.
ALTER TABLE public.classrooms
  ADD COLUMN pinned_at timestamptz NULL;
