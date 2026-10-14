// Throwaway Postgres only. No Supabase/Production/Auth requests.
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const TEACHER = id(1), STUDENT = id(2), FOREIGN = id(3), MANAGER = id(4), VIEWER = id(5), ROOM = id(10), OTHER_ROOM = id(11), POST = id(20), OTHER_POST = id(21)
let db: PGlite
async function rpc(name: string, args: unknown[]) {
  const allowed = ['acknowledge_classroom_announcement','remind_classroom_announcement','pending_classroom_announcements','classroom_announcement_acknowledgement_status']
  if (!allowed.includes(name)) throw new Error('Unknown fixture RPC')
  return db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE service_role')
    return (await tx.query<{ value: Record<string, unknown> | unknown[] }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value
  })
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create table public.users(id uuid primary key, role text, full_name text);
    create table public.classrooms(id uuid primary key, teacher_id uuid, status text, name text, description text);
    create table public.classroom_students(classroom_id uuid, student_id uuid, primary key(classroom_id,student_id));
    create table public.classroom_co_teachers(classroom_id uuid, user_id uuid, permission text);
    create table public.classroom_posts(id uuid primary key, classroom_id uuid, author_id uuid, body text,
      attachments jsonb default '[]', pinned boolean default false, created_at timestamptz default now(), edited_at timestamptz);
    create table public.post_reads(post_id uuid, user_id uuid, seen_at timestamptz default now());
    insert into public.users values ('${TEACHER}','teacher','ครู'),('${STUDENT}','student','นักเรียน'),('${FOREIGN}','teacher','ครูอื่น'),('${MANAGER}','teacher','ผู้ช่วย'),('${VIEWER}','teacher','ดูได้');
    insert into public.classrooms values ('${ROOM}','${TEACHER}','active','ฟิสิกส์','theme'),('${OTHER_ROOM}','${FOREIGN}','active','อื่น','theme');
    insert into public.classroom_students values ('${ROOM}','${STUDENT}');
    insert into public.classroom_co_teachers values ('${ROOM}','${MANAGER}','manage'),('${ROOM}','${VIEWER}','view');
    insert into public.classroom_posts(id,classroom_id,author_id,body) values ('${POST}','${ROOM}','${TEACHER}','ประกาศ'),('${OTHER_POST}','${OTHER_ROOM}','${FOREIGN}','ลับ');
    insert into public.post_reads(post_id,user_id) values ('${POST}','${STUDENT}');
  `)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261014053207_classroom_announcement_acknowledgements.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../supabase/migrations/20261014071012_announcement_round_conflict_response.sql', import.meta.url), 'utf8'))
}, 30000)
afterAll(async () => { await db?.close() })

describe('explicit announcement receipts', () => {
  it('legacy sightings do not acknowledge; pending feed includes only enrolled active rooms', async () => {
    const pending = await rpc('pending_classroom_announcements', [STUDENT]) as { id: string }[]
    expect(pending.map(p => p.id)).toEqual([POST])
    expect(await rpc('classroom_announcement_acknowledgement_status', [TEACHER, ROOM])).toMatchObject({ [POST]: { round: 1, studentIds: [] } })
  })
  it('explicit acknowledgement is idempotent and removes the popup', async () => {
    const first = await rpc('acknowledge_classroom_announcement', [STUDENT, POST, 1])
    const again = await rpc('acknowledge_classroom_announcement', [STUDENT, POST, 1])
    expect(again).toEqual(first)
    expect(await rpc('pending_classroom_announcements', [STUDENT])).toEqual([])
    expect(await rpc('classroom_announcement_acknowledgement_status', [TEACHER, ROOM])).toMatchObject({ [POST]: { studentIds: [STUDENT] } })
  })
  it('resend advances the round, retains old receipts and rejects an old popup', async () => {
    expect(await rpc('remind_classroom_announcement', [TEACHER, POST])).toMatchObject({ round: 2 })
    expect(await rpc('classroom_announcement_acknowledgement_status', [TEACHER, ROOM])).toMatchObject({ [POST]: { round: 2, studentIds: [] } })
    expect(await rpc('pending_classroom_announcements', [STUDENT])).toMatchObject([{ id: POST, round: 2 }])
    await expect(rpc('acknowledge_classroom_announcement', [STUDENT, POST, 1])).rejects.toMatchObject({ code: 'PT409' })
    await rpc('acknowledge_classroom_announcement', [STUDENT, POST, 2])
    expect((await db.query('select * from public.classroom_announcement_acknowledgements')).rows).toHaveLength(2)
  })
  it('authorizes exact classroom, student role and manager permission', async () => {
    await expect(rpc('remind_classroom_announcement', [FOREIGN, POST])).rejects.toMatchObject({ code: '42501' })
    await expect(rpc('remind_classroom_announcement', [VIEWER, POST])).rejects.toMatchObject({ code: '42501' })
    await expect(rpc('remind_classroom_announcement', [STUDENT, POST])).rejects.toMatchObject({ code: '42501' })
    await expect(rpc('acknowledge_classroom_announcement', [TEACHER, POST, 2])).rejects.toMatchObject({ code: '42501' })
    await expect(rpc('acknowledge_classroom_announcement', [STUDENT, OTHER_POST, 1])).rejects.toMatchObject({ code: '42501' })
    await expect(rpc('classroom_announcement_acknowledgement_status', [FOREIGN, ROOM])).rejects.toMatchObject({ code: '42501' })
    expect(await rpc('remind_classroom_announcement', [MANAGER, POST])).toMatchObject({ round: 3 })
  })
  it('un-enrolled students lose access and old receipts do not count in the roster', async () => {
    await db.exec(`delete from public.classroom_students where student_id = '${STUDENT}'`)
    expect(await rpc('pending_classroom_announcements', [STUDENT])).toEqual([])
    await expect(rpc('acknowledge_classroom_announcement', [STUDENT, POST, 3])).rejects.toMatchObject({ code: '42501' })
    expect(await rpc('classroom_announcement_acknowledgement_status', [TEACHER, ROOM])).toMatchObject({ [POST]: { studentIds: [] } })
  })
  it('blocks direct anonymous/authenticated writes and RPC spoofing', async () => {
    for (const role of ['anon','authenticated']) {
      await expect(db.transaction(async tx => { await tx.exec(`SET LOCAL ROLE ${role}`); await tx.query('select public.remind_classroom_announcement($1,$2)', [TEACHER,POST]) })).rejects.toMatchObject({ code: '42501' })
      await expect(db.transaction(async tx => { await tx.exec(`SET LOCAL ROLE ${role}`); await tx.query('select * from public.classroom_announcement_acknowledgements') })).rejects.toMatchObject({ code: '42501' })
      await expect(db.transaction(async tx => { await tx.exec(`SET LOCAL ROLE ${role}`); await tx.query('insert into public.classroom_announcement_acknowledgements(post_id,student_id,round_no) values ($1,$2,3)', [POST,STUDENT]) })).rejects.toMatchObject({ code: '42501' })
    }
  })
  it('archived classrooms cannot resend or accept a new acknowledgement', async () => {
    await db.exec(`insert into public.classroom_students values ('${ROOM}','${STUDENT}'); update public.classrooms set status='archived' where id='${ROOM}'`)
    expect(await rpc('pending_classroom_announcements', [STUDENT])).toEqual([])
    await expect(rpc('acknowledge_classroom_announcement', [STUDENT,POST,3])).rejects.toMatchObject({ code: '42501' })
    await expect(rpc('remind_classroom_announcement', [TEACHER,POST])).rejects.toMatchObject({ code: '42501' })
  })
})
