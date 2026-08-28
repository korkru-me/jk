-- Follow-up to 20260828064828, which cleared `require_work_image` only where
-- leaving it on would have changed what students see today.
--
-- That left the งาน holding no เติมคำตอบตัวเลข question at all: the column
-- cannot affect them, so the backfill deliberately skipped them, and 9 of them
-- still carry the old `true` default nobody ever chose. They are inert only
-- while their question list stays as it is — the moment a teacher edits one and
-- adds a numeric question, the edit form reads that stale `true` and opens with
-- the switch already on, which is exactly the default the new flow promises not
-- to have. The งาน then starts demanding photos on a setting the teacher never
-- made.
--
-- So: switch off every งาน that is not actually enforcing anything. `true`
-- survives only where at least one เติมคำตอบตัวเลข question in the งาน carried
-- the old per-question flag — the งาน that really were requiring photos before
-- this change, and the ones 20260828064828 deliberately preserved.
UPDATE public.assignments a
SET require_work_image = false
WHERE a.require_work_image
  AND NOT EXISTS (
    SELECT 1
    FROM public.questions q
    WHERE q.id = ANY (a.question_ids)
      AND q.question_type = 'written'
      AND q.requires_work_image
  );
