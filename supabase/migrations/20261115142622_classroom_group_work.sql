-- One submitted work and one published result for all its members.
-- Tables remain outside the Data API, with narrowly scoped RPCs for the app.
create schema group_work_internal;
revoke all on schema group_work_internal from public, anon, authenticated;
grant usage on schema group_work_internal to authenticated;

create table group_work_internal.assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  instructions text not null default '' check (char_length(instructions) <= 5000),
  mode text not null check (mode in ('solo', 'group')),
  min_members integer not null,
  max_members integer not null,
  max_score numeric(7,2) not null check (max_score > 0 and max_score <= 1000),
  due_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  constraint valid_group_range check (
    (mode = 'solo' and min_members = 1 and max_members = 1)
    or (mode = 'group' and min_members between 2 and max_members and max_members <= 300)
  )
);
create index classroom_group_work_order on group_work_internal.assignments (classroom_id, created_at desc, id);

create table group_work_internal.submissions (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references group_work_internal.assignments(id) on delete cascade,
  submitted_by uuid references public.users(id) on delete set null,
  response text not null check (char_length(response) <= 10000),
  submitted_at timestamptz not null default transaction_timestamp(),
  draft_score numeric(7,2),
  draft_feedback text check (char_length(draft_feedback) <= 5000),
  published_score numeric(7,2),
  published_feedback text check (char_length(published_feedback) <= 5000),
  published_at timestamptz,
  graded_by uuid references public.users(id) on delete set null,
  revision integer not null default 0,
  unique (id, work_id),
  constraint complete_published_score check ((published_score is null) = (published_at is null))
);
create index group_work_submissions_order on group_work_internal.submissions (work_id, submitted_at, id);

create table group_work_internal.members (
  work_id uuid not null,
  submission_id uuid not null,
  student_id uuid not null references public.users(id) on delete cascade,
  name_at_submission text not null,
  class_number_at_submission smallint,
  primary key (work_id, student_id),
  foreign key (submission_id, work_id) references group_work_internal.submissions(id, work_id) on delete cascade
);
create index group_work_members_by_submission on group_work_internal.members (submission_id, work_id);
create table group_work_internal.attachments (
  path text primary key,
  submission_id uuid not null references group_work_internal.submissions(id) on delete cascade,
  filename text not null check (char_length(filename) between 1 and 180),
  kind text not null check (kind in ('pdf', 'image', 'download'))
);
create index group_work_attachments_by_submission on group_work_internal.attachments (submission_id);

create table group_work_internal.upload_slots (
  work_id uuid not null references group_work_internal.assignments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  token uuid not null,
  primary key (work_id, student_id, token)
);
alter table group_work_internal.upload_slots enable row level security;

alter table group_work_internal.assignments enable row level security;
alter table group_work_internal.submissions enable row level security;
alter table group_work_internal.members enable row level security;
alter table group_work_internal.attachments enable row level security;
revoke all on all tables in schema group_work_internal from public, anon, authenticated;
alter default privileges in schema group_work_internal revoke execute on functions from public;

