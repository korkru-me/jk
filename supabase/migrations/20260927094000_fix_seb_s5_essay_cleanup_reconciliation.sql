-- The live S5 fixture stores constructed-response questions with the current
-- `essay` enum value. The original reconciliation RPC still translated the
-- harness resource type to the legacy `written` value, so it could not adopt
-- an answer after a partially failed browser step. Patch only the two reviewed
-- predicates and fail closed if the installed function differs.

do $$
declare
  v_definition text;
  v_question_old text := $old$then 'written' else 'file_upload' end$old$;
  v_question_new text := $new$then 'essay' else 'file_upload' end$new$;
begin
  select pg_catalog.pg_get_functiondef(proc.oid)
    into strict v_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'seb_s5_find_exact_run_targets'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_criteria jsonb';

  if length(v_definition) - length(replace(v_definition, v_question_old, ''))
      <> 2 * length(v_question_old)
    or position(v_question_new in v_definition) <> 0
  then
    raise exception 'unexpected SEB S5 essay reconciliation source'
      using errcode = '55000';
  end if;

  v_definition := replace(v_definition, v_question_old, v_question_new);
  execute v_definition;

  select pg_catalog.pg_get_functiondef(proc.oid)
    into strict v_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'seb_s5_find_exact_run_targets'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_criteria jsonb';

  if length(v_definition) - length(replace(v_definition, v_question_new, ''))
      <> 2 * length(v_question_new)
    or position(v_question_old in v_definition) <> 0
  then
    raise exception 'SEB S5 essay reconciliation patch verification failed'
      using errcode = '55000';
  end if;
end
$$;
