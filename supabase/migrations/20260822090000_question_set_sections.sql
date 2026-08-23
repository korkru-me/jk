-- หัวข้อ (sections) inside a question set: one optional grouping level between
-- a set and its questions, e.g. a "การเคลื่อนที่สองมิติ" set holding
-- "โปรเจกไทล์" and "วงกลม".
--
-- Deliberately a jsonb view over the existing question_ids array rather than
-- its own table: question_ids stays the source of truth for membership and
-- order (assignments, grading, export and print all read it), and the server
-- rewrites it from the sections on every save so the two cannot drift. Sets
-- hold tens of questions, so nothing here needs its own rows, indexes or RLS.
--
-- Shape: [{ "id": "sec_ab12cd34", "title": "โปรเจกไทล์", "question_ids": [uuid, …] }]
-- Invariants (enforced in lib/question-set-sections.ts, not in SQL):
--   * every id in a section also appears in question_ids
--   * no question belongs to two sections
--   * question_ids = sections in order, then whatever no section claimed

ALTER TABLE public.question_sets
  ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Existing sets keep an empty array and behave exactly as before: no section
-- headings anywhere, question_ids untouched.