create function group_work_internal.room_role(p_room uuid, p_actor uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select case
    when u.role::text = 'teacher' and (c.teacher_id = u.id or exists (
      select 1 from public.classroom_co_teachers t where t.classroom_id = c.id
        and t.user_id = u.id and t.permission in ('admin', 'manage')
    )) then 'teacher'
    when u.role::text = 'student' and exists (
      select 1 from public.classroom_students s where s.classroom_id = c.id and s.student_id = u.id
    ) then 'student'
  end
  from public.classrooms c cross join public.users u
  where c.id = p_room and c.classroom_type = 'subject' and c.status = 'active'
    and c.deleted_at is null and u.id = p_actor and u.status::text = 'active'
$$;

create function group_work_internal.classroom_roster(p_room uuid)
returns table (id uuid, name text, number smallint) language sql stable security invoker set search_path = '' as $$
  select u.id, u.full_name, p.class_number
  from public.classroom_students s join public.users u on u.id = s.student_id
  left join public.student_profiles p on p.student_id = u.id
  where s.classroom_id = p_room and u.role::text = 'student' and u.status::text = 'active'
$$;

create function group_work_internal.page(p_room uuid, p_work uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid();
  actor_role text := group_work_internal.room_role(p_room, actor);
  out_data jsonb;
begin
  if actor_role is null then raise exception 'GROUP_WORK_ACCESS' using errcode = '42501'; end if;
  if p_work is null then
    select jsonb_build_object('role', actor_role, 'roomName', c.name, 'actorId', actor,
      'works', coalesce((
        select jsonb_agg(to_jsonb(w) - 'created_by' order by w.created_at desc, w.id)
        from group_work_internal.assignments w where w.classroom_id = c.id
      ), '[]'::jsonb)) into out_data
    from public.classrooms c where c.id = p_room;
    return out_data;
  end if;
  select jsonb_build_object(
    'role', actor_role, 'roomName', c.name, 'actorId', actor, 'work', to_jsonb(w) - 'created_by',
    'roster', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'number', r.number, 'submitted', exists (
        select 1 from group_work_internal.members already where already.work_id = w.id and already.student_id = r.id
      )) order by r.number nulls last, r.name, r.id), '[]'::jsonb)
      from group_work_internal.classroom_roster(p_room) r
      where actor_role = 'teacher' or w.mode = 'group' or r.id = actor),
    'submissions', (select coalesce(jsonb_agg(
        jsonb_build_object('id', s.id, 'submitted_by', s.submitted_by, 'response', s.response,
          'submitted_at', s.submitted_at, 'published_score', s.published_score,
          'published_feedback', s.published_feedback, 'published_at', s.published_at,
          'draft_score', case when actor_role = 'teacher' then s.draft_score end,
          'draft_feedback', case when actor_role = 'teacher' then s.draft_feedback end,
          'revision', case when actor_role = 'teacher' then s.revision end,
          'members', (select coalesce(jsonb_agg(jsonb_build_object(
              'id', m.student_id, 'name', m.name_at_submission, 'number', m.class_number_at_submission
            ) order by (m.student_id = s.submitted_by) desc, m.class_number_at_submission nulls last, m.name_at_submission), '[]'::jsonb)
            from group_work_internal.members m where m.submission_id = s.id),
          'files', (select coalesce(jsonb_agg(jsonb_build_object(
              'path', f.path, 'name', f.filename, 'kind', f.kind
            ) order by f.filename, f.path), '[]'::jsonb)
            from group_work_internal.attachments f where f.submission_id = s.id)
        ) order by s.submitted_at, s.id), '[]'::jsonb)
      from group_work_internal.submissions s where s.work_id = w.id and (
        actor_role = 'teacher' or exists (
          select 1 from group_work_internal.members own where own.work_id = w.id and own.student_id = actor and own.submission_id = s.id
        ))))
  into out_data from group_work_internal.assignments w join public.classrooms c on c.id = w.classroom_id
  where w.id = p_work and w.classroom_id = p_room;
  if not found then raise exception 'GROUP_WORK_UNAVAILABLE' using errcode = 'P0002'; end if;
  return out_data;
end
$$;

