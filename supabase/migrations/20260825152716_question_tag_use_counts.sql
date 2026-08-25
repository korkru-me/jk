-- Question bank read path, phase 3: count the tags in the database.
--
-- The คลัง needs its tag list twice on every render — once for the filter chips,
-- once as the universe a typed word is resolved against, because `tags && ...`
-- matches whole array elements and never a substring of one. It was getting
-- that list by reading the `tags` column of every question the teacher owns and
-- tallying them in JavaScript: 883 rows over the wire to produce 25 strings.
--
-- Worse, it is a barrier. `loadOwnQuestions()` cannot build its search filter
-- until the tags are known, so that whole round trip sits in front of the query
-- the page actually exists to run.
--
-- Aggregating where the rows already are returns one row per distinct tag. The
-- scan itself stays proportional to the bank, but it is an indexed scan of one
-- array column inside Postgres rather than a transfer, a JSON parse and a tally
-- in the request handler. At a bank of a few thousand that is the right trade;
-- past roughly fifty thousand a counts table maintained by trigger would earn
-- its complexity, and this is the function that would be replaced.
--
-- SECURITY INVOKER, deliberately. These read `questions` as the caller, so the
-- existing RLS policies decide what is counted and the functions cannot widen
-- anyone's reach — `p_org_ids` and `p_question_ids` below narrow the result,
-- they never grant access to a row the caller could not already select.

-- The identity two spellings of one tag share, matching `tagKey()` in
-- lib/tag-suggest.ts: whitespace collapsed, trimmed, lowercased.
CREATE OR REPLACE FUNCTION public.question_tag_key(p_tag text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(btrim(regexp_replace(p_tag, '[[:space:]]+', ' ', 'g')))
$$;

-- The spelling shown for a tag, matching `normalizeTag()`.
CREATE OR REPLACE FUNCTION public.question_tag_display(p_tag text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(regexp_replace(p_tag, '[[:space:]]+', ' ', 'g'))
$$;

/*
 * How often each of the caller's own tags is used.
 *
 * `count(DISTINCT q.id)` rather than `count(*)`: a question tagged both "ไฟฟ้า"
 * and "ไฟฟ้า " is one use of one tag, not two, which is the rule `dedupeTags()`
 * applies before `rankTagsByUse()` counts. The displayed spelling is the
 * earliest one by question id, so the list does not reshuffle between loads.
 *
 * Ordering is left to the caller: `rankTagsByUse` breaks ties with Thai
 * collation from JavaScript, and that comparator stays in one place rather than
 * being approximated here.
 */
CREATE OR REPLACE FUNCTION public.my_question_tag_uses()
RETURNS TABLE (tag text, uses bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (array_agg(public.question_tag_display(t.tag) ORDER BY q.id))[1],
    count(DISTINCT q.id)
  FROM public.questions q
  CROSS JOIN LATERAL unnest(q.tags) AS t(tag)
  WHERE q.created_by = (SELECT auth.uid())
    AND q.is_research_snapshot = false
  GROUP BY public.question_tag_key(t.tag)
$$;

/*
 * The same, over the questions the team tab shows: those a team owns, plus
 * those shared into one. The page already works out both lists to build its
 * own query, so it passes them in rather than having this restate the union.
 *
 * RLS still applies on top, so a caller who names an organisation they do not
 * belong to simply counts nothing.
 */
CREATE OR REPLACE FUNCTION public.team_question_tag_uses(
  p_org_ids uuid[],
  p_question_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (tag text, uses bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (array_agg(public.question_tag_display(t.tag) ORDER BY q.id))[1],
    count(DISTINCT q.id)
  FROM public.questions q
  CROSS JOIN LATERAL unnest(q.tags) AS t(tag)
  WHERE q.is_research_snapshot = false
    AND (
      (q.org_id = ANY(p_org_ids) AND q.visibility IN ('organization', 'school'))
      OR q.id = ANY(p_question_ids)
    )
  GROUP BY public.question_tag_key(t.tag)
$$;

REVOKE ALL ON FUNCTION public.my_question_tag_uses() FROM public;
REVOKE ALL ON FUNCTION public.team_question_tag_uses(uuid[], uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.my_question_tag_uses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_question_tag_uses(uuid[], uuid[]) TO authenticated;
