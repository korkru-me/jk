-- "เรียงตามจำนวนแท็ก" for the คลังโจทย์, and one consequence of adding it.
--
-- PostgREST orders by columns, not expressions, so `array_length(tags, 1)` is
-- not something the bank's query can ask for. A stored generated column is the
-- cheapest way to make it one: Postgres keeps it in step with `tags` itself, so
-- unlike a trigger-maintained counter there is no state that can drift.
--
-- `array_length` returns NULL for an empty array, which would sort untagged
-- questions as "no value" rather than as zero. They are the whole point of the
-- ascending direction ("ยังไม่มีแท็กก่อน" — the bank is 95% untagged), so the
-- coalesce makes them a real 0 that sorts at one end instead of drifting to the
-- bottom of both directions with the nulls.
--
-- No index. `tag_count` runs 0..5 across a bank, so it can only point at "most
-- of it"; the planner sorts either way and each index is paid for on every save.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS tag_count integer
  GENERATED ALWAYS AS (COALESCE(array_length(tags, 1), 0)) STORED;

COMMENT ON COLUMN public.questions.tag_count IS
  'How many tags this question carries. Generated from `tags` by the database; '
  'never write to it. Exists so the คลังโจทย์ can order by it.';

-- ── The updated_at trigger has to be told this is bookkeeping ────────────────
-- `questions_touch_updated_at` decides "was this a real edit?" by comparing the
-- whole row minus the columns that are bookkeeping, so that writing a
-- fingerprint does not report every question in a bank as edited today. A
-- generated column belongs on that list for two reasons: it is derived from
-- `tags`, which is compared already, so it can never be the only thing that
-- changed; and Postgres fills generated columns in *after* BEFORE triggers run,
-- so `NEW.tag_count` here is not the value that will be stored. Left in the
-- comparison, it would differ from OLD on every update and defeat the check
-- entirely -- the next fingerprint backfill would stamp the whole bank.
CREATE OR REPLACE FUNCTION public.questions_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content_fingerprint IS DISTINCT FROM OLD.content_fingerprint
     AND to_jsonb(NEW) - 'content_fingerprint' - 'updated_at' - 'tag_count'
       = to_jsonb(OLD) - 'content_fingerprint' - 'updated_at' - 'tag_count'
  THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;
