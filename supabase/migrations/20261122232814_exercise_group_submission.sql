-- One canonical attempt and answer set for each exercise group.
alter table public.assignments
  add column submission_mode text not null default 'solo',
  add column group_min_members integer,
  add column group_max_members integer,
  add constraint exercise_group_settings check (
    (submission_mode = 'solo' and group_min_members is null and group_max_members is null)
    or (submission_mode = 'group' and type::text = 'exercise'
      and group_min_members is not null and group_max_members is not null
      and group_min_members between 2 and 300
      and group_max_members between group_min_members and 300
      and max_attempts = 1 and completion_rule::text = 'fixed')
  );

create table public.exercise_group_members (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  primary key (assignment_id, student_id)
);
create index exercise_group_members_submission on public.exercise_group_members(submission_id);
alter table public.submissions add column group_source_submission_id uuid
  references public.submissions(id) on delete cascade;
create index group_score_receipts_source on public.submissions(group_source_submission_id)
  where group_source_submission_id is not null;
alter table public.exercise_group_members enable row level security;
revoke all on public.exercise_group_members from public, anon, authenticated;
grant select, insert, update, delete on public.exercise_group_members to service_role;

create function public.guard_exercise_group_receipt()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare source public.submissions%rowtype;
begin
  if old.group_source_submission_id is null or pg_trigger_depth() > 1 then return new; end if;
  select * into strict source from public.submissions where id = old.group_source_submission_id;
  new.group_source_submission_id := old.group_source_submission_id;
  new.assignment_id := old.assignment_id;
  new.student_id := old.student_id;
  new.attempt_number := old.attempt_number;
  new.total_score := source.total_score;
  new.score_adjustment := source.score_adjustment;
  new.max_score := source.max_score;
  new.voided_max_score := source.voided_max_score;
  new.status := case when source.status::text = 'in_progress' then 'submitted'::public.submission_status else source.status end;
  new.started_at := source.started_at;
  new.submitted_at := source.submitted_at;
  new.closed_at := source.closed_at;
  new.close_reason := source.close_reason;
  return new;
end $$;
create trigger guard_exercise_group_receipt before update on public.submissions
  for each row execute function public.guard_exercise_group_receipt();
revoke all on function public.guard_exercise_group_receipt() from public, anon, authenticated;

-- Member headers are score receipts. All answers and teacher reviews remain on
-- the representative's attempt. Existing gradebooks read the synced receipts.
create function public.sync_exercise_group_receipts()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.group_source_submission_id is not null then
    return new;
  end if;
  if new.closed_at is null then return new; end if;
  insert into public.submissions(assignment_id, student_id, attempt_number,
    started_at, submitted_at, total_score, score_adjustment, max_score, voided_max_score, status,
    closed_at, close_reason, group_source_submission_id)
  select new.assignment_id, m.student_id, 1, new.started_at, new.submitted_at,
    new.total_score, new.score_adjustment, new.max_score, new.voided_max_score,
    case when new.status::text = 'in_progress' then 'submitted'::public.submission_status else new.status end,
    new.closed_at, new.close_reason, new.id
  from public.exercise_group_members m where m.submission_id = new.id and m.student_id <> new.student_id
  on conflict (assignment_id, student_id, attempt_number) do update set
    group_source_submission_id = excluded.group_source_submission_id,
    started_at = excluded.started_at, submitted_at = excluded.submitted_at,
    total_score = excluded.total_score, score_adjustment = excluded.score_adjustment,
    max_score = excluded.max_score, voided_max_score = excluded.voided_max_score, status = excluded.status,
    closed_at = excluded.closed_at, close_reason = excluded.close_reason;
  return new;
end $$;
create trigger sync_exercise_group_receipts after update on public.submissions
  for each row execute function public.sync_exercise_group_receipts();
revoke all on function public.sync_exercise_group_receipts() from public, anon, authenticated;

