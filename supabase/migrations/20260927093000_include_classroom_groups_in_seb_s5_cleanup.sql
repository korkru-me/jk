-- Classroom groups were added after the fail-closed S5 cleanup RPC. Extend
-- only the reviewed classroom cleanup graph so the synthetic fixture can be
-- deleted after proving that it owns no groups. Any other schema drift still
-- blocks cleanup.

do $$
declare
  v_definition text;
  v_lock_old text := $old$    lock table public.assignment_classrooms, public.assignments,
      public.classroom_co_teachers, public.classroom_invitations,$old$;
  v_lock_new text := $new$    lock table public.assignment_classrooms, public.assignments,
      public.classroom_groups, public.classroom_co_teachers, public.classroom_invitations,$new$;
  v_signature_old text := $old$      'assignments:classroom_id.eq',
      'classroom_co_teachers:classroom_id.eq',$old$;
  v_signature_new text := $new$      'assignments:classroom_id.eq',
      'classroom_groups:classroom_id.eq',
      'classroom_co_teachers:classroom_id.eq',$new$;
  v_fk_old text := $old$      'assignments(classroom_id)->classrooms(id):c',
      'classroom_co_teachers(classroom_id)->classrooms(id):c',$old$;
  v_fk_new text := $new$      'assignments(classroom_id)->classrooms(id):c',
      'classroom_groups(classroom_id)->classrooms(id):c',
      'classroom_co_teachers(classroom_id)->classrooms(id):c',$new$;
  v_field_old text := $old$          ('classrooms','org_id'),('classroom_co_teachers','classroom_id'),('classroom_invitations','classroom_id'),('classroom_posts','classroom_id'),('classroom_students','classroom_id'),$old$;
  v_field_new text := $new$          ('classrooms','org_id'),('classroom_groups','classroom_id'),('classroom_co_teachers','classroom_id'),('classroom_invitations','classroom_id'),('classroom_posts','classroom_id'),('classroom_students','classroom_id'),$new$;
begin
  select pg_catalog.pg_get_functiondef(proc.oid)
    into strict v_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'seb_s5_delete_exact_cleanup_target'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_qa_namespace text, p_request jsonb';

  if length(v_definition) - length(replace(v_definition, v_lock_old, '')) <> length(v_lock_old)
    or position(v_lock_new in v_definition) <> 0
  then raise exception 'unexpected SEB S5 classroom-group cleanup source: lock' using errcode = '55000'; end if;
  if length(v_definition) - length(replace(v_definition, v_signature_old, '')) <> length(v_signature_old)
    or position(v_signature_new in v_definition) <> 0
  then raise exception 'unexpected SEB S5 classroom-group cleanup source: signature' using errcode = '55000'; end if;
  if length(v_definition) - length(replace(v_definition, v_fk_old, '')) <> length(v_fk_old)
    or position(v_fk_new in v_definition) <> 0
  then raise exception 'unexpected SEB S5 classroom-group cleanup source: foreign-key' using errcode = '55000'; end if;
  if length(v_definition) - length(replace(v_definition, v_field_old, '')) <> length(v_field_old)
    or position(v_field_new in v_definition) <> 0
  then raise exception 'unexpected SEB S5 classroom-group cleanup source: field' using errcode = '55000'; end if;

  v_definition := replace(v_definition, v_lock_old, v_lock_new);
  v_definition := replace(v_definition, v_signature_old, v_signature_new);
  v_definition := replace(v_definition, v_fk_old, v_fk_new);
  v_definition := replace(v_definition, v_field_old, v_field_new);
  execute v_definition;

  select pg_catalog.pg_get_functiondef(proc.oid)
    into strict v_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'seb_s5_delete_exact_cleanup_target'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_qa_namespace text, p_request jsonb';

  if length(v_definition) - length(replace(v_definition, v_lock_new, '')) <> length(v_lock_new)
    or length(v_definition) - length(replace(v_definition, v_signature_new, '')) <> length(v_signature_new)
    or length(v_definition) - length(replace(v_definition, v_fk_new, '')) <> length(v_fk_new)
    or length(v_definition) - length(replace(v_definition, v_field_new, '')) <> length(v_field_new)
    or position(v_lock_old in v_definition) <> 0
    or position(v_signature_old in v_definition) <> 0
    or position(v_fk_old in v_definition) <> 0
    or position(v_field_old in v_definition) <> 0
  then
    raise exception 'SEB S5 classroom-group cleanup patch verification failed' using errcode = '55000';
  end if;
end
$$;
