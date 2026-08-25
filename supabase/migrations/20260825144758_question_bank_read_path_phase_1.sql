-- Question bank read path, phase 1: stop the list from doing work that grows
-- with the size of the bank.
--
-- Opening คลังโจทย์, typing a search, or clicking a tag all re-render the same
-- server page, and every one of those renders was paying for two whole-bank
-- passes plus two unindexed lookups. Nothing here changes what a teacher sees;
-- it changes how much the database has to touch to answer the same question.

-- ── 1. Item analysis stopped scanning submission_answers ──────────────────────
-- app/(app)/questions/page.tsx reads stats with `question_id IN (...)`, but the
-- only index on this table leads with submission_id, so that filter fell back to
-- a sequential scan of every answer ever submitted in the system. The bank is
-- capped at 24 rows a page; the scan behind it was not, and it grows with every
-- attempt any student makes.
CREATE INDEX IF NOT EXISTS idx_submission_answers_question
  ON public.submission_answers(question_id);

-- ── 2. Tag filtering and tag search use an index ──────────────────────────────
-- Clicking a tag runs `tags @> ARRAY[...]` and the search resolves words with
-- `tags && ARRAY[...]`. Neither operator can use a b-tree, so both were linear
-- in the bank. GIN is the index type those array operators are built for.
CREATE INDEX IF NOT EXISTS idx_questions_tags_gin
  ON public.questions USING gin(tags);

-- ── 3. Duplicate detection reads a fingerprint instead of the whole bank ──────
-- Finding "โจทย์ซ้ำ" meant pulling id + question_text for every question the
-- teacher owns on every single render — megabytes of TipTap HTML over the wire,
-- then a regex pass over all of it, to draw a badge that is usually absent.
--
-- The fingerprint is a SHA-256 of the canonical content built by
-- `questionFingerprint()` in lib/question-content-match.ts. It stays in
-- TypeScript rather than being reimplemented here on purpose: that function
-- sorts object keys, drops browser-minted `id` fields, and collapses empty
-- string/array/object/null into one form. Two implementations of those rules
-- would drift, and the TypeScript one is already the tested source of truth.
--
-- Nullable by design. A row whose fingerprint has not been written yet simply
-- has no duplicate information, which renders exactly as it does today: no
-- badge. A missed write path costs a warning, never correctness.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS content_fingerprint text;

COMMENT ON COLUMN public.questions.content_fingerprint IS
  'SHA-256 of questionFingerprint() in lib/question-content-match.ts. Written by '
  'the server actions that save a question and backfilled by '
  'scripts/backfill-content-fingerprint.mjs. NULL means "not computed yet" and '
  'suppresses the duplicate badge rather than claiming a question is unique.';

-- Duplicate counting always asks "which of *this teacher's* questions share this
-- fingerprint", so created_by leads. Partial, because rows still awaiting a
-- backfill are never a lookup target.
CREATE INDEX IF NOT EXISTS idx_questions_creator_fingerprint
  ON public.questions(created_by, content_fingerprint)
  WHERE content_fingerprint IS NOT NULL;

-- ── 4. Writing a fingerprint is bookkeeping, not an edit ──────────────────────
-- `questions_updated_at` stamps now() on every UPDATE, and the ประวัติ tab of the
-- preview modal reads that column back as "แก้ไขล่าสุด". Backfilling a column
-- through it would tell every teacher that every question in their bank was
-- edited on the day this shipped, which is simply untrue.
--
-- So a write that changes nothing but the fingerprint keeps the timestamp it
-- had. Saving a question changes its content *and* its fingerprint together and
-- still stamps now(), which is the behaviour that already exists. Only the
-- questions table needs this distinction, so it gets its own function and
-- `update_updated_at()` is left alone for every other table that shares it.
CREATE OR REPLACE FUNCTION public.questions_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content_fingerprint IS DISTINCT FROM OLD.content_fingerprint
     AND to_jsonb(NEW) - 'content_fingerprint' - 'updated_at'
       = to_jsonb(OLD) - 'content_fingerprint' - 'updated_at'
  THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questions_updated_at ON public.questions;
CREATE TRIGGER questions_updated_at
  BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.questions_touch_updated_at();