-- Called only after the application has checked the session, evidence and
-- exact owner. Claiming membership and freezing answers share one transaction.
create function public.claim_exercise_group_close(
  p_submission_id uuid, p_student_id uuid, p_classroom_id uuid,
  p_peers uuid[], p_expected_revision bigint
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s public.submissions%rowtype;
  a public.assignments%rowtype;
  ids uuid[] := array_prepend(p_student_id, coalesce(p_peers, '{}'::uuid[]));
  receipt jsonb;
begin
  select * into s from public.submissions where id = p_submission_id and student_id = p_student_id;
  if not found then raise exception 'GROUP_ACCESS' using errcode = '42501'; end if;
  select * into a from public.assignments where id = s.assignment_id for update;
  if a.submission_mode <> 'group' or s.group_source_submission_id is not null then
    raise exception 'GROUP_ACCESS' using errcode = '42501'; end if;
  perform 1 from public.submissions where id = s.id for update;
  if exists (select 1 from public.exercise_group_members where submission_id = s.id) then
    return public.claim_submission_close(s.id, p_student_id, false, p_expected_revision);
  end if;
  if s.closed_at is not null or s.status::text <> 'in_progress' then
    raise exception 'GROUP_CLOSED' using errcode = '42501';
  end if;
  if cardinality(ids) not between a.group_min_members and a.group_max_members then
    raise exception 'GROUP_RANGE' using errcode = '22023';
  end if;
  if cardinality(ids) <> (select count(distinct x) from unnest(ids) x) or array_position(ids, null) is not null then
    raise exception 'GROUP_ROSTER' using errcode = '22023';
  end if;
  if a.status::text <> 'published' or not exists (
    select 1 from public.assignment_classrooms ac join public.classrooms c on c.id = ac.classroom_id
    where ac.assignment_id = a.id and c.id = p_classroom_id
      and c.classroom_type = 'subject' and c.status::text = 'active' and c.deleted_at is null
  ) then raise exception 'GROUP_ACCESS' using errcode = '42501'; end if;
  if (select count(*) from public.classroom_students cs join public.users u on u.id = cs.student_id
      join public.assignment_classrooms ac on ac.classroom_id = cs.classroom_id and ac.assignment_id = a.id
      where cs.classroom_id = p_classroom_id and cs.student_id = any(ids)
        and u.role::text = 'student' and u.status::text = 'active'
        and (ac.group_ids is null or exists (
          select 1 from public.classroom_group_members gm where gm.classroom_id = cs.classroom_id
            and gm.student_id = cs.student_id and gm.group_id = any(ac.group_ids)
        ))) <> cardinality(ids) then
    raise exception 'GROUP_ROSTER' using errcode = '22023';
  end if;
  if exists (select 1 from public.submissions other
    where other.assignment_id = a.id and other.student_id = any(ids) and other.id <> s.id
      and (other.status::text <> 'in_progress' or other.closed_at is not null)) then
    raise exception 'GROUP_ALREADY_SUBMITTED' using errcode = '23505';
  end if;
  insert into public.exercise_group_members(assignment_id, submission_id, student_id, classroom_id)
    select a.id, s.id, x, p_classroom_id from unnest(ids) x;
  receipt := public.claim_submission_close(s.id, p_student_id, false, p_expected_revision);
  return receipt;
end $$;
revoke all on function public.claim_exercise_group_close(uuid,uuid,uuid,uuid[],bigint) from public, anon, authenticated;
grant execute on function public.claim_exercise_group_close(uuid,uuid,uuid,uuid[],bigint) to service_role;

-- An expired draft without a valid team remains unsubmitted. It must neither
-- gain an individual group score nor block the ordinary finalization queue.
create function public.pending_exercise_submission_finalization(p_limit integer default 40)
returns table (id uuid, student_id uuid) language sql stable security invoker set search_path = '' as $$
  select s.id, s.student_id from public.submissions s
    join public.assignments a on a.id = s.assignment_id
  where s.status::text = 'in_progress' and s.closed_at is not null
    and (a.submission_mode = 'solo' or exists (
      select 1 from public.exercise_group_members m where m.submission_id = s.id
    ))
  order by s.closed_at, s.id limit least(greatest(p_limit, 1), 100)
$$;
revoke all on function public.pending_exercise_submission_finalization(integer) from public, anon, authenticated;
grant execute on function public.pending_exercise_submission_finalization(integer) to service_role;

-- The existing student answer policy calls this gate. Group members obey the
-- same release time as the representative and cannot read another group.
create or replace function public.can_current_user_view_submission_answers(p_submission_id uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.submissions s join public.assignments a on a.id = s.assignment_id
    where s.id = p_submission_id and s.status::text in ('submitted', 'graded')
      and (s.student_id = (select auth.uid()) or exists (
        select 1 from public.exercise_group_members m where m.submission_id = s.id
          and m.student_id = (select auth.uid()) and m.assignment_id = a.id
      ))
      and (a.show_results::text = 'immediate'
        or (a.show_results::text = 'after_due' and (a.end_at is null or a.end_at < now())))
  )
$$;

-- Update the installed owner-only SEB RPC where present. Installations that
-- have not activated SEB retain their current migration set.
do $admin_owner$
declare target record; definition text;
begin
  for target in select p.oid from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_assignment_seb_quit_password_revision'
  loop
    definition := pg_catalog.pg_get_functiondef(target.oid);
    if position('actor.role::text = ''teacher''' in definition) > 0 then
      execute replace(definition, 'actor.role::text = ''teacher''', 'actor.role::text in (''teacher'', ''admin'')');
    end if;
  end loop;
end
$admin_owner$;

-- Admins who own or manage this exact classroom have the teacher capabilities.
create or replace function group_work_internal.room_role(p_room uuid, p_actor uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select case
    when u.role::text in ('teacher', 'admin') and (c.teacher_id = u.id or exists (
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
