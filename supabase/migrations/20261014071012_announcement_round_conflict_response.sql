-- PostgREST 14 retries custom 40001 indefinitely. A stale application round is HTTP 409, not a serialization retry.
create or replace function public.acknowledge_classroom_announcement(p_actor uuid, p_post uuid, p_round integer)
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
  if p_round <> v_round then raise exception 'Announcement round changed' using errcode = 'PT409'; end if;
  insert into public.classroom_announcement_acknowledgements(post_id, student_id, round_no)
    values (p_post, p_actor, v_round) on conflict do nothing;
  select acknowledged_at into v_at from public.classroom_announcement_acknowledgements
    where post_id = p_post and student_id = p_actor and round_no = v_round;
  return jsonb_build_object('success', true, 'round', v_round, 'acknowledgedAt', v_at);
end;
$$;

