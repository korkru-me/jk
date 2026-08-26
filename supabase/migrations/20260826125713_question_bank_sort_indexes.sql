-- Indexes for the orders the คลังโจทย์ can now be listed in.
--
-- The bank used to have exactly one order, newest first, which
-- `idx_questions_creator_created_at` already covers. A teacher can now ask for
-- วันที่แก้ไขล่าสุด or ชื่อโจทย์ instead, and without an index those read the
-- whole of that teacher's bank and sort it in memory on every page turn — for
-- 24 rows on screen.
--
-- Both columns are ordered ASC here and the queries break ties on `id` in the
-- same direction as the sort key, so one index serves both ends of its sort:
-- Postgres scans it backwards for the other direction. That is the reason the
-- tiebreaker in `lib/question-sort.ts` follows the key instead of always
-- running DESC.
--
-- ระดับความยาก and ประเภทโจทย์ deliberately get no index. They are enums with
-- four and nine values, so an index over them can only point at "roughly a
-- quarter of this teacher's bank" — the planner would sort anyway, and each
-- extra index is paid for on every question saved.
--
-- Nor does the แชร์ในทีม list get its own. It is filtered by org_id rather than
-- created_by, so these indexes do not serve it -- but a team's shared list is a
-- fraction of a personal bank, and its two extra orders (by author, by team)
-- sort on a joined table, which no index on `questions` could help with anyway.

CREATE INDEX IF NOT EXISTS idx_questions_creator_updated_at
  ON public.questions(created_by, updated_at, id);

CREATE INDEX IF NOT EXISTS idx_questions_creator_title
  ON public.questions(created_by, title, id);