create function group_work_internal.create_assignment(
  p_room uuid, p_title text, p_instructions text, p_mode text,
  p_min integer, p_max integer, p_score numeric, p_due timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
  result_id uuid;
  eligible bigint;
begin
  if group_work_internal.room_role(p_room, actor) is distinct from 'teacher' then
    raise exception 'GROUP_WORK_ACCESS' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or char_length(coalesce(p_instructions, '')) > 5000
    or p_mode is null or p_mode not in ('solo', 'group')
    or p_score is null or not (p_score > 0 and p_score <= 1000) or round(p_score, 2) <> p_score then
    raise exception 'GROUP_WORK_INVALID' using errcode = '22023';
  end if;
  if p_mode = 'group' then
    select count(*) into eligible from group_work_internal.classroom_roster(p_room);
    if p_min is null or p_max is null or p_min < 2 or p_max < p_min or p_min > eligible or p_max > 300 then
      raise exception 'GROUP_WORK_RANGE' using errcode = '22023';
    end if;
  elsif p_min is distinct from 1 or p_max is distinct from 1 then
    raise exception 'GROUP_WORK_RANGE' using errcode = '22023';
  end if;
  insert into group_work_internal.assignments
    (classroom_id, created_by, title, instructions, mode, min_members, max_members, max_score, due_at)
    values (p_room, actor, btrim(p_title), btrim(coalesce(p_instructions, '')), p_mode, p_min, p_max, p_score, p_due)
    returning id into result_id;
  return result_id;
end
$$;

-- Preauthorize only a bounded number of immutable names per actor and work.
-- Existing reservations can be retried without spending another slot.
create function group_work_internal.reserve_uploads(p_work uuid, p_tokens uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
  room uuid;
  proposed integer;
begin
  select w.classroom_id into room from group_work_internal.assignments w where w.id = p_work for update;
  if not found or group_work_internal.room_role(room, actor) is distinct from 'student' then
    raise exception 'GROUP_WORK_ACCESS' using errcode = '42501';
  end if;
  if exists (select 1 from group_work_internal.members m where m.work_id = p_work and m.student_id = actor) then
    raise exception 'GROUP_WORK_ALREADY_SUBMITTED' using errcode = '23505';
  end if;
  if p_tokens is null or cardinality(p_tokens) not between 1 and 10
    or (select count(distinct x) from unnest(p_tokens) x) <> cardinality(p_tokens) then
    raise exception 'GROUP_WORK_FILE' using errcode = '22023';
  end if;
  select count(*) into proposed from (
    select slot.token from group_work_internal.upload_slots slot where slot.work_id = p_work and slot.student_id = actor
    union select unnest(p_tokens)
  ) requested;
  if proposed > 20 then raise exception 'GROUP_WORK_UPLOAD_LIMIT' using errcode = '22023'; end if;
  insert into group_work_internal.upload_slots(work_id, student_id, token)
    select p_work, actor, token from unnest(p_tokens) token on conflict do nothing;
end
$$;

-- Storage object names use opaque ids; the original name is display metadata only.
create function group_work_internal.file_allowed(p_path text, p_operation text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid();
  target uuid;
  writer uuid;
  room uuid;
  role_in_room text;
begin
  if actor is null or p_path is null or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  target := split_part(p_path, '/', 1)::uuid;
  writer := split_part(p_path, '/', 2)::uuid;
  select w.classroom_id into room from group_work_internal.assignments w where w.id = target;
  if not found then return false; end if;
  role_in_room := group_work_internal.room_role(room, actor);
  if role_in_room is null then return false; end if;
  if p_operation = 'insert' then
    return role_in_room = 'student' and writer = actor and exists (
      select 1 from group_work_internal.upload_slots slot where slot.work_id = target
        and slot.student_id = actor and slot.token = split_part(p_path, '/', 3)::uuid
    ) and not exists (
      select 1 from group_work_internal.members m where m.work_id = target and m.student_id = actor
    );
  end if;
  if p_operation = 'read' then
    return (role_in_room = 'student' and writer = actor) or exists (
      select 1 from group_work_internal.attachments f
      join group_work_internal.submissions s on s.id = f.submission_id
      where f.path = p_path and s.work_id = target and (role_in_room = 'teacher' or exists (
        select 1 from group_work_internal.members m where m.work_id = target and m.submission_id = s.id and m.student_id = actor
      ))
    );
  end if;
  -- Never allow client deletes, even for drafts: a delete racing the submission
  -- must not leave an accepted submission pointing at a missing file.
  return false;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('classroom-group-work', 'classroom-group-work', false, 10485760, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'text/plain', 'text/csv', 'application/zip', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);
create policy classroom_group_work_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'classroom-group-work' and group_work_internal.file_allowed(name, 'insert'));
create policy classroom_group_work_read on storage.objects for select to authenticated
  using (bucket_id = 'classroom-group-work' and group_work_internal.file_allowed(name, 'read'));
-- Existing storage policies are permissive. Restrictive guards prevent any
-- broad legacy policy from inadvertently extending access to this bucket.
create policy classroom_group_work_upload_boundary on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'classroom-group-work' or group_work_internal.file_allowed(name, 'insert'));
create policy classroom_group_work_read_boundary on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'classroom-group-work' or group_work_internal.file_allowed(name, 'read'));
create policy classroom_group_work_update_boundary on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'classroom-group-work') with check (bucket_id <> 'classroom-group-work');
create policy classroom_group_work_delete_boundary on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'classroom-group-work');
create policy classroom_group_work_anonymous_boundary on storage.objects as restrictive for all to anon
  using (bucket_id <> 'classroom-group-work') with check (bucket_id <> 'classroom-group-work');

