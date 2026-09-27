-- The S5 cleanup RPC already requires student_work_artifacts:org_id to prove
-- that a synthetic personal organization has no children.  Its fixed field
-- allowlist omitted that same column, so the otherwise exact closure was
-- rejected before any deletion.  Patch only that literal in the previously
-- installed function and fail closed if its source is not the reviewed shape.

do $$
declare
  v_definition text;
  v_old text := $old$('student_work_artifacts','submission_answer_id'),
          ('submission_answers','submission_id')$old$;
  v_new text := $new$('student_work_artifacts','submission_answer_id'),('student_work_artifacts','org_id'),
          ('submission_answers','submission_id')$new$;
begin
  select pg_catalog.pg_get_functiondef(proc.oid)
    into strict v_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'seb_s5_delete_exact_cleanup_target'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_qa_namespace text, p_request jsonb';

  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old)
    or position(v_new in v_definition) <> 0
  then
    raise exception 'unexpected SEB S5 cleanup function source' using errcode = '55000';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;

  select pg_catalog.pg_get_functiondef(proc.oid)
    into strict v_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'seb_s5_delete_exact_cleanup_target'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_qa_namespace text, p_request jsonb';

  if length(v_definition) - length(replace(v_definition, v_new, '')) <> length(v_new)
    or position(v_old in v_definition) <> 0
  then
    raise exception 'SEB S5 cleanup function patch verification failed' using errcode = '55000';
  end if;
end
$$;
