import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../supabase/migrations/20261014072745_attempt_expiry_finalization.sql', import.meta.url), 'utf8')
// PGlite cannot load hosted cron/net extensions. Run the actual boundary and
// transaction SQL; scheduling/HTTP is separately verified on Staging.
const sql = migration.replace('CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;', '')
  .replace(/DO \$\$ BEGIN[\s\S]*?END \$\$;\s*$/, '')
const S = '70000000-0000-4000-8000-000000000001'
const A = '30000000-0000-4000-8000-000000000001'
const U = '20000000-0000-4000-8000-000000000001'
const ANSWER = '60000000-0000-4000-8000-000000000001'
let db: PGlite
beforeEach(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.assignments (id uuid PRIMARY KEY, type text, duration_minutes integer, end_at timestamptz);
    CREATE TABLE public.submissions (id uuid PRIMARY KEY, assignment_id uuid, student_id uuid, started_at timestamptz,
      submitted_at timestamptz, total_score numeric, max_score numeric, status text);
    CREATE TABLE public.assignment_extensions (assignment_id uuid, student_id uuid, extended_end_at timestamptz);
    CREATE TABLE public.submission_answers (id uuid PRIMARY KEY, submission_id uuid, student_answer text,
      work_images jsonb, math_input_modes jsonb, random_values jsonb, correct_answer text,
      carried_over boolean DEFAULT false, is_correct boolean, score numeric DEFAULT 0, max_score numeric, check_count integer);
    CREATE TABLE public.student_work_artifacts (id uuid PRIMARY KEY, submission_answer_id uuid);
  `)
  await db.exec(sql)
})
afterEach(async () => { await db.close() })

async function seed(type: string) {
  await db.query('INSERT INTO assignments VALUES ($1, $2, 30, NULL)', [A, type])
  await db.query(`INSERT INTO submissions(id,assignment_id,student_id,started_at,status,max_score)
    VALUES ($1,$2,$3,clock_timestamp(),'in_progress',10)`, [S,A,U])
  await db.query(`INSERT INTO submission_answers(id,submission_id,student_answer,correct_answer,max_score)
    VALUES ($1,$2,'10','10',10)`, [ANSWER,S])
}
async function expired() { await db.query("UPDATE submissions SET started_at=clock_timestamp()-interval '31 minutes' WHERE id=$1", [S]) }
async function header() { return (await db.query<Record<string, unknown>>('SELECT * FROM submissions WHERE id=$1',[S])).rows[0] }

describe.each(['exam','exercise'])('%s database closure', type => {
  beforeEach(async () => { await seed(type) })
  it('closes abandoned attempts without a browser and retains the exact cutoff', async () => {
    await expired()
    expect((await db.query<{ count: number }>('SELECT close_expired_submission_attempts() AS count')).rows[0].count).toBe(1)
    const row = await header()
    expect(row.close_reason).toBe('time_limit')
    expect(row.closed_at).not.toBeNull()
    expect(row.status).toBe('in_progress') // closed and queued, never a provisional zero score
    expect((await db.query<{ exact: boolean }>('SELECT closed_at=submission_hard_close(id) AS exact FROM submissions')).rows[0].exact).toBe(true)
    expect((await db.query<{ count: number }>('SELECT close_expired_submission_attempts() AS count')).rows[0].count).toBe(0)
  })
  it('rejects late/offline answers even before the scheduler next runs', async () => {
    await expired()
    await expect(db.query('UPDATE submission_answers SET student_answer=$1 WHERE id=$2',['late',ANSWER])).rejects.toMatchObject({ code: 'PT425' })
    expect((await db.query<{ student_answer: string }>('SELECT student_answer FROM submission_answers')).rows[0].student_answer).toBe('10')
  })
  it('keeps saved answers on reconnect before cutoff and revision-fences manual submission', async () => {
    await db.query('UPDATE submission_answers SET student_answer=$1 WHERE id=$2',['9',ANSWER])
    const row = await header()
    await expect(db.query('SELECT claim_submission_close($1,$2,false,0)',[S,U])).rejects.toMatchObject({ code: 'PT409' })
    await db.query('SELECT claim_submission_close($1,$2,false,$3)',[S,U,row.answer_revision])
    await expect(db.query('UPDATE submission_answers SET student_answer=$1 WHERE id=$2',['late',ANSWER])).rejects.toMatchObject({ code: 'PT425' })
  })
  it('rejects early forced closure and another student, with private RPC permissions', async () => {
    await expect(db.query('SELECT claim_submission_close($1,$2,true,NULL)',[S,U])).rejects.toMatchObject({ code: 'PT425' })
    await expect(db.query('SELECT claim_submission_close($1,$2,true,NULL)',[S,A])).rejects.toMatchObject({ code: '42501' })
    const grants = await db.query<{ allowed: boolean }>("SELECT has_function_privilege('authenticated','public.claim_submission_close(uuid,uuid,boolean,bigint)','EXECUTE') AS allowed")
    expect(grants.rows[0].allowed).toBe(false)
  })
  it('commits all grades once and preserves a later teacher adjustment on retries', async () => {
    await expired(); await db.query('SELECT close_expired_submission_attempts()')
    const updates = JSON.stringify([{ id: ANSWER, score: 10, is_correct: true }])
    await db.query('SELECT commit_submission_grade($1,$2,$3::jsonb)',[S,U,updates])
    const row = await header()
    expect(row.status).toBe('submitted'); expect(row.total_score).toBe('10')
    expect(row.submitted_at).toEqual(row.closed_at)
    await db.query("UPDATE submissions SET total_score=8,status='graded' WHERE id=$1",[S])
    await db.query('SELECT commit_submission_grade($1,$2,$3::jsonb)',[S,U,updates])
    expect((await header()).total_score).toBe('8')
  })
  it('rolls back malformed grade batches instead of partially scoring', async () => {
    await expired(); await db.query('SELECT close_expired_submission_attempts()')
    await expect(db.query('SELECT commit_submission_grade($1,$2,$3::jsonb)',[S,U,JSON.stringify([{id:A,score:10,is_correct:true}])])).rejects.toThrow()
    expect((await header()).status).toBe('in_progress')
    expect((await db.query<{ score: string }>('SELECT score FROM submission_answers')).rows[0].score).toBe('0')
  })
  it('uses the hard close for an untimed attempt and honours an individual extension', async () => {
    await db.query("UPDATE assignments SET duration_minutes=NULL,end_at=clock_timestamp()-interval '1 minute'")
    await db.query("INSERT INTO assignment_extensions VALUES($1,$2,clock_timestamp()+interval '1 hour')",[A,U])
    expect((await db.query<{ count: number }>('SELECT close_expired_submission_attempts() AS count')).rows[0].count).toBe(0)
    await db.query('DELETE FROM assignment_extensions')
    expect((await db.query<{ count: number }>('SELECT close_expired_submission_attempts() AS count')).rows[0].count).toBe(1)
    expect((await header()).close_reason).toBe('close_time')
  })
})
