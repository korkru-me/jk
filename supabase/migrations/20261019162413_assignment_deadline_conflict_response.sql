-- A stale application revision is HTTP 409, not an engine serialization retry.
-- PostgREST 14 can retry a custom 40001 indefinitely; keep the already-applied
-- base migration immutable and patch only this reviewed function's CAS branch.
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
DO $$
DECLARE
  v_function oid := pg_catalog.to_regprocedure('public.extend_assignment_deadline(uuid,timestamptz,timestamptz,timestamptz)');
  v_before pg_catalog.pg_proc%ROWTYPE;
  v_after pg_catalog.pg_proc%ROWTYPE;
  v_definition text;
  v_expected_definition text;
  v_old text := $old$IF v_assignment.end_at IS DISTINCT FROM p_expected_end_at
    OR v_assignment.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'assignment deadline changed; refresh before extending';
  END IF;$old$;
  v_new text := $new$IF v_assignment.end_at IS DISTINCT FROM p_expected_end_at
    OR v_assignment.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'assignment deadline changed; refresh before extending';
  END IF;$new$;
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'assignment deadline RPC is missing' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO STRICT v_before FROM pg_catalog.pg_proc WHERE oid = v_function;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  IF NOT v_before.prosecdef
    OR v_before.prorettype <> 'jsonb'::pg_catalog.regtype
    OR v_before.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
    OR pg_catalog.strpos(v_definition, 'public.actor_can_manage_grading_assignment') = 0
    OR pg_catalog.strpos(v_definition, 'public.organization_members') = 0
    OR pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_old, '')) <> pg_catalog.length(v_old)
    OR pg_catalog.strpos(v_definition, v_new) <> 0 THEN
    RAISE EXCEPTION 'unexpected assignment deadline RPC definition' USING ERRCODE = '55000';
  END IF;

  v_expected_definition := pg_catalog.replace(v_definition, v_old, v_new);
  EXECUTE v_expected_definition;
  SELECT * INTO STRICT v_after FROM pg_catalog.pg_proc WHERE oid = v_function;
  IF pg_catalog.pg_get_functiondef(v_function) <> v_expected_definition
    OR v_after.proowner IS DISTINCT FROM v_before.proowner
    OR v_after.proacl IS DISTINCT FROM v_before.proacl
    OR v_after.prosecdef IS DISTINCT FROM v_before.prosecdef
    OR v_after.proconfig IS DISTINCT FROM v_before.proconfig THEN
    RAISE EXCEPTION 'assignment deadline RPC patch verification failed' USING ERRCODE = '55000';
  END IF;
END;
$$;
