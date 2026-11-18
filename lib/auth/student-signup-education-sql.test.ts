import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migration = new URL('../../supabase/migrations/20261118075735_student_signup_education.sql', import.meta.url)
const education = { grade_level: 'ม.4', section_number: 3, student_code: '00541', class_number: 13 }
const student = '00000000-0000-0000-0000-000000000001'
const teacher = '00000000-0000-0000-0000-000000000002'
const legacy = '00000000-0000-0000-0000-000000000003'
const google = '00000000-0000-0000-0000-000000000004'
const db = new PGlite()

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create type public.user_role as enum ('student', 'teacher', 'admin');
    create table public.users (
      id uuid primary key, role public.user_role, survey_role text,
      full_name text, instructor_type text
    );
    create table public.student_profiles (
      student_id uuid primary key references public.users(id),
      grade_level text, section_number smallint, student_code text,
      class_number smallint, school_name text
    );
    alter table public.student_profiles enable row level security;
    grant select, update on public.users to service_role;
    grant select, insert, update on public.student_profiles to service_role;

    create function public.handle_new_user()
    returns trigger language plpgsql as $$
    begin
      insert into public.users (id, role, survey_role)
      values (new.id, coalesce(new.raw_user_meta_data->>'role', 'student')::public.user_role,
        new.raw_user_meta_data->>'survey_role');
      return new;
    end;
    $$;
    create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();
  `)
  await db.exec(await readFile(migration, 'utf8'))
})

afterAll(async () => db.close())

function createAuthUser(id: string, metadata: object) {
  return db.query('insert into auth.users values ($1, $2::jsonb)', [id, JSON.stringify(metadata)])
}

describe('student signup education migration', () => {
  it('provisions the four fields in the same signup insert and skips teacher and legacy accounts', async () => {
    const details = { ...education, school_name: 'must not be copied' }
    await createAuthUser(student, { role: 'student', survey_role: 'student', signup_student_education: details })
    await createAuthUser(teacher, { role: 'teacher', survey_role: 'teacher', signup_student_education: details })
    await createAuthUser(legacy, { role: 'student', survey_role: 'student' })

    expect((await db.query('select * from public.student_profiles')).rows)
      .toEqual([{ student_id: student, ...education, school_name: null }])
  })

  it('keeps Google onboarding retryable on failure and commits education together with completion', async () => {
    await createAuthUser(google, {})
    await db.query('insert into public.student_profiles (student_id, school_name) values ($1, $2)', [google, 'โรงเรียนเดิม'])
    await db.exec('set role service_role')
    try {
      const finish = (details: object) => db.query(
        "select public.complete_account_onboarding($1, 'นักเรียนทดสอบ', 'student', $2::jsonb)",
        [google, JSON.stringify(details)],
      )
      await expect(finish({ ...education, class_number: 32768 })).rejects.toThrow('Invalid student education details')
      expect((await db.query('select survey_role from public.users where id = $1', [google])).rows)
        .toEqual([{ survey_role: null }])
      await finish(education)
      await finish({ ...education, student_code: 'changed-by-retry' })
      expect((await db.query('select survey_role from public.users where id = $1', [google])).rows)
        .toEqual([{ survey_role: 'student' }])
      expect((await db.query('select * from public.student_profiles where student_id = $1', [google])).rows)
        .toEqual([{ student_id: google, ...education, school_name: 'โรงเรียนเดิม' }])
    } finally {
      await db.exec('reset role')
    }
  })

  it('does not grant public clients the onboarding RPC', async () => {
    const { rows } = await db.query(`
      select has_function_privilege('anon', 'public.complete_account_onboarding(uuid,text,public.user_role,jsonb)', 'execute') as anon,
             has_function_privilege('authenticated', 'public.complete_account_onboarding(uuid,text,public.user_role,jsonb)', 'execute') as authenticated
    `)
    expect(rows).toEqual([{ anon: false, authenticated: false }])
  })
})
