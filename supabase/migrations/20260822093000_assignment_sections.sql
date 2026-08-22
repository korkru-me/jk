-- Snapshot of the หัวข้อ an assignment's questions came from.
--
-- Frozen at creation exactly like question_ids: editing the source แฟ้มโจทย์
-- afterwards must never change an exam students are already taking. NULL (the
-- default, and what every existing assignment keeps) means "no headings",
-- which is the behaviour before this column existed.
--
-- Shape matches question_sets.sections:
--   [{ "id": "sec_ab12cd34", "title": "โปรเจกไทล์", "question_ids": [uuid, …] }]
-- Only ids that are also in this assignment's question_ids ever get stored —
-- the server filters them on write (lib/actions/assignments.ts).

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS sections jsonb,
  -- A teacher can group for their own sake and still hand out a plain
  -- numbered list, so showing the หัวข้อ is a separate decision per งาน.
  ADD COLUMN IF NOT EXISTS show_sections boolean NOT NULL DEFAULT true;
