-- One write path for the four roster fields collected during onboarding.
-- Exclude school and every other personal-profile field from this write.
create schema if not exists onboarding_internal;
revoke all on schema onboarding_internal from public, anon, authenticated;
grant usage on schema onboarding_internal to service_role;

create function onboarding_internal.save_student_education(
  p_user_id uuid,
  p_education jsonb
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  grade text := p_education->>'grade_level';
  section text := p_education->>'section_number';
  code text := regexp_replace(p_education->>'student_code', '^[[:space:]]+|[[:space:]]+$', '', 'g');
  roster_number text := p_education->>'class_number';
begin
  if jsonb_typeof(p_education) is distinct from 'object'
    or grade is null or grade not in ('ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6', 'อื่นๆ')
    or section is null or section !~ '^([1-9]|1[0-5])$'
    or jsonb_typeof(p_education->'student_code') is distinct from 'string'
    or char_length(code) not between 1 and 64
    or roster_number is null or roster_number !~ '^[1-9][0-9]{0,4}$'
  then
    return false;
  end if;
  if roster_number::integer > 32767 then
    return false;
  end if;

  insert into public.student_profiles (student_id, grade_level, section_number, student_code, class_number)
  values (p_user_id, grade, section::smallint, code, roster_number::smallint)
  on conflict (student_id) do update set
    grade_level = excluded.grade_level,
    section_number = excluded.section_number,
    student_code = excluded.student_code,
    class_number = excluded.class_number;
  return true;
end;
$$;

revoke all on function onboarding_internal.save_student_education(uuid, jsonb) from public, anon, authenticated;
grant execute on function onboarding_internal.save_student_education(uuid, jsonb) to service_role;

create function onboarding_internal.provision_signup_student_education()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'signup_student_education' and exists (
    select 1 from public.users
    where id = new.id and role = 'student' and survey_role = 'student'
  ) then
    perform onboarding_internal.save_student_education(new.id, new.raw_user_meta_data->'signup_student_education');
  end if;
  return new;
end;
$$;

revoke all on function onboarding_internal.provision_signup_student_education() from public, anon, authenticated, service_role;

-- PostgreSQL fires same-event triggers in name order. Populate education
-- after on_auth_user_created has created the referenced public.users row.
create trigger on_auth_user_created_student_education
after insert on auth.users
for each row execute function onboarding_internal.provision_signup_student_education();

-- Keep completing the account and writing education in one transaction.
-- A concurrent retry whose update loses the race cannot write any profile data.
create function public.complete_account_onboarding(
  p_user_id uuid,
  p_full_name text,
  p_role public.user_role,
  p_education jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_role is null or p_role not in ('student', 'teacher') then
    raise exception 'Unsupported onboarding role';
  end if;

  update public.users
  set full_name = p_full_name,
      role = p_role,
      survey_role = p_role::text,
      instructor_type = case when p_role = 'teacher' then 'teacher' else null end
  where id = p_user_id and role <> 'admin' and survey_role is null;

  if found and p_role = 'student' then
    if not onboarding_internal.save_student_education(p_user_id, p_education) then
      raise exception 'Invalid student education details';
    end if;
  end if;
end;
$$;

revoke all on function public.complete_account_onboarding(uuid, text, public.user_role, jsonb) from public, anon, authenticated;
grant execute on function public.complete_account_onboarding(uuid, text, public.user_role, jsonb) to service_role;
