-- Question bank read path, phase 2: search the words a teacher can actually
-- see, through an index.
--
-- Two problems, one cause. The bank searched `question_text` raw, which is
-- TipTap HTML:
--
--   * a query could match markup. Typing "span" or "class" reached questions
--     whose body says nothing of the sort, because the tag names are in the
--     column being searched.
--   * a phrase could not match across a tag. "แรงเสียดทาน" with the middle
--     three characters bolded is stored as แรง<strong>เสียด</strong>ทาน, and
--     `ILIKE '%แรงเสียดทาน%'` never sees it.
--
-- The browser side never had either problem: `matchesSearch()` in
-- lib/question-search.ts strips the markup with `questionExcerpt()` first. The
-- two sides have simply disagreed about what a question says, and the pickers
-- (which filter in the browser) have been the more correct of the two.
--
-- `search_text` stores what `questionExcerpt()` produces, so the database now
-- searches the same string the browser does — and, being a plain text column,
-- it can carry a trigram index, which HTML in a `text` column could not.

-- pg_trgm rather than tsvector: Postgres ships no Thai dictionary, so
-- `to_tsvector` cannot find word boundaries in Thai at all. Trigrams work on
-- characters and need no segmentation, which is what makes them the right index
-- for a Thai question bank searched by substring.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- The generated expression mirrors `questionExcerpt()` step for step, in the
-- same order — entity decoding included, with &amp; last so that "&amp;lt;"
-- decodes to "&lt;" and not to "<".
--
-- STORED and GENERATED rather than a trigger: Postgres then guarantees the
-- column is a pure function of the row, and no write path can set it wrong or
-- forget it. Every function below is IMMUTABLE, which is what makes that legal.
--
-- Exact byte-equality with the TypeScript is not what this relies on. Search
-- terms are split on whitespace before they are used, so no term can contain a
-- space, and a disagreement about how many spaces sit between two words cannot
-- change whether a term is found. What has to match is the words themselves.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    lower(
      btrim(
        regexp_replace(
          coalesce(title, '') || ' ' ||
          replace(
            regexp_replace(
              replace(
                replace(
                  replace(
                    regexp_replace(coalesce(question_text, ''), '<[^>]*>', ' ', 'g'),
                    '&nbsp;', ' '),
                  '&lt;', '<'),
                '&gt;', '>'),
              '&#0?39;', '''', 'g'),
            '&amp;', '&'),
          '[[:space:]]+', ' ', 'g')))
  ) STORED;

COMMENT ON COLUMN public.questions.search_text IS
  'Lowercased, markup-stripped title + body — the same string questionExcerpt() '
  'builds in lib/question-search.ts. Generated, so it cannot drift from the row. '
  'Searched instead of question_text so that a query matches what a teacher '
  'reads rather than the HTML around it.';

-- `%คำค้น%` cannot use a b-tree at all. GIN over trigrams is the index built for
-- exactly this pattern.
--
-- A query shorter than three characters has no full trigram to look up and
-- falls back to a scan — but a scan of this column, which holds the readable
-- text, not of the HTML it was extracted from.
CREATE INDEX IF NOT EXISTS idx_questions_search_text_trgm
  ON public.questions USING gin (search_text gin_trgm_ops);

-- Phase 1 taught this trigger that writing a fingerprint is bookkeeping rather
-- than an edit. `search_text` is generated, so Postgres recomputes it whenever
-- the body changes and it can never be the *only* thing that changed — but it
-- does appear in to_jsonb(NEW), so it has to come out of the comparison or a
-- fingerprint-only write would look like a content change again and start
-- stamping updated_at, which the ประวัติ tab reads back as "แก้ไขล่าสุด".
CREATE OR REPLACE FUNCTION public.questions_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content_fingerprint IS DISTINCT FROM OLD.content_fingerprint
     AND to_jsonb(NEW) - 'content_fingerprint' - 'search_text' - 'updated_at'
       = to_jsonb(OLD) - 'content_fingerprint' - 'search_text' - 'updated_at'
  THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;
