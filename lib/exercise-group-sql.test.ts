import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const db = new PGlite()
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const owner = id(1), student = id(2), peer = id(3), peer2 = id(4), outsider = id(5)
const room = id(10), assignment = id(11), source = id(12), second = id(13)
const migration = new URL('../supabase/migrations/20261122232814_exercise_group_submission.sql', import.meta.url)

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema group_work_internal;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create type public.submission_status as enum ('in_progress','submitted','graded');
    create table public.users(id uuid primary key, role text, status text);
    create table public.classrooms(id uuid primary key, teacher_id uuid, classroom_type text, status text, deleted_at timestamptz);
    create table public.classroom_co_teachers(classroom_id uuid,user_id uuid,permission text);
    create table public.classroom_students(classroom_id uuid, student_id uuid);
    create table public.classroom_group_members(classroom_id uuid, student_id uuid, group_id uuid);
    create table public.assignments(id uuid primary key,type text,status text,
      max_attempts integer,completion_rule text,show_results text,end_at timestamptz,duration_minutes integer);
    create table public.assignment_classrooms(assignment_id uuid,classroom_id uuid,group_ids uuid[]);
    create table public.submissions(id uuid primary key default gen_random_uuid(),
      assignment_id uuid references public.assignments(id),student_id uuid,
      attempt_number integer not null default 1, started_at timestamptz not null default now(),
      submitted_at timestamptz,total_score numeric,score_adjustment numeric default 0,max_score numeric default 20,voided_max_score numeric default 0,
      status public.submission_status default 'in_progress',closed_at timestamptz,close_reason text,answer_revision bigint default 0,
      unique(assignment_id,student_id,attempt_number));
    create function public.submission_hard_close(p_id uuid) returns timestamptz language sql as
      $$ select a.end_at from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=p_id $$;
  `)
  const original = await readFile(new URL('../supabase/migrations/20261014072745_attempt_expiry_finalization.sql', import.meta.url), 'utf8')
  await db.exec(original.slice(original.indexOf('CREATE FUNCTION public.claim_submission_close'), original.indexOf('CREATE FUNCTION public.commit_submission_grade')))
  await db.exec(await readFile(migration, 'utf8'))
  for (const [userId, role] of [[owner, 'admin'], [student, 'student'], [peer, 'student'], [peer2, 'student'], [outsider, 'admin']]) {
    await db.query("insert into public.users values ($1,$2,'active')", [userId, role])
  }
  await db.query("insert into public.classrooms values ($1,$2,'subject','active',null)", [room, owner])
  for (const userId of [student, peer, peer2]) await db.query('insert into public.classroom_students values ($1,$2)', [room, userId])
  await db.query("insert into public.assignments(id,type,status,max_attempts,completion_rule,show_results,submission_mode,group_min_members,group_max_members) values ($1,'exercise','published',1,'fixed','immediate','group',3,5)", [assignment])
  await db.query('insert into public.assignment_classrooms values ($1,$2,null)', [assignment, room])
  await db.query('insert into public.submissions(id,assignment_id,student_id) values ($1,$2,$3),($4,$2,$5)', [source, assignment, student, second, peer])
}, 20_000)
afterAll(async () => { await db.close() })

const claim = (peers: string[], revision = 0, submissionId = source, actor = student) =>
  db.query('select public.claim_exercise_group_close($1,$2,$3,$4,$5)', [submissionId, actor, room, peers, revision])

describe.sequential('one exercise answer set and shared score receipts', () => {
  it('gives an admin owner teacher capabilities and rejects unrelated admins', async () => {
    const role = async (actor: string) => (await db.query<{ role: string | null }>('select group_work_internal.room_role($1,$2) as role', [room, actor])).rows[0].role
    expect(await role(owner)).toBe('teacher')
    expect(await role(outsider)).toBeNull()
  })
  it('rejects invalid sizes, duplicates, outsiders and stale revisions without reserving members', async () => {
    await expect(claim([peer])).rejects.toThrow('GROUP_RANGE')
    await expect(claim([peer, peer])).rejects.toThrow('GROUP_ROSTER')
    await expect(claim([peer, outsider])).rejects.toThrow('GROUP_ROSTER')
    await expect(claim([peer, peer2], 1)).rejects.toThrow('answer changed')
    expect((await db.query<{ n: number }>('select count(*)::int n from public.exercise_group_members')).rows[0].n).toBe(0)
  })
  it('excludes expired drafts without a team from automatic grading and keeps solo drafts eligible', async () => {
    const soloAssignment = id(701), soloSubmission = id(702)
    await db.query("insert into public.assignments(id,type,status,max_attempts,completion_rule,show_results) values ($1,'exercise','published',1,'fixed','immediate')", [soloAssignment])
    await db.query('insert into public.submissions(id,assignment_id,student_id,closed_at) values ($1,$2,$3,now())', [soloSubmission, soloAssignment, student])
    await db.query('update public.submissions set closed_at=now() where id=$1', [source])
    const pending = (await db.query<{ id: string }>('select * from public.pending_exercise_submission_finalization(40)')).rows
    expect(pending.map(row => row.id)).toEqual([soloSubmission])
    await db.query('update public.submissions set closed_at=null where id=$1', [source])
  })
  it('freezes a single canonical source, reuses an unfinished peer header and rejects overlapping groups', async () => {
    await claim([peer, peer2])
    await claim([peer, peer2])
    const rows = (await db.query<{ id: string; group_source_submission_id: string | null }>('select id,group_source_submission_id from public.submissions where assignment_id=$1', [assignment])).rows
    expect(rows).toHaveLength(3)
    expect(rows.filter(row => row.group_source_submission_id === source)).toHaveLength(2)
    expect(rows.find(row => row.id === second)?.group_source_submission_id).toBe(source)
    await expect(claim([student, peer2], 0, second, peer)).rejects.toThrow('GROUP_ACCESS')
  })
  it('synchronizes automatic grades, teacher corrections and score adjustments to every member', async () => {
    for (const [score, adjustment] of [[18, 0], [16, -2], [20, 1]]) {
      await db.query("update public.submissions set status='graded',submitted_at=now(),total_score=$1,score_adjustment=$2 where id=$3", [score, adjustment, source])
      const rows = (await db.query<{ total_score: string; score_adjustment: string; status: string }>('select total_score,score_adjustment,status from public.submissions where assignment_id=$1', [assignment])).rows
      expect(rows).toHaveLength(3)
      expect(rows.every(row => Number(row.total_score) === score && Number(row.score_adjustment) === adjustment && row.status === 'graded')).toBe(true)
    }
    await db.query('update public.submissions set total_score=9 where id=$1', [second])
    expect(Number((await db.query<{ total_score: string }>('select total_score from public.submissions where id=$1', [second])).rows[0].total_score)).toBe(20)
  })
  it('shares answer access only with this group and respects the result-release setting', async () => {
    for (const actor of [student, peer, peer2, outsider]) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor])
      const canRead = (await db.query<{ allowed: boolean }>('select public.can_current_user_view_submission_answers($1) allowed', [source])).rows[0].allowed
      expect(canRead).toBe(actor !== outsider)
    }
    await db.query("update public.assignments set show_results='never' where id=$1", [assignment])
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [peer])
    expect((await db.query<{ allowed: boolean }>('select public.can_current_user_view_submission_answers($1) allowed', [source])).rows[0].allowed).toBe(false)
  })
  it('keeps membership writes and the close RPC unavailable to browser roles', async () => {
    await db.exec('set role authenticated')
    await expect(claim([peer, peer2])).rejects.toMatchObject({ code: '42501' })
    await expect(db.query('select * from public.exercise_group_members')).rejects.toMatchObject({ code: '42501' })
    await db.exec('reset role')
  })
})
