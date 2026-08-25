-- Question bank read path, phase 4: let the team tag count start on its own.
--
-- `team_question_tag_uses` took the shared question ids as an argument, so the
-- page had to finish reading `question_shares` before it could ask for the tag
-- list — one round trip strictly behind another for a list the database can
-- work out for itself in the same statement.
--
-- Resolving the share membership here makes the two independent: the page fires
-- the share read and the tag count together and waits once instead of twice.
--
-- `p_question_ids` is kept, and still ORs in, so nothing that already calls with
-- an explicit list changes behaviour. Passing nothing now means "whatever is
-- shared to these organisations", which is what the caller was computing.
--
-- Still SECURITY INVOKER: `question_shares` is read as the caller under its own
-- RLS, exactly as the page's own share query was, so this widens nothing.
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
      OR EXISTS (
        SELECT 1
        FROM public.question_shares s
        WHERE s.question_id = q.id
          AND s.org_id = ANY(p_org_ids)
      )
    )
  GROUP BY public.question_tag_key(t.tag)
$$;
