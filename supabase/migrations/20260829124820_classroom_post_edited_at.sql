-- "(แก้ไขแล้ว)" next to an announcement used to be derived from
-- `updated_at <> created_at`, which is not what it says. A blanket
-- BEFORE UPDATE trigger bumps `updated_at` on every write to the row, so
-- pinning an announcement — a filing action that changes nothing a student
-- reads — told the whole class the teacher had rewritten it.
--
-- The marker gets its own column, written only where an edit actually
-- happens (updateClassroomPost). Existing rows start NULL: a post edited
-- before today loses its marker, which is the safe direction — the alternative
-- is keeping a claim we cannot tell apart from a pin.
ALTER TABLE public.classroom_posts
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;
