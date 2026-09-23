-- Service-role-only database boundaries for the isolated SEB S5 Staging run.
--
-- These functions intentionally do not provide a generic SQL surface.  They
-- accept only the fixed JSON shapes emitted by the checked-in S5 cleanup
-- runtime and narrow Supabase driver.  Parent deletion is performed only
-- after the complete dependency graph has been locked and re-counted in the
-- same PostgREST transaction.  The durable QA reservation is the namespace
-- tombstone: no resource can be attested or deleted without the matching,
-- still-reserved row.

create function public.seb_s5_delete_exact_cleanup_target(
  p_qa_namespace text,
  p_request jsonb
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id text;
  v_source_sha text;
  v_deployment_id text;
  v_reserved_at timestamptz;
  v_parent_table text;
  v_parent_id uuid;
  v_parent_owner_id uuid;
  v_parent_org_id uuid;
  v_parent_related_id uuid;
  v_not_before timestamptz;
  v_not_after timestamptz;
  v_closure jsonb;
  v_absent jsonb;
  v_exact jsonb;
  v_cascades jsonb;
  v_requirement jsonb;
  v_predicate jsonb;
  v_signatures text[] := array[]::text[];
  v_expected_signatures text[];
  v_predicate_signatures text[];
  v_expected_cascades text[];
  v_actual_cascades text[];
  v_table text;
  v_column text;
  v_operator text;
  v_type text;
  v_value jsonb;
  v_where text;
  v_piece text;
  v_signature text;
  v_expected_count integer;
  v_count bigint;
  v_deleted integer := 0;
  v_fk_signatures text[];
  v_expected_fk_signatures text[];
  v_revision integer;
  v_release_revision integer;
  v_artifact_sha text;
  v_artifact_path text;
  v_release_id text;
  v_membership_user_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SEB S5 cleanup RPC requires service_role' using errcode = '42501';
  end if;
  if p_qa_namespace is null
    or p_qa_namespace !~ '^qa:seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$'
    or p_qa_namespace = 'qa:seb-s5-preview'
    or p_qa_namespace ~ '(prod(?:uction)?|live|real|customer)'
    or jsonb_typeof(p_request) <> 'object'
    or not (p_request ?& array[
      'schemaVersion', 'operationId', 'table', 'predicates', 'maxRows', 'atomicClosure'
    ])
    or (p_request - array[
      'schemaVersion', 'operationId', 'table', 'predicates', 'maxRows', 'atomicClosure'
    ]) <> '{}'::jsonb
    or jsonb_typeof(p_request -> 'schemaVersion') <> 'number'
    or (p_request ->> 'schemaVersion')::integer <> 1
    or jsonb_typeof(p_request -> 'operationId') <> 'string'
    or coalesce(p_request ->> 'operationId', '') !~ '^[a-z0-9][a-z0-9:_-]{0,191}$'
    or jsonb_typeof(p_request -> 'table') <> 'string'
    or jsonb_typeof(p_request -> 'predicates') <> 'array'
    or jsonb_array_length(p_request -> 'predicates') < 1
    or jsonb_array_length(p_request -> 'predicates') > 12
    or jsonb_typeof(p_request -> 'maxRows') <> 'number'
    or (p_request ->> 'maxRows')::integer <> 1
  then
    raise exception 'invalid SEB S5 cleanup request' using errcode = '22023';
  end if;

  v_parent_table := p_request ->> 'table';
  if v_parent_table not in (
    'submission_answers', 'submissions', 'assignments',
    'questions', 'classrooms', 'organizations'
  ) then
    raise exception 'unsupported SEB S5 cleanup target' using errcode = '22023';
  end if;

  v_closure := p_request -> 'atomicClosure';
  if jsonb_typeof(v_closure) <> 'object'
    or not (v_closure ?& array[
      'schemaVersion', 'isolation', 'requireAbsent', 'requireExact', 'allowedCascadeTables'
    ])
    or (v_closure - array[
      'schemaVersion', 'isolation', 'requireAbsent', 'requireExact', 'allowedCascadeTables'
    ]) <> '{}'::jsonb
    or jsonb_typeof(v_closure -> 'schemaVersion') <> 'number'
    or (v_closure ->> 'schemaVersion')::integer <> 1
    or v_closure ->> 'isolation' <> 'serializable-parent-lock'
    or jsonb_typeof(v_closure -> 'requireAbsent') <> 'array'
    or jsonb_typeof(v_closure -> 'requireExact') <> 'array'
    or jsonb_typeof(v_closure -> 'allowedCascadeTables') <> 'array'
    or jsonb_array_length(v_closure -> 'requireAbsent') > 64
    or jsonb_array_length(v_closure -> 'requireExact') > 16
    or jsonb_array_length(v_closure -> 'allowedCascadeTables') > 8
  then
    raise exception 'invalid SEB S5 atomic closure' using errcode = '22023';
  end if;
  v_absent := v_closure -> 'requireAbsent';
  v_exact := v_closure -> 'requireExact';
  v_cascades := v_closure -> 'allowedCascadeTables';

  -- The operation predicates are deliberately table-specific.  This is also
  -- where the single creation window used by every closure requirement is
  -- recovered; an arbitrary PostgREST filter cannot pass this boundary.
  for v_predicate in select value from jsonb_array_elements(p_request -> 'predicates') loop
    if jsonb_typeof(v_predicate) <> 'object'
      or not (v_predicate ?& array['column', 'operator', 'value'])
      or (v_predicate - array['column', 'operator', 'value']) <> '{}'::jsonb
    then
      raise exception 'invalid SEB S5 target predicate' using errcode = '22023';
    end if;
  end loop;

  if v_parent_table = 'submission_answers' then
    if jsonb_array_length(p_request -> 'predicates') <> 6
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'submission_id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'question_id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'org_id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_at' and p ->> 'operator' = 'gte') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_at' and p ->> 'operator' = 'lte') <> 1
    then raise exception 'invalid answer target predicates' using errcode = '22023'; end if;
  elsif v_parent_table = 'submissions' then
    if jsonb_array_length(p_request -> 'predicates') <> 6
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'assignment_id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'student_id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'org_id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_at' and p ->> 'operator' = 'gte') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_at' and p ->> 'operator' = 'lte') <> 1
    then raise exception 'invalid submission target predicates' using errcode = '22023'; end if;
  elsif v_parent_table = 'assignments' then
    if jsonb_array_length(p_request -> 'predicates') <> 6
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'classroom_id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_by' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'org_id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_at' and p ->> 'operator' = 'gte') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_at' and p ->> 'operator' = 'lte') <> 1
    then raise exception 'invalid assignment target predicates' using errcode = '22023'; end if;
  elsif v_parent_table = 'questions' then
    if jsonb_array_length(p_request -> 'predicates') <> 5
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_by' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'org_id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_at' and p ->> 'operator' = 'gte') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_at' and p ->> 'operator' = 'lte') <> 1
    then raise exception 'invalid question target predicates' using errcode = '22023'; end if;
  elsif v_parent_table = 'classrooms' then
    if jsonb_array_length(p_request -> 'predicates') <> 5
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'teacher_id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'org_id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_at' and p ->> 'operator' = 'gte') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_at' and p ->> 'operator' = 'lte') <> 1
    then raise exception 'invalid classroom target predicates' using errcode = '22023'; end if;
  else
    if jsonb_array_length(p_request -> 'predicates') <> 6
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'id' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'is_personal' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'subscription_tier' and p ->> 'operator' = 'eq') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'deleted_at' and p ->> 'operator' = 'is') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_at' and p ->> 'operator' = 'gte') <> 1
      or (select count(*) from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_at' and p ->> 'operator' = 'lte') <> 1
    then raise exception 'invalid organization target predicates' using errcode = '22023'; end if;
  end if;

  begin
    select (p ->> 'value')::uuid into strict v_parent_id
    from jsonb_array_elements(p_request -> 'predicates') p
    where p ->> 'column' = 'id' and p ->> 'operator' = 'eq';
    select (p ->> 'value')::timestamptz into strict v_not_before
    from jsonb_array_elements(p_request -> 'predicates') p
    where p ->> 'column' = 'created_at' and p ->> 'operator' = 'gte';
    select (p ->> 'value')::timestamptz into strict v_not_after
    from jsonb_array_elements(p_request -> 'predicates') p
    where p ->> 'column' = 'created_at' and p ->> 'operator' = 'lte';
  exception when others then
    raise exception 'invalid SEB S5 target identity' using errcode = '22023';
  end;
  if v_not_after <= v_not_before
    or v_not_after - v_not_before > interval '24 hours'
  then raise exception 'invalid SEB S5 creation window' using errcode = '22023'; end if;

  -- Serialize all cleanup for one durable run and keep its tombstone reserved
  -- until the aggregate cleanup participant marks the run cleaned.
  select reservation.run_id, reservation.source_sha, reservation.deployment_id,
         reservation.reserved_at
    into v_run_id, v_source_sha, v_deployment_id, v_reserved_at
  from public.seb_staging_qa_run_reservations reservation
  where reservation.qa_namespace = p_qa_namespace
    and reservation.state = 'reserved'
  for update;
  if not found
    or p_qa_namespace <> 'qa:' || v_run_id
    or v_source_sha !~ '^[0-9a-f]{40}$'
    or v_deployment_id !~ '^dpl_[A-Za-z0-9]{16,64}$'
    or v_reserved_at < v_not_before
    or v_reserved_at > v_not_after
  then raise exception 'SEB S5 run reservation mismatch' using errcode = '55000'; end if;
  -- One lock per reserved run prevents cross-parent cleanup races (for
  -- example an assignment delete racing its organization delete).
  perform pg_advisory_xact_lock(hashtextextended(p_qa_namespace, 0));
  lock table auth.users, public.users in share mode;

  -- Every possible writer of the proof graph is blocked before the parent is
  -- read.  SHARE ROW EXCLUSIVE conflicts with INSERT/UPDATE/DELETE, including
  -- updates to UUID-array references which have no foreign key lock.
  if v_parent_table = 'submission_answers' then
    lock table public.student_work_artifacts, public.submission_answers
      in share row exclusive mode;
    v_expected_signatures := array['student_work_artifacts:submission_answer_id.eq'];
    v_expected_cascades := array[]::text[];
    v_expected_fk_signatures := array[
      'student_work_artifacts(submission_answer_id)->submission_answers(id):c'
    ];
  elsif v_parent_table = 'submissions' then
    lock table public.education_research_scores, public.exam_proctor_connections,
      public.exam_proctor_events, public.exam_proctor_sessions,
      public.submission_answers, public.submissions in share row exclusive mode;
    v_expected_signatures := array[
      'education_research_scores:submission_id.eq',
      'exam_proctor_connections:submission_id.eq',
      'exam_proctor_events:submission_id.eq',
      'submission_answers:submission_id.eq'
    ];
    v_expected_cascades := array[]::text[];
    if jsonb_array_length(v_exact) = 0 then
      v_expected_signatures := array_append(
        v_expected_signatures,
        'exam_proctor_sessions:submission_id.eq'
      );
    else
      v_expected_signatures := v_expected_signatures || array[
        'exam_proctor_sessions:submission_id.eq',
        'exam_proctor_sessions:assignment_id.eq,created_at.gte,created_at.lte,org_id.eq,student_id.eq,submission_id.eq'
      ];
      v_expected_cascades := array['exam_proctor_sessions'];
    end if;
    v_expected_fk_signatures := array[
      'education_research_scores(submission_id)->submissions(id):r',
      'exam_proctor_connections(submission_id)->submissions(id):c',
      'exam_proctor_events(submission_id)->submissions(id):c',
      'exam_proctor_sessions(submission_id)->submissions(id):c',
      'submission_answers(submission_id)->submissions(id):c'
    ];
  elsif v_parent_table = 'assignments' then
    lock table public.assignment_classrooms, public.assignment_extensions,
      public.assignment_seb_config_releases, public.assignment_seb_config_revisions,
      public.assignments, public.education_research_measurements,
      public.exam_android_approvals, public.exam_proctor_connections,
      public.exam_proctor_events, public.exam_proctor_sessions,
      public.exam_seb_checkins, public.ioc_forms, public.notifications,
      public.submissions, public.teaching_boards in share row exclusive mode;
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
      'assignment_seb_config_revisions:assignment_id.eq,created_at.gte,created_at.lte,org_id.eq,owner_id.eq,revision.eq',
      'assignment_seb_config_releases:assignment_id.eq',
      'assignment_seb_config_releases:artifact_sha256.eq,artifact_size_bytes.eq,artifact_storage_path.eq,assignment_id.eq,created_at.gte,created_at.lte,org_id.eq,owner_id.eq,release_id.eq,revision.eq,security_mode.eq'
    ];
    v_expected_cascades := array[
      'assignment_classrooms', 'assignment_seb_config_releases',
      'assignment_seb_config_revisions'
    ];
    v_expected_fk_signatures := array[
      'assignment_classrooms(assignment_id)->assignments(id):c',
      'assignment_extensions(assignment_id)->assignments(id):c',
      'assignment_seb_config_releases(assignment_id,revision)->assignment_seb_config_revisions(assignment_id,revision):c',
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
  elsif v_parent_table = 'questions' then
    lock table public.assignments, public.education_research_measurements,
      public.ioc_form_items, public.question_sets, public.question_shares,
      public.question_standards, public.questions, public.submission_answers,
      public.teaching_boards in share row exclusive mode;
    v_expected_signatures := array[
      'assignments:question_ids.contains',
      'education_research_measurements:snapshot_question_ids.contains',
      'education_research_measurements:source_question_ids.contains',
      'ioc_form_items:source_question_id.eq',
      'question_sets:question_ids.contains',
      'question_shares:question_id.eq',
      'question_standards:question_id.eq',
      'questions:parent_question_id.eq',
      'submission_answers:question_id.eq',
      'teaching_boards:question_id.eq'
    ];
    v_expected_cascades := array[]::text[];
    v_expected_fk_signatures := array[
      'ioc_form_items(source_question_id)->questions(id):n',
      'question_shares(question_id)->questions(id):c',
      'question_standards(question_id)->questions(id):c',
      'questions(parent_question_id)->questions(id):n',
      'submission_answers(question_id)->questions(id):c',
      'teaching_boards(question_id)->questions(id):c'
    ];
  elsif v_parent_table = 'classrooms' then
    lock table public.assignment_classrooms, public.assignments,
      public.classroom_co_teachers, public.classroom_invitations,
      public.classroom_posts, public.classroom_students, public.classrooms,
      public.education_research_projects, public.ioc_forms, public.notifications,
      public.student_notes in share row exclusive mode;
    v_expected_signatures := array[
      'assignment_classrooms:classroom_id.eq',
      'assignments:classroom_id.eq',
      'classroom_co_teachers:classroom_id.eq',
      'classroom_invitations:classroom_id.eq',
      'classroom_posts:classroom_id.eq',
      'classroom_students:classroom_id.eq',
      'education_research_projects:classroom_id.eq',
      'ioc_forms:classroom_id.eq',
      'notifications:related_classroom_id.eq',
      'student_notes:classroom_id.eq'
    ];
    v_expected_cascades := array[]::text[];
    v_expected_fk_signatures := array[
      'assignment_classrooms(classroom_id)->classrooms(id):c',
      'assignments(classroom_id)->classrooms(id):c',
      'classroom_co_teachers(classroom_id)->classrooms(id):c',
      'classroom_invitations(classroom_id)->classrooms(id):c',
      'classroom_posts(classroom_id)->classrooms(id):c',
      'classroom_students(classroom_id)->classrooms(id):c',
      'education_research_projects(classroom_id)->classrooms(id):c',
      'ioc_forms(classroom_id)->classrooms(id):n',
      'notifications(related_classroom_id)->classrooms(id):c',
      'student_notes(classroom_id)->classrooms(id):c'
    ];
  else
    lock table public.assignment_seb_config_releases,
      public.assignment_seb_config_revisions, public.assignments,
      public.classrooms, public.education_research_export_events,
      public.education_research_import_batch_rows,
      public.education_research_import_batches,
      public.education_research_import_template_rows,
      public.education_research_import_templates,
      public.education_research_measurements,
      public.education_research_participants,
      public.education_research_projects,
      public.education_research_score_drafts,
      public.education_research_score_history,
      public.education_research_scores, public.exam_android_approvals,
      public.exam_proctor_connections, public.exam_proctor_events,
      public.exam_proctor_sessions, public.exam_seb_checkins,
      public.ioc_form_events, public.ioc_form_experts, public.ioc_form_items,
      public.ioc_ratings,
      public.ioc_form_standards, public.ioc_forms, public.learning_standards,
      public.notifications, public.org_invitations, public.organization_members,
      public.organizations, public.question_set_shares, public.question_sets,
      public.question_shares, public.question_standards, public.questions,
      public.student_work_artifacts, public.submission_answers,
      public.submissions, public.teaching_boards in share row exclusive mode;
    v_expected_signatures := array[
      'assignment_seb_config_releases:org_id.eq',
      'assignment_seb_config_revisions:org_id.eq', 'assignments:org_id.eq',
      'classrooms:org_id.eq', 'education_research_export_events:org_id.eq',
      'education_research_import_batch_rows:org_id.eq',
      'education_research_import_batches:org_id.eq',
      'education_research_import_template_rows:org_id.eq',
      'education_research_import_templates:org_id.eq',
      'education_research_measurements:org_id.eq',
      'education_research_participants:org_id.eq',
      'education_research_projects:org_id.eq',
      'education_research_score_drafts:org_id.eq',
      'education_research_score_history:org_id.eq',
      'education_research_scores:org_id.eq', 'exam_android_approvals:org_id.eq',
      'exam_proctor_connections:org_id.eq', 'exam_proctor_events:org_id.eq',
      'exam_proctor_sessions:org_id.eq', 'exam_seb_checkins:org_id.eq',
      'ioc_form_events:org_id.eq', 'ioc_form_experts:org_id.eq',
      'ioc_form_items:org_id.eq', 'ioc_form_standards:org_id.eq',
      'ioc_forms:org_id.eq', 'ioc_ratings:org_id.eq', 'learning_standards:org_id.eq',
      'notifications:org_id.eq', 'org_invitations:org_id.eq',
      'question_set_shares:org_id.eq', 'question_sets:org_id.eq',
      'question_shares:org_id.eq', 'question_standards:org_id.eq',
      'questions:org_id.eq', 'student_work_artifacts:org_id.eq',
      'submission_answers:org_id.eq', 'submissions:org_id.eq',
      'teaching_boards:org_id.eq',
      'organization_members:org_id.eq',
      'organization_members:id.eq,joined_at.gte,joined_at.lte,org_id.eq,org_role.eq,user_id.eq'
    ];
    v_expected_cascades := array['organization_members'];
    v_expected_fk_signatures := array[
      'assignment_seb_config_releases(org_id)->organizations(id):c',
      'assignment_seb_config_revisions(org_id)->organizations(id):c',
      'assignments(org_id)->organizations(id):c',
      'classrooms(org_id)->organizations(id):c',
      'education_research_export_events(org_id)->organizations(id):c',
      'education_research_import_batch_rows(org_id)->organizations(id):c',
      'education_research_import_batches(org_id)->organizations(id):c',
      'education_research_import_template_rows(org_id)->organizations(id):c',
      'education_research_import_templates(org_id)->organizations(id):c',
      'education_research_measurements(org_id)->organizations(id):c',
      'education_research_participants(org_id)->organizations(id):c',
      'education_research_projects(org_id)->organizations(id):c',
      'education_research_score_drafts(org_id)->organizations(id):c',
      'education_research_score_history(org_id)->organizations(id):c',
      'education_research_scores(org_id)->organizations(id):c',
      'exam_android_approvals(org_id)->organizations(id):c',
      'exam_proctor_connections(org_id)->organizations(id):c',
      'exam_proctor_events(org_id)->organizations(id):c',
      'exam_proctor_sessions(org_id)->organizations(id):c',
      'exam_seb_checkins(org_id)->organizations(id):c',
      'ioc_form_events(org_id)->organizations(id):c',
      'ioc_form_experts(org_id)->organizations(id):c',
      'ioc_form_items(org_id)->organizations(id):c',
      'ioc_form_standards(org_id)->organizations(id):c',
      'ioc_forms(org_id)->organizations(id):c',
      'ioc_ratings(org_id)->organizations(id):c',
      'learning_standards(org_id)->organizations(id):c',
      'notifications(org_id)->organizations(id):c',
      'org_invitations(org_id)->organizations(id):c',
      'organization_members(org_id)->organizations(id):c',
      'question_set_shares(org_id)->organizations(id):c',
      'question_sets(org_id)->organizations(id):c',
      'question_shares(org_id)->organizations(id):c',
      'question_standards(org_id)->organizations(id):c',
      'questions(org_id)->organizations(id):n',
      'student_work_artifacts(org_id)->organizations(id):c',
      'submission_answers(org_id)->organizations(id):c',
      'submissions(org_id)->organizations(id):c',
      'teaching_boards(org_id)->organizations(id):c'
    ];
  end if;

  -- Validate exact closure requirement shapes, including the broad count=1
  -- requirements which prevent a narrow match from hiding siblings.
  for v_requirement in
    select value from jsonb_array_elements(v_absent)
    union all
    select value from jsonb_array_elements(v_exact)
  loop
    if jsonb_typeof(v_requirement) <> 'object'
      or not (v_requirement ?& array['table', 'predicates', 'expectedCount'])
      or (v_requirement - array['table', 'predicates', 'expectedCount']) <> '{}'::jsonb
      or jsonb_typeof(v_requirement -> 'predicates') <> 'array'
      or jsonb_array_length(v_requirement -> 'predicates') < 1
      or jsonb_array_length(v_requirement -> 'predicates') > 12
      or jsonb_typeof(v_requirement -> 'expectedCount') <> 'number'
    then raise exception 'invalid SEB S5 closure requirement' using errcode = '22023'; end if;
    v_expected_count := (v_requirement ->> 'expectedCount')::integer;
    if v_expected_count not in (0, 1)
      or (v_expected_count = 0 and not (v_absent @> jsonb_build_array(v_requirement)))
      or (v_expected_count = 1 and not (v_exact @> jsonb_build_array(v_requirement)))
    then raise exception 'invalid SEB S5 closure cardinality' using errcode = '22023'; end if;
    v_table := v_requirement ->> 'table';
    v_predicate_signatures := array[]::text[];
    v_where := '';
    for v_predicate in select value from jsonb_array_elements(v_requirement -> 'predicates') loop
      if jsonb_typeof(v_predicate) <> 'object'
        or not (v_predicate ?& array['column', 'operator', 'value'])
        or (v_predicate - array['column', 'operator', 'value']) <> '{}'::jsonb
      then raise exception 'invalid SEB S5 closure predicate' using errcode = '22023'; end if;
      v_column := v_predicate ->> 'column';
      v_operator := v_predicate ->> 'operator';
      v_value := v_predicate -> 'value';

      if not exists (
        select 1 from (values
          ('student_work_artifacts','submission_answer_id'),
          ('submission_answers','submission_id'),('submission_answers','question_id'),('submission_answers','org_id'),
          ('exam_proctor_connections','submission_id'),('exam_proctor_connections','assignment_id'),('exam_proctor_connections','org_id'),
          ('exam_proctor_events','submission_id'),('exam_proctor_events','assignment_id'),('exam_proctor_events','org_id'),
          ('exam_proctor_sessions','submission_id'),('exam_proctor_sessions','assignment_id'),('exam_proctor_sessions','student_id'),('exam_proctor_sessions','org_id'),('exam_proctor_sessions','created_at'),
          ('education_research_scores','submission_id'),('education_research_scores','org_id'),
          ('assignment_extensions','assignment_id'),('education_research_measurements','assignment_id'),
          ('education_research_measurements','org_id'),('education_research_measurements','source_question_ids'),('education_research_measurements','snapshot_question_ids'),
          ('exam_android_approvals','assignment_id'),('exam_android_approvals','org_id'),
          ('exam_seb_checkins','assignment_id'),('exam_seb_checkins','org_id'),
          ('ioc_forms','assignment_id'),('ioc_forms','classroom_id'),('ioc_forms','org_id'),
          ('notifications','related_assignment_id'),('notifications','related_classroom_id'),('notifications','org_id'),
          ('submissions','assignment_id'),('submissions','org_id'),
          ('teaching_boards','assignment_id'),('teaching_boards','question_id'),('teaching_boards','org_id'),
          ('assignment_classrooms','assignment_id'),('assignment_classrooms','classroom_id'),('assignment_classrooms','created_at'),
          ('assignment_seb_config_revisions','assignment_id'),('assignment_seb_config_revisions','revision'),('assignment_seb_config_revisions','org_id'),('assignment_seb_config_revisions','owner_id'),('assignment_seb_config_revisions','created_at'),
          ('assignment_seb_config_releases','assignment_id'),('assignment_seb_config_releases','revision'),('assignment_seb_config_releases','org_id'),('assignment_seb_config_releases','owner_id'),('assignment_seb_config_releases','release_id'),('assignment_seb_config_releases','artifact_storage_path'),('assignment_seb_config_releases','artifact_sha256'),('assignment_seb_config_releases','artifact_size_bytes'),('assignment_seb_config_releases','security_mode'),('assignment_seb_config_releases','created_at'),
          ('assignments','classroom_id'),('assignments','org_id'),('assignments','question_ids'),
          ('ioc_form_items','source_question_id'),('ioc_form_items','org_id'),
          ('question_sets','question_ids'),('question_sets','org_id'),
          ('question_shares','question_id'),('question_shares','org_id'),
          ('question_standards','question_id'),('question_standards','org_id'),
          ('questions','parent_question_id'),('questions','org_id'),
          ('classroom_co_teachers','classroom_id'),('classroom_invitations','classroom_id'),('classroom_posts','classroom_id'),('classroom_students','classroom_id'),
          ('education_research_projects','classroom_id'),('education_research_projects','org_id'),
          ('student_notes','classroom_id'),
          ('org_invitations','org_id'),('question_set_shares','org_id'),('learning_standards','org_id'),
          ('education_research_score_drafts','org_id'),('education_research_import_templates','org_id'),
          ('education_research_import_template_rows','org_id'),('education_research_import_batches','org_id'),
          ('education_research_import_batch_rows','org_id'),('education_research_participants','org_id'),
          ('education_research_score_history','org_id'),('education_research_export_events','org_id'),
          ('ioc_form_standards','org_id'),('ioc_form_experts','org_id'),('ioc_ratings','org_id'),('ioc_form_events','org_id'),
          ('organization_members','id'),('organization_members','org_id'),('organization_members','user_id'),('organization_members','org_role'),('organization_members','joined_at')
        ) allowed(table_name, column_name)
        where allowed.table_name = v_table and allowed.column_name = v_column
      ) then raise exception 'unsupported SEB S5 closure field' using errcode = '22023'; end if;

      v_type := case
        when v_column in ('revision','artifact_size_bytes') then 'integer'
        when v_column in ('created_at','joined_at') then 'timestamp'
        when v_column in ('release_id','artifact_storage_path','artifact_sha256','security_mode','org_role') then 'text'
        when v_column in ('question_ids','source_question_ids','snapshot_question_ids') then 'uuid_array'
        else 'uuid'
      end;
      if v_type = 'uuid' then
        if v_operator <> 'eq' or jsonb_typeof(v_value) <> 'string' or (v_value #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then raise exception 'invalid UUID closure predicate' using errcode = '22023'; end if;
        if (v_expected_count = 0
              or (v_expected_count = 1 and (
                (v_table = 'exam_proctor_sessions' and v_column = 'submission_id')
                or (v_table in (
                  'assignment_classrooms', 'assignment_seb_config_revisions',
                  'assignment_seb_config_releases'
                ) and v_column = 'assignment_id')
                or (v_table = 'organization_members' and v_column = 'org_id')
              )))
          and (v_value #>> '{}') <> v_parent_id::text
        then raise exception 'closure predicate is not parent-bound' using errcode = '22023'; end if;
        v_piece := format('%I = %L::uuid', v_column, v_value #>> '{}');
      elsif v_type = 'integer' then
        if v_operator <> 'eq' or jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}') !~ '^(?:0|[1-9][0-9]{0,9})$'
        then raise exception 'invalid integer closure predicate' using errcode = '22023'; end if;
        v_piece := format('%I = %s::integer', v_column, v_value #>> '{}');
      elsif v_type = 'timestamp' then
        if v_operator not in ('gte','lte') or jsonb_typeof(v_value) <> 'string'
          or (v_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$'
          or (v_value #>> '{}')::timestamptz <>
            (case when v_operator = 'gte' then v_not_before else v_not_after end)
        then raise exception 'invalid timestamp closure predicate' using errcode = '22023'; end if;
        v_piece := format('%I %s %L::timestamptz', v_column, case when v_operator = 'gte' then '>=' else '<=' end, v_value #>> '{}');
      elsif v_type = 'uuid_array' then
        if v_operator <> 'contains' or jsonb_typeof(v_value) <> 'array' or jsonb_array_length(v_value) <> 1
          or jsonb_typeof(v_value -> 0) <> 'string'
          or (v_value ->> 0) <> v_parent_id::text
        then raise exception 'invalid array closure predicate' using errcode = '22023'; end if;
        v_piece := format('%I @> array[%L::uuid]', v_column, v_value ->> 0);
      else
        if v_operator <> 'eq' or jsonb_typeof(v_value) <> 'string'
        then raise exception 'invalid text closure predicate' using errcode = '22023'; end if;
        v_piece := format('%I = %L', v_column, v_value #>> '{}');
      end if;
      v_predicate_signatures := array_append(v_predicate_signatures, v_column || '.' || v_operator);
      v_where := v_where || case when v_where = '' then '' else ' and ' end || v_piece;
    end loop;
    select array_agg(item order by item) into v_predicate_signatures from unnest(v_predicate_signatures) item;
    v_signature := v_table || ':' || array_to_string(v_predicate_signatures, ',');
    if not (v_signature = any(v_expected_signatures)) then
      raise exception 'unsupported SEB S5 closure requirement' using errcode = '22023';
    end if;
    v_signatures := array_append(v_signatures, v_signature);
    execute format('select count(*) from public.%I where %s', v_table, v_where) into v_count;
    if v_count <> v_expected_count then
      raise exception 'SEB S5 closure cardinality changed' using errcode = '55000';
    end if;
  end loop;
  select coalesce(array_agg(item order by item), array[]::text[]) into v_signatures from unnest(v_signatures) item;
  select coalesce(array_agg(item order by item), array[]::text[]) into v_expected_signatures from unnest(v_expected_signatures) item;
  if v_signatures is distinct from v_expected_signatures then
    raise exception 'SEB S5 closure graph mismatch' using errcode = '22023';
  end if;

  select coalesce(array_agg(value order by value), array[]::text[])
    into v_actual_cascades
  from jsonb_array_elements_text(v_cascades) value;
  select coalesce(array_agg(value order by value), array[]::text[])
    into v_expected_cascades
  from unnest(v_expected_cascades) value;
  if v_actual_cascades is distinct from v_expected_cascades
    or cardinality(v_actual_cascades) <> jsonb_array_length(v_cascades)
  then raise exception 'SEB S5 cascade declaration mismatch' using errcode = '22023'; end if;

  -- Fail closed on schema drift: compare every FK constraint, not only the
  -- child table name.  Ordered local/referenced columns, delete action, and
  -- duplicate-constraint cardinality are all part of the canonical signature,
  -- so a second FK from an already-known table cannot hide in the graph.  Walk
  -- through declared cascade children as well: deleting the root can delete a
  -- grandchild (for example release -> revision -> assignment), so constraints
  -- targeting those intermediate parents are part of the protected graph.
  select coalesce(array_agg(foreign_key.signature order by foreign_key.signature), array[]::text[])
    into v_fk_signatures
  from (
    with recursive protected_parent(relid) as (
      select format('public.%I', v_parent_table)::regclass::oid
      union
      select constraint_row.conrelid
      from protected_parent
      join pg_catalog.pg_constraint constraint_row
        on constraint_row.confrelid = protected_parent.relid
       and constraint_row.contype = 'f'
       and constraint_row.confdeltype = 'c'
      join pg_catalog.pg_class child on child.oid = constraint_row.conrelid
      join pg_catalog.pg_namespace child_namespace
        on child_namespace.oid = child.relnamespace
      where child_namespace.nspname = 'public'
        and child.relname = any(v_expected_cascades)
    )
    select format(
      '%s(%s)->%s(%s):%s',
      child.relname,
      (
        select string_agg(child_attribute.attname, ',' order by child_key.ordinality)
        from unnest(constraint_row.conkey) with ordinality child_key(attnum, ordinality)
        join pg_catalog.pg_attribute child_attribute
          on child_attribute.attrelid = constraint_row.conrelid
         and child_attribute.attnum = child_key.attnum
      ),
      parent.relname,
      (
        select string_agg(parent_attribute.attname, ',' order by parent_key.ordinality)
        from unnest(constraint_row.confkey) with ordinality parent_key(attnum, ordinality)
        join pg_catalog.pg_attribute parent_attribute
          on parent_attribute.attrelid = constraint_row.confrelid
         and parent_attribute.attnum = parent_key.attnum
      ),
      constraint_row.confdeltype::text
    ) signature
    from pg_catalog.pg_constraint constraint_row
    join protected_parent on protected_parent.relid = constraint_row.confrelid
    join pg_catalog.pg_class child on child.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace child_namespace on child_namespace.oid = child.relnamespace
    join pg_catalog.pg_class parent on parent.oid = constraint_row.confrelid
    where constraint_row.contype = 'f'
      and child_namespace.nspname = 'public'
  ) foreign_key;
  select coalesce(array_agg(value order by value), array[]::text[])
    into v_expected_fk_signatures from unnest(v_expected_fk_signatures) value;
  if v_fk_signatures is distinct from v_expected_fk_signatures
    or cardinality(v_fk_signatures) <> cardinality(v_expected_fk_signatures)
  then
    raise exception 'SEB S5 foreign-key graph drifted' using errcode = '55000';
  end if;

  -- Lock and validate the exact parent row plus its QA account lineage.  The
  -- fixture account metadata is the run-bound marker which product tables do
  -- not otherwise carry.
  if v_parent_table = 'submission_answers' then
    select answer.org_id, submission.student_id, answer.submission_id
      into v_parent_org_id, v_parent_owner_id, v_parent_related_id
    from public.submission_answers answer
    join public.submissions submission on submission.id = answer.submission_id
    where answer.id = v_parent_id
      and answer.submission_id = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'submission_id')
      and answer.question_id = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'question_id')
      and answer.org_id = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'org_id')
      and answer.created_at between v_not_before and v_not_after
    for update of answer;
  elsif v_parent_table = 'submissions' then
    select submission.org_id, submission.student_id, submission.assignment_id
      into v_parent_org_id, v_parent_owner_id, v_parent_related_id
    from public.submissions submission
    where submission.id = v_parent_id
      and submission.assignment_id = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'assignment_id')
      and submission.student_id = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'student_id')
      and submission.org_id = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'org_id')
      and submission.created_at between v_not_before and v_not_after
    for update;
  elsif v_parent_table = 'assignments' then
    select assignment.org_id, assignment.created_by, assignment.classroom_id
      into v_parent_org_id, v_parent_owner_id, v_parent_related_id
    from public.assignments assignment
    where assignment.id = v_parent_id
      and assignment.classroom_id = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'classroom_id')
      and assignment.created_by = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_by')
      and assignment.org_id = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'org_id')
      and assignment.created_at between v_not_before and v_not_after
    for update;
  elsif v_parent_table = 'questions' then
    select question.org_id, question.created_by
      into v_parent_org_id, v_parent_owner_id
    from public.questions question
    where question.id = v_parent_id
      and question.created_by = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'created_by')
      and question.org_id = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'org_id')
      and question.created_at between v_not_before and v_not_after
    for update;
  elsif v_parent_table = 'classrooms' then
    select classroom.org_id, classroom.teacher_id
      into v_parent_org_id, v_parent_owner_id
    from public.classrooms classroom
    where classroom.id = v_parent_id
      and classroom.teacher_id = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'teacher_id')
      and classroom.org_id = (select (p ->> 'value')::uuid from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'org_id')
      and classroom.created_at between v_not_before and v_not_after
    for update;
  else
    select organization.id into v_parent_org_id
    from public.organizations organization
    where organization.id = v_parent_id
      and organization.is_personal = true
      and organization.subscription_tier = 'free'
      and organization.deleted_at is null
      and organization.created_at between v_not_before and v_not_after
      and (select p -> 'value' from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'is_personal') = 'true'::jsonb
      and (select p ->> 'value' from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'subscription_tier') = 'free'
      and (select p -> 'value' from jsonb_array_elements(p_request -> 'predicates') p where p ->> 'column' = 'deleted_at') = 'null'::jsonb
    for update;
    select (predicate ->> 'value')::uuid into v_membership_user_id
    from jsonb_array_elements(v_exact) requirement,
         lateral jsonb_array_elements(requirement -> 'predicates') predicate
    where requirement ->> 'table' = 'organization_members'
      and predicate ->> 'column' = 'user_id'
    limit 1;
    v_parent_owner_id := v_membership_user_id;
  end if;

  if v_parent_org_id is null then
    raise exception 'SEB S5 exact parent is missing' using errcode = '55000';
  end if;
  if v_parent_owner_id is null
    or not exists (
      select 1 from auth.users account
      join public.users profile on profile.id = account.id
      where account.id = v_parent_owner_id
        and account.raw_user_meta_data ->> 'qa_fixture' = 'seb-s5'
        and account.raw_user_meta_data ->> 'qa_namespace' = p_qa_namespace
        and account.raw_app_meta_data ->> 'qa_fixture' = 'seb-s5'
        and account.raw_app_meta_data ->> 'qa_namespace' = p_qa_namespace
        and (account.raw_user_meta_data ->> 'qa_schema_version')::integer = 1
        and (account.raw_app_meta_data ->> 'qa_schema_version')::integer = 1
        and account.created_at between v_not_before and v_not_after
        and profile.created_at between v_not_before and v_not_after
    )
  then raise exception 'SEB S5 owner lineage mismatch' using errcode = '55000'; end if;

  if v_parent_table = 'submissions' and jsonb_array_length(v_exact) = 2 then
    if not exists (
      select 1 from public.exam_proctor_sessions session
      where session.submission_id = v_parent_id
        and session.assignment_id = v_parent_related_id
        and session.student_id = v_parent_owner_id
        and session.org_id = v_parent_org_id
        and session.created_at between v_not_before and v_not_after
    ) then raise exception 'SEB S5 session lineage mismatch' using errcode = '55000'; end if;
  elsif v_parent_table = 'assignments' then
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

  if v_parent_table = 'submission_answers' then
    delete from public.submission_answers where id = v_parent_id;
  elsif v_parent_table = 'submissions' then
    delete from public.submissions where id = v_parent_id;
  elsif v_parent_table = 'assignments' then
    delete from public.assignments where id = v_parent_id;
  elsif v_parent_table = 'questions' then
    delete from public.questions where id = v_parent_id;
  elsif v_parent_table = 'classrooms' then
    delete from public.classrooms where id = v_parent_id;
  else
    delete from public.organizations where id = v_parent_id;
  end if;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception 'SEB S5 exact parent deletion failed' using errcode = '55000';
  end if;

  if v_parent_table = 'submissions' and v_expected_cascades = array['exam_proctor_sessions']
    and exists (select 1 from public.exam_proctor_sessions where submission_id = v_parent_id)
  then raise exception 'SEB S5 session cascade failed' using errcode = '55000';
  elsif v_parent_table = 'assignments' and (
    exists (select 1 from public.assignment_classrooms where assignment_id = v_parent_id)
    or exists (select 1 from public.assignment_seb_config_revisions where assignment_id = v_parent_id)
    or exists (select 1 from public.assignment_seb_config_releases where assignment_id = v_parent_id)
  ) then raise exception 'SEB S5 assignment cascade failed' using errcode = '55000';
  elsif v_parent_table = 'organizations'
    and exists (select 1 from public.organization_members where org_id = v_parent_id)
  then raise exception 'SEB S5 organization cascade failed' using errcode = '55000';
  end if;

  return json_build_object(
    'schemaVersion', 1, 'status', 'passed', 'deletedCount', v_deleted,
    'atomicClosureVerified', true
  );
