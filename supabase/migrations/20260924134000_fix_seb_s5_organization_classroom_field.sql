-- Complete the organization-child allowlist for the classrooms:org_id proof.
-- As with the preceding patch, mutate only the exact reviewed function text
-- and abort if the installed source has drifted.

do $$
declare
  v_definition text;
  v_old text := $old$('questions','parent_question_id'),('questions','org_id'),
          ('classroom_co_teachers','classroom_id')$old$;
  v_new text := $new$('questions','parent_question_id'),('questions','org_id'),
          ('classrooms','org_id'),('classroom_co_teachers','classroom_id')$new$;
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
