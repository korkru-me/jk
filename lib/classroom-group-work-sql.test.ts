import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const uid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const teacher = uid(1), manager = uid(2), observer = uid(3), author = uid(4), member1 = uid(5), member2 = uid(6), secondAuthor = uid(7), outsider = uid(8), inactive = uid(9)
const room = uid(10), externalRoom = uid(11), requestId = uid(12), fileId = uid(13)
const sqlFile = new URL('../supabase/migrations/20261115142622_classroom_group_work.sql', import.meta.url)
const db = new PGlite()
let work = ''
let object = ''

async function actor(id: string) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await db.exec('set role authenticated')
}
async function scalar<T>(statement: string, values: unknown[] = []) {
  return (await db.query<{ x: T }>(statement, values)).rows[0]?.x
}

beforeAll(async () => {
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create function auth.uid() returns uuid as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$ language sql stable;
    create schema storage;
    create table public.users(id uuid primary key, role text, status text, full_name text);
    create table public.classrooms(id uuid primary key, teacher_id uuid, name text, status text, deleted_at timestamptz, classroom_type text);
    create table public.classroom_co_teachers (classroom_id uuid, user_id uuid, permission text);
    create table public.classroom_students(classroom_id uuid, student_id uuid);
    create table public.student_profiles(student_id uuid, class_number smallint);
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, owner_id text, name text, metadata jsonb,
      archived_at timestamptz, is_delete_marker boolean);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
    grant select, insert, update, delete on storage.objects to authenticated, anon;
    create policy legacy_broad_access on storage.objects for all using (true) with check (true);
  `)
  for (const [index, id] of [teacher, manager, observer, author, member1, member2, secondAuthor, outsider, inactive].entries()) {
    await db.query('insert into public.users values ($1,$2,$3,$4)', [id, index < 3 ? 'teacher' : 'student', id === inactive ? 'pending' : 'active', `Test ${index + 1}`])
  }
  for (const [id, name] of [[room, 'Synthetic classroom'], [externalRoom, 'Other classroom']]) {
    await db.query("insert into public.classrooms values ($1,$2,$3,'active',null,'subject')", [id, teacher, name])
  }
  for (const id of [author, member1, member2, secondAuthor, inactive]) await db.query('insert into public.classroom_students values ($1,$2)', [room, id])
  await db.query('insert into public.classroom_students values ($1,$2)', [externalRoom, outsider])
  await db.query("insert into public.classroom_co_teachers values ($1,$2,'manage'),($1,$3,'view')", [room, manager, observer])
  await db.exec(await readFile(sqlFile, 'utf-8'))
}, 20_000)

afterAll(async () => { await db.close() })

describe.sequential('classroom group work database contract', () => {
  it('authorizes work creation for the room manager and requires a valid range', async () => {
    const create = 'select public.create_classroom_group_work($1,$2,$3,$4,$5,$6,$7,null) as x'
    const fields = [room, 'Group test', 'Observe the garden', 'group', 3, 5, 20]
    await actor(author)
    await expect(scalar(create, fields)).rejects.toMatchObject({ code: '42501' })
    await actor(observer)
    await expect(scalar(create, fields)).rejects.toMatchObject({ code: '42501' })
    await actor(manager)
    await expect(scalar(create, [room, 'Group', '', 'group', 5, 5, 20])).rejects.toMatchObject({ code: '22023' })
    work = await scalar<string>(create, fields) ?? ''
    expect(work).toMatch(/^[0-9a-f-]{36}$/)
    await expect(db.query('select * from group_work_internal.assignments')).rejects.toMatchObject({ code: '42501' })
    await actor(outsider)
    await expect(scalar('select public.classroom_group_work_page($1,$2) as x', [room, work])).rejects.toMatchObject({ code: '42501' })
  })

  it('requires bounded, reserved, immutable file paths even with a broad legacy storage policy', async () => {
    await actor(author)
    object = `${work}/${author}/${fileId}`
    const insert = "insert into storage.objects(bucket_id, owner_id, name, metadata) values ('classroom-group-work', $1, $2, '{\"mimetype\":\"application/pdf\",\"size\":20}'::jsonb)"
    await expect(db.query(insert, [author, object])).rejects.toMatchObject({ code: '42501' })
    await db.query('select public.reserve_classroom_group_work_uploads($1,$2)', [work, [fileId]])
    for (const n of [10, 9]) {
      await db.query('select public.reserve_classroom_group_work_uploads($1,$2)', [work, Array.from({ length: n }, (_, i) => uid(n * 100 + i))])
    }
    await expect(db.query('select public.reserve_classroom_group_work_uploads($1,$2)', [work, [uid(9999)]])).rejects.toThrow('GROUP_WORK_UPLOAD_LIMIT')
    await db.query(insert, [author, object])
    await expect(db.query(insert, [author, `${work}/${member1}/${fileId}`])).rejects.toMatchObject({ code: '42501' })
    expect(await scalar('select count(*)::int as x from storage.objects')).toBe(1)
    await db.query('delete from storage.objects where name=$1', [object])
    expect(await scalar('select count(*)::int as x from storage.objects')).toBe(1)
    await actor(member1)
    expect(await scalar('select count(*)::int as x from storage.objects')).toBe(0)
    await db.exec('set role anon')
    expect(await scalar('select count(*)::int as x from storage.objects')).toBe(0)
  })

  it('accepts only same-room members and saves one submission and its files for each eligible member', async () => {
    const submit = 'select public.submit_classroom_group_work($1,$2,$3,$4,$5) as x'
    const args = [work, requestId, [member1, member2], 'Shared answer', JSON.stringify([{ path: object, name: 'Report.pdf' }])]
    await actor(author)
    const page = await scalar<{ roster: Array<{ id: string }> }>('select public.classroom_group_work_page($1,$2) as x', [room, work])
    expect(page?.roster.map(x => x.id)).toEqual(expect.arrayContaining([author, member1, member2, secondAuthor]))
    expect(page?.roster.map(x => x.id)).not.toContain(outsider)
    expect(page?.roster.map(x => x.id)).not.toContain(inactive)
    await expect(scalar(submit, [work, requestId, [member1], 'short', '[]'])).rejects.toThrow('GROUP_WORK_RANGE')
    await expect(scalar(submit, [work, requestId, [member1, outsider], 'cross room', '[]'])).rejects.toThrow('GROUP_WORK_ROSTER')
    await expect(scalar(submit, [work, requestId, [member1, author], 'duplicate', '[]'])).rejects.toThrow('GROUP_WORK_ROSTER')
    expect(await scalar(submit, args)).toEqual(requestId)
    expect(await scalar(submit, args)).toEqual(requestId)
    for (const id of [author, member1, member2]) {
      await actor(id)
      expect(await scalar('select count(*)::int as x from storage.objects')).toBe(1)
      const result = await scalar<{ submissions: Array<{ id: string; members: unknown[] }> }>('select public.classroom_group_work_page($1,$2) as x', [room, work])
      expect(result?.submissions).toHaveLength(1)
      expect(result?.submissions[0]?.id).toBe(requestId)
      expect(result?.submissions[0]?.members).toHaveLength(3)
    }
    await actor(secondAuthor)
    await expect(scalar(submit, [work, uid(99), [member1, member2], 'overlap', '[]'])).rejects.toThrow('GROUP_WORK_ALREADY_SUBMITTED')
    expect(await scalar('select count(*)::int as x from storage.objects')).toBe(0)
  })

  it('hides drafts and publishes one score to the representative and every member', async () => {
    const grade = 'select public.grade_classroom_group_work($1,$2,$3,$4,$5,$6) as x'
    const view = 'select public.classroom_group_work_page($1,$2)->\'submissions\'->0 as x'
    await actor(member1)
    await expect(scalar(grade, [work, requestId, 18, 'Grade', true, 0])).rejects.toMatchObject({ code: '42501' })
    await actor(teacher)
    await expect(scalar(grade, [work, requestId, 21, '', true, 0])).rejects.toThrow('GROUP_WORK_SCORE')
    expect(await scalar(grade, [work, requestId, 15, 'Draft', false, 0])).toBe(1)
    await actor(member1)
    expect(await scalar(view, [room, work])).toMatchObject({ draft_score: null, draft_feedback: null, published_score: null, published_feedback: null })
    await actor(teacher)
    await expect(scalar(grade, [work, requestId, 18, 'Stale', true, 0])).rejects.toThrow('GROUP_WORK_STALE_GRADE')
    expect(await scalar(grade, [work, requestId, 18, 'Shared grade', true, 1])).toBe(2)
    for (const id of [author, member1, member2]) {
      await actor(id)
      expect(await scalar(view, [room, work])).toMatchObject({ id: requestId, published_score: 18, published_feedback: 'Shared grade' })
    }
    await actor(secondAuthor)
    expect(await scalar(view, [room, work])).toBeNull()
  })
})