end;
$$;

revoke all on function public.seb_s5_delete_exact_cleanup_target(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.seb_s5_delete_exact_cleanup_target(text, jsonb)
  to service_role;


create function public.seb_s5_attest_storage_object(
  p_schema_version integer,
  p_qa_namespace text,
  p_bucket_name text,
  p_path text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id text;
  v_reserved_at timestamptz;
  v_source_sha text;
  v_deployment_id text;
  v_object_owner_id text;
  v_object_created_at timestamptz;
  v_object_metadata jsonb;
  v_size bigint;
  v_mime text;
  v_parts text[];
  v_owner_id uuid;
  v_submission_id uuid;
  v_answer_id uuid;
  v_assignment_id uuid;
  v_revision integer;
  v_sha256 text;
  v_assignment_owner_id uuid;
  v_assignment_org_id uuid;
  v_release_owner_id uuid;
  v_release_org_id uuid;
  v_release_size integer;
  v_release_created_at timestamptz;
  v_release_path text;
  v_release_sha256 text;
  v_release_security_mode text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SEB S5 storage RPC requires service_role' using errcode = '42501';
  end if;
  if p_schema_version is distinct from 1
    or p_qa_namespace is null
    or p_qa_namespace !~ '^qa:seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$'
    or p_qa_namespace = 'qa:seb-s5-preview'
    or p_qa_namespace ~ '(prod(?:uction)?|live|real|customer)'
    or p_bucket_name is null
    or p_bucket_name not in ('submission-files', 'assignment-seb-configs')
    or p_path is null
    or length(p_path) > 1024
    or p_path ~ '[[:cntrl:]]'
    or p_path like '%//%'
    or p_path like '%/../%'
    or p_path like '../%'
    or p_path like '%/..'
  then raise exception 'invalid SEB S5 storage attestation request' using errcode = '22023'; end if;

  select reservation.run_id, reservation.reserved_at, reservation.source_sha,
         reservation.deployment_id
    into v_run_id, v_reserved_at, v_source_sha, v_deployment_id
  from public.seb_staging_qa_run_reservations reservation
  where reservation.qa_namespace = p_qa_namespace
    and reservation.state = 'reserved'
  -- SHARE, rather than KEY SHARE, is required here: marking the reservation
  -- cleaned is a non-key UPDATE and must wait until this attestation boundary
  -- has committed or rolled back.
  for share;
  if not found
    or p_qa_namespace <> 'qa:' || v_run_id
    or v_source_sha !~ '^[0-9a-f]{40}$'
    or v_deployment_id !~ '^dpl_[A-Za-z0-9]{16,64}$'
  then raise exception 'SEB S5 run reservation mismatch' using errcode = '55000'; end if;

  select object_row.owner_id::text, object_row.created_at, object_row.metadata
    into v_object_owner_id, v_object_created_at, v_object_metadata
  from storage.objects object_row
  where object_row.bucket_id = p_bucket_name
    and object_row.name = p_path
  for key share;
  if not found then
    return json_build_object('schemaVersion', 1, 'objects', json_build_array());
  end if;
  if v_object_created_at is null
    or v_object_created_at < v_reserved_at
    or jsonb_typeof(v_object_metadata) <> 'object'
    or coalesce(v_object_metadata ->> 'size', '') !~ '^[1-9][0-9]{0,15}$'
    or coalesce(v_object_metadata ->> 'mimetype', '') = ''
  then raise exception 'invalid SEB S5 storage metadata' using errcode = '55000'; end if;
  v_size := (v_object_metadata ->> 'size')::bigint;
  v_mime := lower(v_object_metadata ->> 'mimetype');

  if p_bucket_name = 'submission-files' then
    v_parts := regexp_match(
      p_path,
      '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|pdf|png|webp)$'
    );
    if v_parts is null then
      raise exception 'invalid SEB S5 submission object path' using errcode = '22023';
    end if;
    v_owner_id := v_parts[1]::uuid;
    v_submission_id := v_parts[2]::uuid;
    v_answer_id := v_parts[3]::uuid;
    if v_object_owner_id is null
      or v_object_owner_id <> v_owner_id::text
      or v_size > 10485760
      or v_mime <> (case v_parts[5]
        when 'jpg' then 'image/jpeg'
        when 'pdf' then 'application/pdf'
        when 'png' then 'image/png'
        when 'webp' then 'image/webp'
      end)
    then raise exception 'SEB S5 submission object lineage mismatch' using errcode = '55000'; end if;

    -- A failed earlier cleanup may have removed the answer before its object.
    -- Keep the object deletable only while the encoded submission and owner
    -- remain bound to this exact reserved synthetic run.  If the answer still
    -- exists, its complete file-upload lineage remains mandatory.
    if not exists (
      select 1
      from public.submissions submission
      join auth.users account on account.id = submission.student_id
      join public.organizations organization on organization.id = submission.org_id
      join public.organization_members member
        on member.org_id = organization.id and member.org_role = 'owner'
      join auth.users organization_owner on organization_owner.id = member.user_id
      where submission.id = v_submission_id
        and submission.student_id = v_owner_id
        and submission.created_at >= v_reserved_at
        and account.created_at >= v_reserved_at
        and organization.is_personal = true
        and organization.subscription_tier = 'free'
        and organization.deleted_at is null
        and organization.created_at >= v_reserved_at
        and member.joined_at >= v_reserved_at
        and organization_owner.created_at >= v_reserved_at
        and organization_owner.raw_user_meta_data ->> 'qa_fixture' = 'seb-s5'
        and organization_owner.raw_user_meta_data ->> 'qa_namespace' = p_qa_namespace
        and organization_owner.raw_user_meta_data ->> 'qa_alias' = 'teacher-primary'
        and organization_owner.raw_user_meta_data ->> 'qa_role' = 'teacher'
        and organization_owner.raw_app_meta_data ->> 'qa_fixture' = 'seb-s5'
        and organization_owner.raw_app_meta_data ->> 'qa_namespace' = p_qa_namespace
        and organization_owner.raw_app_meta_data ->> 'qa_alias' = 'teacher-primary'
        and organization_owner.raw_app_meta_data ->> 'qa_role' = 'teacher'
        and (organization_owner.raw_user_meta_data ->> 'qa_schema_version')::integer = 1
        and (organization_owner.raw_app_meta_data ->> 'qa_schema_version')::integer = 1
        and account.raw_user_meta_data ->> 'qa_fixture' = 'seb-s5'
        and account.raw_user_meta_data ->> 'qa_namespace' = p_qa_namespace
        and account.raw_user_meta_data ->> 'qa_alias' = 'student-primary'
        and account.raw_user_meta_data ->> 'qa_role' = 'student'
        and account.raw_app_meta_data ->> 'qa_fixture' = 'seb-s5'
        and account.raw_app_meta_data ->> 'qa_namespace' = p_qa_namespace
        and account.raw_app_meta_data ->> 'qa_alias' = 'student-primary'
        and account.raw_app_meta_data ->> 'qa_role' = 'student'
        and (account.raw_user_meta_data ->> 'qa_schema_version')::integer = 1
        and (account.raw_app_meta_data ->> 'qa_schema_version')::integer = 1
    ) then
      raise exception 'SEB S5 submission object lineage mismatch' using errcode = '55000';
    end if;
    if exists (select 1 from public.submission_answers where id = v_answer_id)
      and not exists (
        select 1
        from public.submission_answers answer
        join public.submissions submission on submission.id = answer.submission_id
        join public.questions question on question.id = answer.question_id
        where answer.id = v_answer_id
          and answer.submission_id = v_submission_id
          and answer.org_id = submission.org_id
          and submission.student_id = v_owner_id
          and question.org_id = answer.org_id
          and question.question_type::text = 'file_upload'
          and answer.created_at >= v_reserved_at
          and jsonb_typeof(answer.student_answer::jsonb) = 'array'
          and jsonb_array_length(answer.student_answer::jsonb) = 1
          and answer.student_answer::jsonb #>> '{0,url}' =
            'https://dyuxkrzeveknqgtuzpbh.supabase.co/storage/v1/object/public/submission-files/' || p_path
          and lower(answer.student_answer::jsonb #>> '{0,type}') = v_mime
      )
    then raise exception 'SEB S5 submission object lineage mismatch' using errcode = '55000'; end if;
  else
    v_parts := regexp_match(
      p_path,
      '^assignments/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/r([1-9][0-9]{0,9})/([0-9a-f]{64})\.seb$'
    );
    if v_parts is null then
      raise exception 'invalid SEB S5 assignment artifact path' using errcode = '22023';
    end if;
    v_assignment_id := v_parts[1]::uuid;
    v_revision := v_parts[2]::integer;
    v_sha256 := v_parts[3];
    select assignment.created_by, assignment.org_id
      into v_assignment_owner_id, v_assignment_org_id
    from public.assignments assignment
    join auth.users account on account.id = assignment.created_by
    join public.organizations organization on organization.id = assignment.org_id
    join public.organization_members member
      on member.org_id = organization.id
     and member.user_id = assignment.created_by
     and member.org_role = 'owner'
    where assignment.id = v_assignment_id
      and assignment.type::text = 'exam'
      and assignment.secure_browser_mode = 'seb_required'
      and assignment.created_at >= v_reserved_at
      and account.created_at >= v_reserved_at
      and organization.is_personal = true
      and organization.subscription_tier = 'free'
      and organization.deleted_at is null
      and organization.created_at >= v_reserved_at
      and member.joined_at >= v_reserved_at
      and account.raw_user_meta_data ->> 'qa_fixture' = 'seb-s5'
      and account.raw_user_meta_data ->> 'qa_namespace' = p_qa_namespace
      and account.raw_user_meta_data ->> 'qa_alias' = 'teacher-primary'
      and account.raw_user_meta_data ->> 'qa_role' = 'teacher'
      and account.raw_app_meta_data ->> 'qa_fixture' = 'seb-s5'
      and account.raw_app_meta_data ->> 'qa_namespace' = p_qa_namespace
      and account.raw_app_meta_data ->> 'qa_alias' = 'teacher-primary'
      and account.raw_app_meta_data ->> 'qa_role' = 'teacher'
      and (account.raw_user_meta_data ->> 'qa_schema_version')::integer = 1
      and (account.raw_app_meta_data ->> 'qa_schema_version')::integer = 1;
    if v_assignment_owner_id is null then
      raise exception 'SEB S5 assignment artifact lineage mismatch' using errcode = '55000';
    end if;

    select release.owner_id, release.org_id, release.artifact_size_bytes,
           release.created_at, release.artifact_storage_path,
           release.artifact_sha256, release.security_mode
      into v_release_owner_id, v_release_org_id, v_release_size,
           v_release_created_at, v_release_path, v_release_sha256,
           v_release_security_mode
    from public.assignment_seb_config_releases release
    where release.assignment_id = v_assignment_id
      and release.revision = v_revision;
    if v_size > 2097152
      or v_mime <> 'application/seb'
      or (v_object_owner_id is not null and v_object_owner_id <> v_assignment_owner_id::text)
      or (v_release_owner_id is not null and (
        v_release_owner_id <> v_assignment_owner_id
        or v_release_org_id <> v_assignment_org_id
        or v_release_created_at < v_reserved_at
        or v_release_path <> p_path
        or v_release_sha256 <> v_sha256
        or v_release_security_mode <> 'test_plaintext'
        or v_size <> v_release_size
      ))
    then raise exception 'SEB S5 assignment artifact lineage mismatch' using errcode = '55000'; end if;
    v_owner_id := case when v_object_owner_id is null then null else v_object_owner_id::uuid end;
  end if;

  return json_build_object(
    'schemaVersion', 1,
    'objects', json_build_array(json_build_object(
      'bucketName', p_bucket_name,
      'path', p_path,
      'ownerId', v_owner_id,
      'createdAt', v_object_created_at,
      'sizeBytes', v_size,
      'mimeType', v_mime
    ))
  );
end;
$$;

revoke all on function public.seb_s5_attest_storage_object(integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.seb_s5_attest_storage_object(integer, text, text, text)
  to service_role;


create function public.seb_s5_find_exact_run_targets(p_criteria jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_key text;
  v_kind text;
  v_resource_type text;
  v_namespace text;
  v_owner_id uuid;
  v_organization_id uuid;
  v_run_id text;
  v_source_revision text;
  v_deployment_id text;
  v_not_before timestamptz;
  v_not_after timestamptz;
  v_not_before_text text;
  v_not_after_text text;
  v_reserved_at timestamptz;
  v_expected_kind text;
  v_expected_resource_type text;
  v_expected_alias text;
  v_matches json;
  v_match_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SEB S5 reconciliation RPC requires service_role' using errcode = '42501';
  end if;
  if jsonb_typeof(p_criteria) <> 'object'
    or not (p_criteria ?& array[
      'schemaVersion', 'targetKey', 'kind', 'identity', 'namespace', 'ownerId',
      'organizationId', 'resourceType', 'creationWindow'
    ])
    or (p_criteria - array[
      'schemaVersion', 'targetKey', 'kind', 'identity', 'namespace', 'ownerId',
      'organizationId', 'resourceType', 'creationWindow'
    ]) <> '{}'::jsonb
    or jsonb_typeof(p_criteria -> 'schemaVersion') <> 'number'
    or (p_criteria ->> 'schemaVersion')::integer <> 1
    or jsonb_typeof(p_criteria -> 'targetKey') <> 'string'
    or jsonb_typeof(p_criteria -> 'kind') <> 'string'
    or jsonb_typeof(p_criteria -> 'namespace') <> 'string'
    or jsonb_typeof(p_criteria -> 'resourceType') <> 'string'
    or jsonb_typeof(p_criteria -> 'ownerId') not in ('null', 'string')
    or jsonb_typeof(p_criteria -> 'organizationId') not in ('null', 'string')
    or jsonb_typeof(p_criteria -> 'identity') <> 'object'
    or not ((p_criteria -> 'identity') ?& array[
      'runId', 'sourceRevision', 'deploymentId', 'creationWindow'
    ])
    or ((p_criteria -> 'identity') - array[
      'runId', 'sourceRevision', 'deploymentId', 'creationWindow'
    ]) <> '{}'::jsonb
    or jsonb_typeof(p_criteria #> '{identity,runId}') <> 'string'
    or jsonb_typeof(p_criteria #> '{identity,sourceRevision}') <> 'string'
    or jsonb_typeof(p_criteria #> '{identity,deploymentId}') <> 'string'
    or jsonb_typeof(p_criteria -> 'creationWindow') <> 'object'
    or not ((p_criteria -> 'creationWindow') ?& array['notBefore','notAfter'])
    or ((p_criteria -> 'creationWindow') - array['notBefore','notAfter']) <> '{}'::jsonb
    or jsonb_typeof(p_criteria #> '{creationWindow,notBefore}') <> 'string'
    or jsonb_typeof(p_criteria #> '{creationWindow,notAfter}') <> 'string'
    or jsonb_typeof(p_criteria #> '{identity,creationWindow}') <> 'object'
    or not ((p_criteria #> '{identity,creationWindow}') ?& array['notBefore','notAfter'])
    or ((p_criteria #> '{identity,creationWindow}') - array['notBefore','notAfter']) <> '{}'::jsonb
    or jsonb_typeof(p_criteria #> '{identity,creationWindow,notBefore}') <> 'string'
    or jsonb_typeof(p_criteria #> '{identity,creationWindow,notAfter}') <> 'string'
  then raise exception 'invalid SEB S5 reconciliation criteria' using errcode = '22023'; end if;

  v_target_key := p_criteria ->> 'targetKey';
  v_kind := p_criteria ->> 'kind';
  v_resource_type := p_criteria ->> 'resourceType';
  v_namespace := p_criteria ->> 'namespace';
  v_run_id := p_criteria #>> '{identity,runId}';
  v_source_revision := p_criteria #>> '{identity,sourceRevision}';
  v_deployment_id := p_criteria #>> '{identity,deploymentId}';
  v_not_before_text := p_criteria #>> '{creationWindow,notBefore}';
  v_not_after_text := p_criteria #>> '{creationWindow,notAfter}';
  if coalesce(v_target_key, '') !~ '^[a-z][a-z0-9-]{0,63}$'
    or coalesce(v_run_id, '') !~ '^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$'
    or v_run_id = 'seb-s5-preview'
    or v_run_id ~ '(prod(?:uction)?|live|real|customer)'
    or v_namespace <> 'qa:' || v_run_id
    or coalesce(v_source_revision, '') !~ '^[0-9a-f]{40}$'
    or coalesce(v_deployment_id, '') !~ '^dpl_[A-Za-z0-9]{16,64}$'
    or p_criteria -> 'creationWindow' is distinct from p_criteria #> '{identity,creationWindow}'
    or coalesce(v_not_before_text, '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$'
    or coalesce(v_not_after_text, '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$'
  then raise exception 'invalid SEB S5 reconciliation identity' using errcode = '22023'; end if;
  begin
    v_not_before := v_not_before_text::timestamptz;
    v_not_after := v_not_after_text::timestamptz;
    if p_criteria -> 'ownerId' <> 'null'::jsonb then
      v_owner_id := (p_criteria ->> 'ownerId')::uuid;
    end if;
    if p_criteria -> 'organizationId' <> 'null'::jsonb then
      v_organization_id := (p_criteria ->> 'organizationId')::uuid;
    end if;
  exception when others then
    raise exception 'invalid SEB S5 reconciliation scope' using errcode = '22023';
  end;
  if v_not_after <= v_not_before
    or v_not_after - v_not_before > interval '24 hours'
  then raise exception 'invalid SEB S5 reconciliation window' using errcode = '22023'; end if;

  -- Fixed target-key map.  This prevents a caller from turning the function
  -- into a general service-role search endpoint.
  select expected.kind, expected.resource_type, expected.qa_alias
    into v_expected_kind, v_expected_resource_type, v_expected_alias
  from (values
    ('account-teacher-primary','account','teacher','teacher-primary'),
    ('account-teacher-unrelated','account','teacher','teacher-unrelated'),
    ('account-student-primary','account','student','student-primary'),
    ('account-student-secondary','account','student','student-secondary'),
    ('personal-organization-teacher-primary','personalOrganization','personal','teacher-primary'),
    ('personal-organization-teacher-unrelated','personalOrganization','personal','teacher-unrelated'),
    ('personal-organization-student-primary','personalOrganization','personal','student-primary'),
    ('personal-organization-student-secondary','personalOrganization','personal','student-secondary'),
    ('classroom-primary','classroom','subject','teacher-primary'),
    ('question-written','question','essay','teacher-primary'),
    ('question-upload','question','file_upload','teacher-primary'),
    ('membership-primary','classroomMembership','student','student-primary'),
    ('membership-secondary','classroomMembership','student','student-secondary'),
    ('assignment-primary','assignment','exam','teacher-primary'),
    ('config-primary','configRevision','seb_required','teacher-primary'),
    ('release-primary','release','test_plaintext','teacher-primary'),
    ('check-in-primary','checkIn','windows','student-primary'),
    ('submission-primary','submission','seb_required','student-primary'),
    ('answer-written','answer','essay','student-primary'),
    ('answer-upload','answer','file_upload','student-primary'),
    ('proctor-connection','proctorConnection','heartbeat','student-primary'),
    ('proctor-event','proctorEvent','monitoring_started','student-primary'),
    ('answer-storage','answerStorageObject','submission_file','student-primary'),
    ('assignment-artifact','assignmentArtifact','seb','teacher-primary')
  ) expected(target_key, kind, resource_type, qa_alias)
  where expected.target_key = v_target_key;
  if v_expected_kind is null
    or v_kind <> v_expected_kind
    or v_resource_type <> v_expected_resource_type
    or (v_kind = 'account' and (v_owner_id is not null or v_organization_id is not null))
    or (v_kind = 'personalOrganization' and (v_owner_id is null or v_organization_id is not null))
    or (v_kind not in ('account','personalOrganization') and (v_owner_id is null or v_organization_id is null))
  then raise exception 'unsupported SEB S5 reconciliation target' using errcode = '22023'; end if;

  select reservation.reserved_at into v_reserved_at
  from public.seb_staging_qa_run_reservations reservation
  where reservation.run_id = v_run_id
    and reservation.qa_namespace = v_namespace
    and reservation.source_sha = v_source_revision
    and reservation.deployment_id = v_deployment_id
    and reservation.state = 'reserved'
  -- Keep the reservation reserved for the complete reconciliation boundary.
  -- A KEY SHARE lock would still allow the non-key reserved -> cleaned UPDATE.
  for share;
  if not found or v_reserved_at < v_not_before or v_reserved_at > v_not_after then
    raise exception 'SEB S5 reconciliation reservation mismatch' using errcode = '55000';
  end if;

  -- Product rows do not carry the QA namespace directly. Bind every scoped
  -- search back to the synthetic account and personal organization created
  -- for this exact reservation before reading candidate rows.
  if v_owner_id is not null and not exists (
    select 1
    from auth.users account
    join public.users profile on profile.id = account.id
    where account.id = v_owner_id
      and account.raw_user_meta_data ->> 'qa_fixture' = 'seb-s5'
      and account.raw_user_meta_data ->> 'qa_namespace' = v_namespace
      and account.raw_user_meta_data ->> 'qa_alias' = v_expected_alias
      and account.raw_user_meta_data ->> 'qa_role' = split_part(v_expected_alias, '-', 1)
      and account.raw_app_meta_data ->> 'qa_fixture' = 'seb-s5'
      and account.raw_app_meta_data ->> 'qa_namespace' = v_namespace
      and account.raw_app_meta_data ->> 'qa_alias' = v_expected_alias
      and account.raw_app_meta_data ->> 'qa_role' = split_part(v_expected_alias, '-', 1)
      and (account.raw_user_meta_data ->> 'qa_schema_version')::integer = 1
      and (account.raw_app_meta_data ->> 'qa_schema_version')::integer = 1
      and profile.role::text = split_part(v_expected_alias, '-', 1)
      and account.created_at between v_not_before and v_not_after
      and profile.created_at between v_not_before and v_not_after
  ) then
    raise exception 'SEB S5 reconciliation owner is not run-bound' using errcode = '55000';
  end if;

  if v_organization_id is not null and not exists (
    select 1
    from public.organizations organization
    join public.organization_members member
      on member.org_id = organization.id and member.org_role = 'owner'
    join auth.users account on account.id = member.user_id
    where organization.id = v_organization_id
      and organization.is_personal = true
      and organization.subscription_tier = 'free'
      and organization.deleted_at is null
      and organization.created_at between v_not_before and v_not_after
      and member.joined_at between v_not_before and v_not_after
      and account.raw_user_meta_data ->> 'qa_fixture' = 'seb-s5'
      and account.raw_user_meta_data ->> 'qa_namespace' = v_namespace
      and account.raw_user_meta_data ->> 'qa_alias' = 'teacher-primary'
      and account.raw_app_meta_data ->> 'qa_fixture' = 'seb-s5'
      and account.raw_app_meta_data ->> 'qa_namespace' = v_namespace
      and account.raw_app_meta_data ->> 'qa_alias' = 'teacher-primary'
      and (account.raw_user_meta_data ->> 'qa_schema_version')::integer = 1
      and (account.raw_app_meta_data ->> 'qa_schema_version')::integer = 1
  ) then
    raise exception 'SEB S5 reconciliation organization is not run-bound' using errcode = '55000';
  end if;

  if v_kind = 'account' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion', 1, 'targetKey', v_target_key, 'kind', v_kind,
      'identity', json_build_object(
        'runId', v_run_id, 'sourceRevision', v_source_revision,
        'deploymentId', v_deployment_id,
        'creationWindow', json_build_object('notBefore', v_not_before_text, 'notAfter', v_not_after_text)
      ),
      'targetId', candidate.id::text, 'namespace', v_namespace,
      'ownerId', null, 'organizationId', null,
      'resourceType', v_resource_type, 'createdAt', candidate.created_at
    ) order by candidate.created_at, candidate.id), '[]'::json)
    into v_matches
    from (
      select account.id, account.created_at
      from auth.users account
      join public.users profile on profile.id = account.id
      where account.created_at between v_not_before and v_not_after
        and profile.created_at between v_not_before and v_not_after
        and profile.role::text = v_resource_type
        and account.raw_user_meta_data ->> 'qa_fixture' = 'seb-s5'
        and account.raw_user_meta_data ->> 'qa_namespace' = v_namespace
        and account.raw_user_meta_data ->> 'qa_alias' = v_expected_alias
        and account.raw_user_meta_data ->> 'qa_role' = v_resource_type
        and account.raw_app_meta_data ->> 'qa_fixture' = 'seb-s5'
        and account.raw_app_meta_data ->> 'qa_namespace' = v_namespace
        and account.raw_app_meta_data ->> 'qa_alias' = v_expected_alias
        and account.raw_app_meta_data ->> 'qa_role' = v_resource_type
        and (account.raw_user_meta_data ->> 'qa_schema_version')::integer = 1
        and (account.raw_app_meta_data ->> 'qa_schema_version')::integer = 1
      order by account.created_at, account.id limit 9
    ) candidate;
  elsif v_kind = 'personalOrganization' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion', 1, 'targetKey', v_target_key, 'kind', v_kind,
      'identity', json_build_object(
        'runId', v_run_id, 'sourceRevision', v_source_revision,
        'deploymentId', v_deployment_id,
        'creationWindow', json_build_object('notBefore', v_not_before_text, 'notAfter', v_not_after_text)
      ),
      'targetId', candidate.organization_id::text || ':' || candidate.membership_id::text,
      'namespace', v_namespace, 'ownerId', v_owner_id,
      'organizationId', null, 'resourceType', v_resource_type,
      'createdAt', candidate.created_at
    ) order by candidate.created_at, candidate.organization_id), '[]'::json)
    into v_matches
    from (
      select organization.id organization_id, member.id membership_id,
             organization.created_at
      from public.organizations organization
      join public.organization_members member on member.org_id = organization.id
      join auth.users account on account.id = member.user_id
      where member.user_id = v_owner_id and member.org_role = 'owner'
        and organization.is_personal = true
        and organization.subscription_tier = 'free'
        and organization.deleted_at is null
        and organization.created_at between v_not_before and v_not_after
        and member.joined_at between v_not_before and v_not_after
        and account.raw_user_meta_data ->> 'qa_fixture' = 'seb-s5'
        and account.raw_user_meta_data ->> 'qa_namespace' = v_namespace
        and account.raw_user_meta_data ->> 'qa_alias' = v_expected_alias
        and account.raw_app_meta_data ->> 'qa_fixture' = 'seb-s5'
        and account.raw_app_meta_data ->> 'qa_namespace' = v_namespace
      order by organization.created_at, organization.id limit 9
    ) candidate;
  elsif v_kind = 'classroom' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.id::text,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.id),'[]'::json) into v_matches
    from (select id,created_at from public.classrooms where teacher_id=v_owner_id and org_id=v_organization_id and classroom_type::text='subject' and created_at between v_not_before and v_not_after order by created_at,id limit 9) candidate;
  elsif v_kind = 'question' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.id::text,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.id),'[]'::json) into v_matches
    from (select id,created_at from public.questions where created_by=v_owner_id and org_id=v_organization_id and question_type::text=case when v_resource_type='essay' then 'written' else 'file_upload' end and created_at between v_not_before and v_not_after order by created_at,id limit 9) candidate;
  elsif v_kind = 'classroomMembership' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.id::text,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.id),'[]'::json) into v_matches
    from (select member.id,member.joined_at created_at from public.classroom_students member join public.classrooms classroom on classroom.id=member.classroom_id join auth.users account on account.id=member.student_id where member.student_id=v_owner_id and classroom.org_id=v_organization_id and member.joined_at between v_not_before and v_not_after and account.raw_user_meta_data->>'qa_namespace'=v_namespace and account.raw_user_meta_data->>'qa_alias'=v_expected_alias order by member.joined_at,member.id limit 9) candidate;
  elsif v_kind = 'assignment' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.id::text,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.id),'[]'::json) into v_matches
    from (select id,created_at from public.assignments where created_by=v_owner_id and org_id=v_organization_id and type::text='exam' and created_at between v_not_before and v_not_after order by created_at,id limit 9) candidate;
  elsif v_kind = 'configRevision' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.assignment_id::text||':r'||candidate.revision::text,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.assignment_id,candidate.revision),'[]'::json) into v_matches
    from (select revision.assignment_id,revision.revision,revision.created_at from public.assignment_seb_config_revisions revision join public.assignments assignment on assignment.id=revision.assignment_id where revision.owner_id=v_owner_id and revision.org_id=v_organization_id and assignment.secure_browser_mode='seb_required' and revision.created_at between v_not_before and v_not_after order by revision.created_at,revision.assignment_id,revision.revision limit 9) candidate;
  elsif v_kind = 'release' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.release_id,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.release_id),'[]'::json) into v_matches
    from (select release_id,created_at from public.assignment_seb_config_releases where owner_id=v_owner_id and org_id=v_organization_id and security_mode='test_plaintext' and created_at between v_not_before and v_not_after order by created_at,release_id limit 9) candidate;
  elsif v_kind = 'checkIn' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.assignment_id::text||':'||candidate.student_id::text,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.assignment_id),'[]'::json) into v_matches
    from (select assignment_id,student_id,verified_at created_at from public.exam_seb_checkins where student_id=v_owner_id and org_id=v_organization_id and platform='windows' and verified_at between v_not_before and v_not_after order by verified_at,assignment_id limit 9) candidate;
  elsif v_kind = 'submission' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.id::text,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.id),'[]'::json) into v_matches
    from (select submission.id,submission.created_at from public.submissions submission join public.assignments assignment on assignment.id=submission.assignment_id where submission.student_id=v_owner_id and submission.org_id=v_organization_id and assignment.secure_browser_mode='seb_required' and submission.created_at between v_not_before and v_not_after order by submission.created_at,submission.id limit 9) candidate;
  elsif v_kind = 'answer' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.id::text,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.id),'[]'::json) into v_matches
    from (select answer.id,answer.created_at from public.submission_answers answer join public.submissions submission on submission.id=answer.submission_id join public.questions question on question.id=answer.question_id where submission.student_id=v_owner_id and answer.org_id=v_organization_id and question.question_type::text=case when v_resource_type='essay' then 'written' else 'file_upload' end and answer.created_at between v_not_before and v_not_after order by answer.created_at,answer.id limit 9) candidate;
  elsif v_kind = 'proctorConnection' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.submission_id::text||':'||candidate.client_instance_id::text,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.submission_id,candidate.client_instance_id),'[]'::json) into v_matches
    from (select submission_id,client_instance_id,connected_at created_at from public.exam_proctor_connections where student_id=v_owner_id and org_id=v_organization_id and connected_at between v_not_before and v_not_after order by connected_at,submission_id,client_instance_id limit 9) candidate;
  elsif v_kind = 'proctorEvent' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.id::text,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.id),'[]'::json) into v_matches
    from (select id,created_at from public.exam_proctor_events where student_id=v_owner_id and org_id=v_organization_id and event_type='monitoring_started' and created_at between v_not_before and v_not_after order by created_at,id limit 9) candidate;
  elsif v_kind = 'answerStorageObject' then
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.name,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.name),'[]'::json) into v_matches
    from (
      select object_row.name,object_row.created_at
      from storage.objects object_row
      join public.submissions submission on submission.id::text=split_part(object_row.name,'/',2)
      where object_row.bucket_id='submission-files'
        and object_row.owner_id::text=v_owner_id::text
        and split_part(object_row.name,'/',1)=v_owner_id::text
        and split_part(object_row.name,'/',2)=submission.id::text
        and submission.student_id=v_owner_id
        and submission.org_id=v_organization_id
        and submission.created_at between v_not_before and v_not_after
        and object_row.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|pdf|png|webp)$'
        and object_row.created_at between v_not_before and v_not_after
      order by object_row.created_at,object_row.name limit 9
    ) candidate;
  else
    select coalesce(json_agg(json_build_object(
      'schemaVersion',1,'targetKey',v_target_key,'kind',v_kind,
      'identity',json_build_object('runId',v_run_id,'sourceRevision',v_source_revision,'deploymentId',v_deployment_id,'creationWindow',json_build_object('notBefore',v_not_before_text,'notAfter',v_not_after_text)),
      'targetId',candidate.name,'namespace',v_namespace,'ownerId',v_owner_id,
      'organizationId',v_organization_id,'resourceType',v_resource_type,'createdAt',candidate.created_at
    ) order by candidate.created_at,candidate.name),'[]'::json) into v_matches
    from (
      select object_row.name,object_row.created_at
      from storage.objects object_row
      join public.assignments assignment on assignment.id::text=split_part(object_row.name,'/',2)
      where object_row.bucket_id='assignment-seb-configs'
        and assignment.created_by=v_owner_id
        and assignment.org_id=v_organization_id
        and assignment.type::text='exam'
        and assignment.secure_browser_mode='seb_required'
        and (object_row.owner_id is null or object_row.owner_id::text=v_owner_id::text)
        and object_row.name ~ '^assignments/[0-9a-f-]{36}/r[1-9][0-9]{0,9}/[0-9a-f]{64}\.seb$'
        and object_row.created_at between v_not_before and v_not_after
        and assignment.created_at between v_not_before and v_not_after
      order by object_row.created_at,object_row.name limit 9
    ) candidate;
  end if;

  v_match_count := json_array_length(v_matches);
  if v_match_count > 8 then
    raise exception 'SEB S5 reconciliation is ambiguous' using errcode = '55000';
  end if;
  return json_build_object('schemaVersion',1,'authoritative',true,'matches',v_matches);
end;
$$;

revoke all on function public.seb_s5_find_exact_run_targets(jsonb)
  from public, anon, authenticated;
grant execute on function public.seb_s5_find_exact_run_targets(jsonb)
  to service_role;
