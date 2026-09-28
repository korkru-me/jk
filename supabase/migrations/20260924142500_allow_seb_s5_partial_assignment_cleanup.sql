-- A browser/native failure can happen after the synthetic assignment and its
-- classroom join are committed but before any immutable SEB revision/release
-- exists.  Permit exactly that partial graph to be removed while retaining
-- the same reservation, owner-lineage, creation-window, locking, FK-drift and
-- zero-dependency proofs as the complete assignment path.

do $$
declare
  v_definition text;
  v_graph_old text := $old$      'teaching_boards(assignment_id)->assignments(id):c'
    ];
  elsif v_parent_table = 'questions' then$old$;
  v_graph_new text := $new$      'teaching_boards(assignment_id)->assignments(id):c'
    ];
    if v_cascades = '["assignment_classrooms"]'::jsonb then
      v_expected_signatures := array[
        'assignment_extensions:assignment_id.eq',
        'education_research_measurements:assignment_id.eq',
        'exam_android_approvals:assignment_id.eq',
        'exam_proctor_connections:assignment_id.eq',
        'exam_proctor_events:assignment_id.eq',
        'exam_proctor_sessions:assignment_id.eq',
        'exam_seb_checkins:assignment_id.eq',
        'ioc_forms:assignment_id.eq',
        'notifications:related_assignment_id.eq',
        'submissions:assignment_id.eq',
        'teaching_boards:assignment_id.eq',
        'assignment_classrooms:assignment_id.eq',
        'assignment_classrooms:assignment_id.eq,classroom_id.eq,created_at.gte,created_at.lte',
        'assignment_seb_config_revisions:assignment_id.eq',
        'assignment_seb_config_releases:assignment_id.eq'
      ];
      v_expected_cascades := array['assignment_classrooms'];
      v_expected_fk_signatures := array[
        'assignment_classrooms(assignment_id)->assignments(id):c',
        'assignment_extensions(assignment_id)->assignments(id):c',
        'assignment_seb_config_revisions(assignment_id)->assignments(id):c',
        'education_research_measurements(assignment_id)->assignments(id):r',
        'exam_android_approvals(assignment_id)->assignments(id):c',
        'exam_proctor_connections(assignment_id)->assignments(id):c',
        'exam_proctor_events(assignment_id)->assignments(id):c',
        'exam_proctor_sessions(assignment_id)->assignments(id):c',
        'exam_seb_checkins(assignment_id)->assignments(id):c',
        'ioc_forms(assignment_id)->assignments(id):n',
        'notifications(related_assignment_id)->assignments(id):c',
        'submissions(assignment_id)->assignments(id):c',
        'teaching_boards(assignment_id)->assignments(id):c'
      ];
    end if;
  elsif v_parent_table = 'questions' then$new$;
  v_lineage_old text := $old$  elsif v_parent_table = 'assignments' then
    select revision into v_revision
    from public.assignment_seb_config_revisions revision_row
    where revision_row.assignment_id = v_parent_id;
    select release.revision, release.release_id, release.artifact_storage_path,
           release.artifact_sha256
      into v_release_revision, v_release_id, v_artifact_path, v_artifact_sha
    from public.assignment_seb_config_releases release
    where release.assignment_id = v_parent_id;
    if v_revision is null or v_revision <> v_release_revision
      or v_release_id !~ '^asr-[0-9a-f]{32}-r[1-9][0-9]{0,9}-[0-9a-f]{16}$'
      or v_artifact_sha !~ '^[0-9a-f]{64}$'
      or v_artifact_path <> format('assignments/%s/r%s/%s.seb', v_parent_id, v_revision, v_artifact_sha)
    then raise exception 'SEB S5 assignment cascade lineage mismatch' using errcode = '55000'; end if;
  end if;$old$;
  v_lineage_new text := $new$  elsif v_parent_table = 'assignments' then
    if v_expected_cascades = array['assignment_classrooms'] then
      if exists (
        select 1 from public.assignment_seb_config_revisions revision_row
        where revision_row.assignment_id = v_parent_id
      ) or exists (
        select 1 from public.assignment_seb_config_releases release
        where release.assignment_id = v_parent_id
      ) then
        raise exception 'SEB S5 partial assignment lineage mismatch' using errcode = '55000';
      end if;
    else
      select revision into v_revision
      from public.assignment_seb_config_revisions revision_row
      where revision_row.assignment_id = v_parent_id;
      select release.revision, release.release_id, release.artifact_storage_path,
             release.artifact_sha256
        into v_release_revision, v_release_id, v_artifact_path, v_artifact_sha
      from public.assignment_seb_config_releases release
      where release.assignment_id = v_parent_id;
      if v_revision is null or v_revision <> v_release_revision
        or v_release_id !~ '^asr-[0-9a-f]{32}-r[1-9][0-9]{0,9}-[0-9a-f]{16}$'
        or v_artifact_sha !~ '^[0-9a-f]{64}$'
        or v_artifact_path <> format('assignments/%s/r%s/%s.seb', v_parent_id, v_revision, v_artifact_sha)
      then raise exception 'SEB S5 assignment cascade lineage mismatch' using errcode = '55000'; end if;
    end if;
  end if;$new$;
begin
  select pg_catalog.pg_get_functiondef(proc.oid)
    into strict v_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'seb_s5_delete_exact_cleanup_target'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_qa_namespace text, p_request jsonb';

  if length(v_definition) - length(replace(v_definition, v_graph_old, '')) <> length(v_graph_old)
    or length(v_definition) - length(replace(v_definition, v_lineage_old, '')) <> length(v_lineage_old)
    or position(v_graph_new in v_definition) <> 0
    or position(v_lineage_new in v_definition) <> 0
  then
    raise exception 'unexpected SEB S5 cleanup function source' using errcode = '55000';
  end if;

  v_definition := replace(v_definition, v_graph_old, v_graph_new);
  v_definition := replace(v_definition, v_lineage_old, v_lineage_new);
  execute v_definition;

  select pg_catalog.pg_get_functiondef(proc.oid)
    into strict v_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'seb_s5_delete_exact_cleanup_target'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_qa_namespace text, p_request jsonb';

  if length(v_definition) - length(replace(v_definition, v_graph_new, '')) <> length(v_graph_new)
    or length(v_definition) - length(replace(v_definition, v_lineage_new, '')) <> length(v_lineage_new)
    or position(v_graph_old in v_definition) <> 0
    or position(v_lineage_old in v_definition) <> 0
  then
    raise exception 'SEB S5 partial cleanup patch verification failed' using errcode = '55000';
  end if;
end
$$;
