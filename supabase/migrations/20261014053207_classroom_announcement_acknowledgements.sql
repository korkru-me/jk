-- Explicit acknowledgements are separate from legacy automatic post_reads.
-- Apply only after the target environment's migration history is reconciled.
create table public.classroom_announcement_rounds (
  post_id uuid primary key references public.classroom_posts(id) on delete cascade,
  round_no integer not null default 1 check (round_no > 0),
  reminded_at timestamptz
);
create table public.classroom_announcement_acknowledgements (
  post_id uuid not null references public.classroom_posts(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  round_no integer not null check (round_no > 0),
  acknowledged_at timestamptz not null default now(),
  primary key (post_id, student_id, round_no)
);
create index classroom_announcement_acknowledgements_student
  on public.classroom_announcement_acknowledgements(student_id, post_id, round_no);
alter table public.classroom_announcement_rounds enable row level security;
alter table public.classroom_announcement_acknowledgements enable row level security;
revoke all on public.classroom_announcement_rounds, public.classroom_announcement_acknowledgements from public, anon, authenticated;
grant all on public.classroom_announcement_rounds, public.classroom_announcement_acknowledgements to service_role;
-- Reads/writes go through authenticated server actions. There is intentionally
-- no direct authenticated-table policy: receipt identity and round are trusted
-- only after the service-only RPC validates the verified actor and exact room.

create function public.acknowledge_classroom_announcement(p_actor uuid, p_post uuid, p_round integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_room uuid; v_round integer; v_at timestamptz;
begin
  if p_actor is null or p_round is null or p_round < 1
    or not exists(select 1 from public.users where id = p_actor and role = 'student') then
    raise exception 'Announcement unavailable' using errcode = '42501';
  end if;
  select p.classroom_id into v_room from public.classroom_posts p
    join public.classrooms c on c.id = p.classroom_id and c.status = 'active'
    where p.id = p_post for update of p;
  if v_room is null or not exists(select 1 from public.classroom_students where classroom_id = v_room and student_id = p_actor) then
    raise exception 'Announcement unavailable' using errcode = '42501';
  end if;
  select coalesce((select round_no from public.classroom_announcement_rounds where post_id = p_post), 1) into v_round;
  if p_round <> v_round then raise exception 'Announcement round changed' using errcode = '40001'; end if;
  insert into public.classroom_announcement_acknowledgements(post_id, student_id, round_no)
    values (p_post, p_actor, v_round) on conflict do nothing;
  select acknowledged_at into v_at from public.classroom_announcement_acknowledgements
    where post_id = p_post and student_id = p_actor and round_no = v_round;
  return jsonb_build_object('success', true, 'round', v_round, 'acknowledgedAt', v_at);
end;
$$;

create function public.remind_classroom_announcement(p_actor uuid, p_post uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_room uuid; v_round integer; v_at timestamptz;
begin
  if p_actor is null or not exists(select 1 from public.users where id = p_actor and role in ('teacher','admin')) then
    raise exception 'Announcement unavailable' using errcode = '42501';
  end if;
  select p.classroom_id into v_room from public.classroom_posts p
    join public.classrooms c on c.id = p.classroom_id and c.status = 'active'
    where p.id = p_post for update of p;
  if v_room is null or not exists(select 1 from public.classrooms c where c.id = v_room and
    (c.teacher_id = p_actor or exists(select 1 from public.classroom_co_teachers t
      where t.classroom_id = c.id and t.user_id = p_actor and t.permission in ('admin','manage')))) then
    raise exception 'Announcement unavailable' using errcode = '42501';
  end if;
  insert into public.classroom_announcement_rounds(post_id, round_no, reminded_at)
    values (p_post, 2, clock_timestamp()) on conflict (post_id) do update
    set round_no = public.classroom_announcement_rounds.round_no + 1, reminded_at = clock_timestamp()
    returning round_no, reminded_at into v_round, v_at;
  return jsonb_build_object('round', v_round, 'remindedAt', v_at);
end;
$$;

create function public.pending_classroom_announcements(p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_actor is null or not exists(select 1 from public.users where id = p_actor and role = 'student') then
    raise exception 'Announcement unavailable' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(row_data order by pinned desc, issued_at desc, post_id) from (
    select p.id post_id, p.pinned, coalesce(r.reminded_at, p.created_at) issued_at,
      jsonb_build_object('id', p.id, 'classroomId', c.id, 'classroomName', c.name,
        'classroomDescription', c.description, 'authorName', u.full_name, 'body', p.body,
        'attachments', p.attachments, 'createdAt', p.created_at, 'editedAt', p.edited_at,
        'round', coalesce(r.round_no, 1), 'remindedAt', r.reminded_at, 'pinned', p.pinned) row_data
    from public.classroom_posts p
    join public.classrooms c on c.id = p.classroom_id and c.status = 'active'
    join public.classroom_students s on s.classroom_id = c.id and s.student_id = p_actor
    join public.users u on u.id = p.author_id
    left join public.classroom_announcement_rounds r on r.post_id = p.id
    where not exists(select 1 from public.classroom_announcement_acknowledgements a
      where a.post_id = p.id and a.student_id = p_actor and a.round_no = coalesce(r.round_no, 1))
  ) pending), '[]'::jsonb);
end;
$$;

create function public.classroom_announcement_acknowledgement_status(p_actor uuid, p_classroom uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_actor is null or not exists(select 1 from public.users where id = p_actor and role in ('teacher','admin'))
    or not exists(select 1 from public.classrooms c where c.id = p_classroom and
      (c.teacher_id = p_actor or exists(select 1 from public.classroom_co_teachers t
        where t.classroom_id = c.id and t.user_id = p_actor and t.permission in ('admin','manage')))) then
    raise exception 'Announcement unavailable' using errcode = '42501';
  end if;
  return coalesce((select jsonb_object_agg(p.id, jsonb_build_object('round', coalesce(r.round_no, 1),
    'remindedAt', r.reminded_at, 'studentIds', coalesce((select jsonb_agg(a.student_id order by a.student_id)
      from public.classroom_announcement_acknowledgements a
      join public.classroom_students s on s.student_id = a.student_id and s.classroom_id = p.classroom_id
      where a.post_id = p.id and a.round_no = coalesce(r.round_no, 1)), '[]'::jsonb)))
    from public.classroom_posts p left join public.classroom_announcement_rounds r on r.post_id = p.id
    where p.classroom_id = p_classroom), '{}'::jsonb);
end;
$$;

revoke all on function public.acknowledge_classroom_announcement(uuid, uuid, integer),
  public.remind_classroom_announcement(uuid, uuid), public.pending_classroom_announcements(uuid),
  public.classroom_announcement_acknowledgement_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.acknowledge_classroom_announcement(uuid, uuid, integer),
  public.remind_classroom_announcement(uuid, uuid), public.pending_classroom_announcements(uuid),
  public.classroom_announcement_acknowledgement_status(uuid, uuid) to service_role;