create function group_work_internal.submit(
  p_work uuid, p_request_id uuid, p_peers uuid[], p_response text, p_files jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
  work group_work_internal.assignments%rowtype;
  members uuid[];
  member_count integer;
  file_item jsonb;
  mime text;
  bytes text;
  storage_path text;
  original_name text;
  prior uuid;
begin
  select w.* into work from group_work_internal.assignments w where w.id = p_work for update;
  if not found or group_work_internal.room_role(work.classroom_id, actor) is distinct from 'student' then
    raise exception 'GROUP_WORK_ACCESS' using errcode = '42501';
  end if;
  select m.submission_id into prior from group_work_internal.members m where m.work_id = p_work and m.student_id = actor;
  if prior = p_request_id and exists (select 1 from group_work_internal.submissions s where s.id = prior and s.submitted_by = actor) then return prior; end if;
  if p_request_id is null or coalesce(cardinality(p_peers), 0) >= 300
    or p_files is null or jsonb_typeof(p_files) <> 'array' or char_length(coalesce(p_response, '')) > 10000 then
    raise exception 'GROUP_WORK_INVALID' using errcode = '22023';
  end if;
  members := array_prepend(actor, coalesce(p_peers, '{}'::uuid[]));
  member_count := cardinality(members);
  if member_count not between work.min_members and work.max_members then raise exception 'GROUP_WORK_RANGE' using errcode = '22023'; end if;
  if (select count(distinct x) from unnest(members) x) <> member_count then raise exception 'GROUP_WORK_ROSTER' using errcode = '22023'; end if;
  if (select count(*) from group_work_internal.classroom_roster(work.classroom_id) r where r.id = any(members)) <> member_count then
    raise exception 'GROUP_WORK_ROSTER' using errcode = '22023';
  end if;
  if exists (select 1 from group_work_internal.members m where m.work_id = p_work and m.student_id = any(members)) then
    raise exception 'GROUP_WORK_ALREADY_SUBMITTED' using errcode = '23505';
  end if;
  if jsonb_array_length(p_files) > 10 or (jsonb_array_length(p_files) = 0 and btrim(coalesce(p_response, '')) = '') then
    raise exception 'GROUP_WORK_CONTENT' using errcode = '22023';
  end if;
  insert into group_work_internal.submissions(id, work_id, submitted_by, response)
    values (p_request_id, p_work, actor, btrim(coalesce(p_response, '')));
  insert into group_work_internal.members(work_id, submission_id, student_id, name_at_submission, class_number_at_submission)
    select p_work, p_request_id, r.id, r.name, r.number from group_work_internal.classroom_roster(work.classroom_id) r where r.id = any(members);
  for file_item in select value from jsonb_array_elements(p_files) loop
    storage_path := file_item->>'path';
    original_name := btrim(file_item->>'name');
    if jsonb_typeof(file_item) <> 'object' or original_name is null or char_length(original_name) not between 1 and 180
      or storage_path is null or storage_path !~ ('^' || p_work::text || '/' || actor::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'GROUP_WORK_FILE' using errcode = '22023';
    end if;
    select o.metadata->>'mimetype', o.metadata->>'size' into mime, bytes from storage.objects o
      where o.bucket_id = 'classroom-group-work' and o.owner_id = actor::text and o.name = storage_path
        and o.archived_at is null and not coalesce(o.is_delete_marker, false);
    if not found or mime is null or bytes is null or bytes !~ '^[0-9]{1,8}$' or bytes::bigint not between 1 and 10485760 then
      raise exception 'GROUP_WORK_FILE' using errcode = '22023';
    end if;
    insert into group_work_internal.attachments(path, submission_id, filename, kind)
      values (storage_path, p_request_id, original_name, case when mime = 'application/pdf' then 'pdf'
        when mime in ('image/png','image/jpeg','image/webp') then 'image' else 'download' end);
  end loop;
  return p_request_id;
end
$$;

create function group_work_internal.grade(
  p_work uuid, p_submission uuid, p_score numeric, p_feedback text, p_publish boolean, p_revision integer
) returns integer language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
  work group_work_internal.assignments%rowtype;
  new_revision integer;
begin
  select w.* into work from group_work_internal.assignments w where w.id = p_work;
  if not found or group_work_internal.room_role(work.classroom_id, actor) is distinct from 'teacher' then
    raise exception 'GROUP_WORK_ACCESS' using errcode = '42501';
  end if;
  if p_score is null or not (p_score >= 0 and p_score <= work.max_score) or round(p_score, 2) <> p_score
    or p_publish is null or p_revision is null or char_length(coalesce(p_feedback, '')) > 5000 then
    raise exception 'GROUP_WORK_SCORE' using errcode = '22023';
  end if;
  update group_work_internal.submissions s set
    draft_score = case when p_publish then null else p_score end,
    draft_feedback = case when p_publish then null else btrim(coalesce(p_feedback, '')) end,
    published_score = case when p_publish then p_score else s.published_score end,
    published_feedback = case when p_publish then btrim(coalesce(p_feedback, '')) else s.published_feedback end,
    published_at = case when p_publish then transaction_timestamp() else s.published_at end,
    graded_by = case when p_publish then actor else s.graded_by end,
    revision = s.revision + 1
    where s.work_id = p_work and s.id = p_submission and s.revision = p_revision
    returning s.revision into new_revision;
  if not found then raise exception 'GROUP_WORK_STALE_GRADE' using errcode = '40001'; end if;
  return new_revision;
end
$$;

-- Public API wrappers are invokers; private implementations authorize auth.uid().
create function public.classroom_group_work_page(p_room uuid, p_work uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select group_work_internal.page(p_room, p_work)
$$;
create function public.create_classroom_group_work(p_room uuid, p_title text, p_instructions text, p_mode text,
  p_min integer, p_max integer, p_score numeric, p_due timestamptz)
returns uuid language sql security invoker set search_path = '' as $$
  select group_work_internal.create_assignment(p_room, p_title, p_instructions, p_mode, p_min, p_max, p_score, p_due)
$$;
create function public.reserve_classroom_group_work_uploads(p_work uuid, p_tokens uuid[])
returns void language sql security invoker set search_path = '' as $$
  select group_work_internal.reserve_uploads(p_work, p_tokens)
$$;
create function public.submit_classroom_group_work(p_work uuid, p_request_id uuid, p_peers uuid[], p_response text, p_files jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select group_work_internal.submit(p_work, p_request_id, p_peers, p_response, p_files)
$$;
create function public.grade_classroom_group_work(p_work uuid, p_submission uuid, p_score numeric, p_feedback text, p_publish boolean, p_revision integer)
returns integer language sql security invoker set search_path = '' as $$
  select group_work_internal.grade(p_work, p_submission, p_score, p_feedback, p_publish, p_revision)
$$;

revoke all on all functions in schema group_work_internal from public, anon, authenticated;
grant execute on function group_work_internal.page(uuid, uuid),
  group_work_internal.create_assignment(uuid, text, text, text, integer, integer, numeric, timestamptz),
  group_work_internal.file_allowed(text, text),
  group_work_internal.reserve_uploads(uuid, uuid[]),
  group_work_internal.submit(uuid, uuid, uuid[], text, jsonb),
  group_work_internal.grade(uuid, uuid, numeric, text, boolean, integer) to authenticated;

revoke all on function public.classroom_group_work_page(uuid, uuid),
  public.create_classroom_group_work(uuid, text, text, text, integer, integer, numeric, timestamptz),
  public.reserve_classroom_group_work_uploads(uuid, uuid[]),
  public.submit_classroom_group_work(uuid, uuid, uuid[], text, jsonb),
  public.grade_classroom_group_work(uuid, uuid, numeric, text, boolean, integer) from public, anon;
grant execute on function public.classroom_group_work_page(uuid, uuid),
  public.create_classroom_group_work(uuid, text, text, text, integer, integer, numeric, timestamptz),
  public.reserve_classroom_group_work_uploads(uuid, uuid[]),
  public.submit_classroom_group_work(uuid, uuid, uuid[], text, jsonb),
  public.grade_classroom_group_work(uuid, uuid, numeric, text, boolean, integer) to authenticated;
