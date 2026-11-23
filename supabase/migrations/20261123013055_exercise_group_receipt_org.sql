-- Score receipts belong to the same verified organization as their source.
-- Keep the already-applied migration immutable and preserve all existing grants.
create or replace function public.sync_exercise_group_receipts()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.group_source_submission_id is not null then
    return new;
  end if;
  if new.closed_at is null then return new; end if;
  insert into public.submissions(org_id, assignment_id, student_id, attempt_number,
    started_at, submitted_at, total_score, score_adjustment, max_score, voided_max_score, status,
    closed_at, close_reason, group_source_submission_id)
  select new.org_id, new.assignment_id, m.student_id, 1, new.started_at, new.submitted_at,
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
