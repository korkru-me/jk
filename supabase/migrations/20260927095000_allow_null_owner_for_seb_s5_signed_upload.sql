-- `prepareExamAttachmentUpload` creates the signed upload URL with the
-- server-side admin client. Supabase can therefore persist a NULL owner_id
-- even though the authenticated student performs uploadToSignedUrl. Keep the
-- S5 proof bound to the exact synthetic student through the deterministic
-- object path, submission, answer reference and QA-account lineage; when
-- Storage does record an owner, it must still be that same student.

do $$
declare
  v_definition text;
  v_owner_old text := $old$    if v_object_owner_id is null
      or v_object_owner_id <> v_owner_id::text
      or v_size > 10485760$old$;
  v_owner_new text := $new$    if (v_object_owner_id is not null
        and v_object_owner_id <> v_owner_id::text)
      or v_size > 10485760$new$;
begin
  select pg_catalog.pg_get_functiondef(proc.oid)
    into strict v_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'seb_s5_attest_storage_object'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid) =
      'p_schema_version integer, p_qa_namespace text, p_bucket_name text, p_path text';

  if length(v_definition) - length(replace(v_definition, v_owner_old, ''))
      <> length(v_owner_old)
    or position(v_owner_new in v_definition) <> 0
  then
    raise exception 'unexpected SEB S5 signed-upload owner source'
      using errcode = '55000';
  end if;

  v_definition := replace(v_definition, v_owner_old, v_owner_new);
  execute v_definition;

  select pg_catalog.pg_get_functiondef(proc.oid)
    into strict v_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'seb_s5_attest_storage_object'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid) =
      'p_schema_version integer, p_qa_namespace text, p_bucket_name text, p_path text';

  if length(v_definition) - length(replace(v_definition, v_owner_new, ''))
      <> length(v_owner_new)
    or position(v_owner_old in v_definition) <> 0
  then
    raise exception 'SEB S5 signed-upload owner patch verification failed'
      using errcode = '55000';
  end if;
end
$$;
