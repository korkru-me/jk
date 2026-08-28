-- The previous migration replaced a per-row policy function with an
-- argument-less one and measured no change at all: counting 883 questions went
-- from ~858ms to ~909ms, which is noise. The reason is that an argument-less
-- STABLE function is not, on its own, evaluated once per query. PostgreSQL
-- constant-folds IMMUTABLE functions; a STABLE one is only lifted out of the
-- per-row loop when it sits somewhere the planner turns into an InitPlan — and
-- a scalar subquery is such a place.
--
-- That is precisely the shape 20260819091000_rls_initplan_performance used when
-- it rewrote `auth.uid()` as `(SELECT auth.uid())`. The same wrapper was needed
-- here and was missing, so `my_shared_question_ids()` was still being called
-- once per row, exactly like the function it replaced.
--
-- Both remaining policies on `questions` call a STABLE SECURITY DEFINER
-- function bare, and both are wrapped here:
--
--   questions_org_school_select  get_user_org_ids()        reads organization_members
--   questions_org_shared_select  my_shared_question_ids()  reads question_shares
--
-- Neither predicate changes meaning. `x = ANY(f())` and
-- `x = ANY((SELECT f())::uuid[])` ask the same question of the same rows; only
-- how often f() runs differs.
--
-- The cast is not decoration. `operator ANY (...)` has two forms, and a bare
-- `(SELECT f())` inside it is read as the subquery form — a set of uuid — which
-- fails against a function returning uuid[] with "operator does not exist:
-- uuid = uuid[]". Casting makes it an ordinary array expression again, while
-- the scalar subquery inside still becomes the InitPlan this migration is for.
--
-- Rolling back is two statements, both restoring the bare call:
--
--   ALTER POLICY "questions_org_school_select" ON public.questions
--     USING (visibility IN ('school','organization') AND org_id IS NOT NULL
--            AND org_id = ANY(get_user_org_ids()));
--   ALTER POLICY "questions_org_shared_select" ON public.questions
--     USING (id = ANY(public.my_shared_question_ids()));

ALTER POLICY "questions_org_school_select" ON public.questions
  USING (
    visibility IN ('school', 'organization')
    AND org_id IS NOT NULL
    AND org_id = ANY((SELECT get_user_org_ids())::uuid[])
  );

ALTER POLICY "questions_org_shared_select" ON public.questions
  USING ( id = ANY((SELECT public.my_shared_question_ids())::uuid[]) );
