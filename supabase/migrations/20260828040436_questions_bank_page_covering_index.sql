-- คลังโจทย์ opens on one query that returns 24 rows and counts all 883, and
-- that query is what the page waits on: ~500ms of its ~866ms, measured on the
-- server with the other two reads of that wave (the team tab, the tag list)
-- running alongside it at ~320ms each.
--
-- Fixing the RLS quals (20260828032257) took the per-row cost from ~0.73ms to
-- ~0.53ms, which says the policies are no longer the whole story: something
-- still has to be fetched for every row the query walks. The remaining
-- candidate is the heap. Nothing indexes the columns this query filters and
-- orders on together, and the two policies that survive still read `visibility`
-- and `org_id`, so each row means a trip to the table itself.
--
-- So: an index that carries all of it. The partial predicate is the bank's own
-- definition of a listable row, the key is exactly what the list filters and
-- orders by, and the two RLS columns ride along in INCLUDE so a scan can answer
-- without touching the heap at all.
--
-- This is deliberately the smallest kind of database change there is. An index
-- cannot alter what a query returns — only how fast it is answered — so the
-- worst case is that the planner ignores it and we drop it again:
--
--     DROP INDEX IF EXISTS public.idx_questions_bank_page;
--
-- Written as a plain CREATE INDEX rather than CONCURRENTLY because migrations
-- run inside a transaction, which CONCURRENTLY cannot. The table is small
-- enough that the write lock is measured in milliseconds; revisit that if
-- questions ever grows by orders of magnitude.
--
-- idx_questions_creator_created_at stays. It still serves every query that
-- wants a teacher's questions in date order without the bank's own filter —
-- the pickers, the dashboard — and this one cannot answer those, because a
-- partial index only applies where its predicate is implied.

CREATE INDEX IF NOT EXISTS idx_questions_bank_page
  ON public.questions (created_by, created_at DESC, id DESC)
  INCLUDE (visibility, org_id)
  WHERE is_research_snapshot = false
    AND (group_id IS NULL OR order_in_group = 0);
