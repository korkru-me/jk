-- Reading a teacher's own คลัง cost ~0.7ms per row, and the คลังโจทย์ pages
-- read all of it: counting 883 questions took ~860ms, and every list, count and
-- tag read on those pages paid the same rate.
--
-- Measured rather than guessed. The cost is exactly linear in rows scanned
-- (10/50/100/200/883 all land on the same per-row figure), it does not move
-- when the `(group_id IS NULL OR order_in_group = 0)` filter is removed — so no
-- index was missing — and it does not move when the query reads whole jsonb
-- columns instead of counting, so it is not row width, TOAST or transfer. It is
-- fixed CPU per row, which is what an RLS qual costs.
--
-- The qual is this one. `questions` has three permissive SELECT policies, OR'd:
-- `questions_creator_all` compares a cached auth.uid(), `questions_org_school_select`
-- compares an array from the argument-less get_user_org_ids(), and both of those
-- are hoisted to an InitPlan and evaluated once. The third takes the row's own
-- primary key:
--
--     questions_org_shared_select USING ( question_shared_with_my_orgs(id) )
--
-- Every row is a distinct argument, so nothing can be hoisted and nothing can be
-- reused between rows: 883 rows meant 883 SECURITY DEFINER calls, each setting
-- up its own search_path and subquery against question_shares. By contrast
-- submission_answers, which has more rows and also a per-row policy function,
-- costs a quarter as much per row — its function takes submission_id, which
-- repeats across many rows.
--
-- So ask the same question once instead of per row. The set of questions shared
-- with my orgs does not depend on which row is being checked, so it can be an
-- argument-less STABLE function, hoisted to an InitPlan exactly like
-- get_user_org_ids() was in 20260819091000_rls_initplan_performance.
--
-- SECURITY DEFINER is kept for the reason 20260727063733 introduced it: the
-- straightforward version of this policy recursed, because reading
-- question_shares invokes its own policy, which reads questions. Bypassing RLS
-- inside the function still breaks that cycle.
--
-- The predicate is unchanged in meaning — same table, same filter, membership
-- instead of EXISTS — and question_shares.question_id is NOT NULL, so there is
-- no null-versus-empty difference between the two forms.
--
-- question_shared_with_my_orgs() is deliberately left in place. Rolling this
-- back is one statement:
--
--     ALTER POLICY "questions_org_shared_select" ON public.questions
--       USING ( question_shared_with_my_orgs(id) );

CREATE OR REPLACE FUNCTION public.my_shared_question_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT qs.question_id
    FROM public.question_shares qs
    WHERE qs.org_id = ANY(get_user_org_ids())
  ), ARRAY[]::uuid[]);
$$;

REVOKE ALL ON FUNCTION public.my_shared_question_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.my_shared_question_ids() TO authenticated;

ALTER POLICY "questions_org_shared_select" ON public.questions
  USING ( id = ANY(public.my_shared_question_ids()) );
