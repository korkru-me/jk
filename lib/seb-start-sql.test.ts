/** Real throwaway PostgreSQL semantics. PGlite has one serialized connection;
 * overlapping dispatch here is not evidence of independent transaction races. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { findPassingCompletion } from './assignment-completion'

const MIGRATION = readFileSync(new URL('../supabase/migrations/20261009142610_atomic_seb_exam_start.sql', import.meta.url), 'utf8')
const ORG = '10000000-0000-4000-8000-000000000001'
const OTHER_ORG = '10000000-0000-4000-8000-000000000002'
const OWNER = '20000000-0000-4000-8000-000000000001'
const STUDENT = '20000000-0000-4000-8000-000000000002'
const OTHER = '20000000-0000-4000-8000-000000000003'
const ASSIGNMENT = '30000000-0000-4000-8000-000000000001'
const ROOM = '40000000-0000-4000-8000-000000000001'
const GROUP = '50000000-0000-4000-8000-000000000001'
const Q1 = '60000000-0000-4000-8000-000000000001'
const Q2 = '60000000-0000-4000-8000-000000000002'
const VERSION = '2026-01-01T00:00:00.123456Z'
const RELEASE = `asr-${ASSIGNMENT.replaceAll('-', '')}-r1-${'a'.repeat(16)}`
const FUNCTION_TYPES = 'uuid,uuid,text,integer,timestamptz,timestamptz,text,text,uuid,timestamptz,jsonb,jsonb,uuid[]'
const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE TABLE public.organizations(id uuid PRIMARY KEY);
  CREATE TABLE public.users(id uuid PRIMARY KEY, status text NOT NULL);
  CREATE TABLE public.assignments(
    id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), created_by uuid NOT NULL REFERENCES users(id),
    status text NOT NULL DEFAULT 'published', mode text NOT NULL DEFAULT 'online', type text NOT NULL DEFAULT 'exam',
    secure_browser_mode text NOT NULL DEFAULT 'seb_required', start_at timestamptz, end_at timestamptz, duration_minutes integer,
    question_ids uuid[] NOT NULL, updated_at timestamptz NOT NULL, completion_rule text NOT NULL DEFAULT 'fixed',
    retry_scope text NOT NULL DEFAULT 'all', max_attempts integer, passing_type text, passing_value numeric,
    display_max_score numeric, random_question_count integer, streak_target integer
  );
  CREATE TABLE public.questions(id uuid PRIMARY KEY, created_by uuid NOT NULL, org_id uuid NOT NULL,
    visibility text NOT NULL DEFAULT 'private', is_research_snapshot boolean NOT NULL DEFAULT false,
    research_snapshot_project_id uuid, updated_at timestamptz NOT NULL, question_type text NOT NULL DEFAULT 'mcq');
  CREATE TABLE public.question_shares(question_id uuid NOT NULL REFERENCES questions(id), org_id uuid NOT NULL);
  CREATE TABLE public.education_research_measurements(assignment_id uuid UNIQUE, project_id uuid, snapshot_question_ids uuid[]);
  CREATE TABLE public.assignment_seb_config_revisions(assignment_id uuid NOT NULL REFERENCES assignments(id), revision integer NOT NULL);
  CREATE TABLE public.assignment_seb_config_releases(assignment_id uuid NOT NULL REFERENCES assignments(id), revision integer NOT NULL,
    release_id text UNIQUE NOT NULL, org_id uuid NOT NULL, owner_id uuid NOT NULL);
  CREATE TABLE public.assignment_classrooms(assignment_id uuid NOT NULL REFERENCES assignments(id), classroom_id uuid NOT NULL, group_ids uuid[]);
  CREATE TABLE public.classroom_students(classroom_id uuid NOT NULL, student_id uuid NOT NULL REFERENCES users(id), PRIMARY KEY(classroom_id, student_id));
  CREATE TABLE public.classroom_group_members(classroom_id uuid NOT NULL, student_id uuid NOT NULL, group_id uuid NOT NULL);
  CREATE TABLE public.assignment_extensions(assignment_id uuid NOT NULL, student_id uuid NOT NULL, extended_end_at timestamptz, UNIQUE(assignment_id,student_id));
  CREATE TABLE public.submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
    assignment_id uuid NOT NULL REFERENCES assignments(id), student_id uuid NOT NULL REFERENCES users(id), started_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL, max_score numeric NOT NULL, total_score numeric, attempt_number integer NOT NULL,
    exam_access_mode text NOT NULL, secure_browser_verified_at timestamptz, secure_browser_platform text, secure_browser_version text,
    seb_config_revision integer, streak_reached boolean NOT NULL DEFAULT false, UNIQUE(assignment_id,student_id,attempt_number));
  CREATE TABLE public.submission_answers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
    submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE, question_id uuid NOT NULL REFERENCES questions(id),
    random_values jsonb NOT NULL DEFAULT '{}', correct_answer text NOT NULL CHECK(correct_answer <> 'reject-me'),
    student_answer text, is_correct boolean, score numeric NOT NULL DEFAULT 0, max_score numeric NOT NULL,
    teacher_feedback text, order_index integer NOT NULL DEFAULT 0, option_order jsonb, work_images jsonb NOT NULL DEFAULT '[]',
    math_input_modes jsonb NOT NULL DEFAULT '{}', score_edited_by uuid REFERENCES users(id), score_edited_at timestamptz,
    carried_over boolean NOT NULL DEFAULT false, check_count integer NOT NULL DEFAULT 0);
`
let db: PGlite
interface Receipt { submission_id: string; started_at: string; submission_status: string; attempt_number: number; seb_config_revision: number; created: boolean }
function answers() {
  return [Q1, Q2].map((question_id, order_index) => ({ question_id, order_index, correct_answer: `MCQ:${order_index}`,
    random_values: { x: 2 }, max_score: 1, option_order: [1, 0] }))
}
type StartOptions = { student?: string; release?: string; revision?: number; predecessor?: string | null; verifiedAt?: string; validUntil?: string;
  versions?: unknown; fresh?: unknown; carried?: string[]; assignmentVersion?: string; platform?: string }
function rpc(tx: PGlite | Transaction, options: StartOptions = {}) {
  return tx.query<Receipt>(`SELECT * FROM public.start_seb_submission_atomic($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::uuid[])`, [
    ASSIGNMENT, options.student ?? STUDENT, options.release ?? RELEASE, options.revision ?? 1,
    options.verifiedAt ?? new Date(Date.now() - 1000).toISOString(), options.validUntil ?? new Date(Date.now() + 3_600_000).toISOString(),
    options.platform ?? 'windows', 'SEB_Windows_3.10.2.920', options.predecessor ?? null, options.assignmentVersion ?? VERSION,
    JSON.stringify(options.versions ?? [Q1, Q2].map(question_id => ({ question_id, updated_at: VERSION }))),
    JSON.stringify(options.fresh ?? answers()), options.carried ?? [],
  ])
}
async function start(options: StartOptions = {}) {
  return db.transaction(async tx => { await tx.exec('SET LOCAL ROLE service_role'); return rpc(tx, options) })
}
async function counts() {
  return (await db.query<{ submissions: number; answers: number }>(`SELECT
    (SELECT count(*)::integer FROM submissions) AS submissions,
    (SELECT count(*)::integer FROM submission_answers) AS answers`)).rows[0]
}
async function finish(id: string, score = 0) { await db.query(`UPDATE submissions SET status='submitted', total_score=$2 WHERE id=$1`, [id, score]) }
beforeAll(async () => { db = new PGlite(); await db.exec(SCHEMA); await db.exec(MIGRATION) }, 60_000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec(`TRUNCATE organizations, users, assignments, questions, question_shares, education_research_measurements,
    assignment_seb_config_revisions, assignment_seb_config_releases, assignment_classrooms, classroom_students,
    classroom_group_members, assignment_extensions, submissions, submission_answers CASCADE`)
  await db.query('INSERT INTO organizations VALUES ($1),($2)', [ORG, OTHER_ORG])
  await db.query(`INSERT INTO users VALUES ($1,'active'),($2,'active'),($3,'active')`, [OWNER, STUDENT, OTHER])
  await db.query('INSERT INTO assignments(id,org_id,created_by,question_ids,updated_at) VALUES ($1,$2,$3,$4,$5)', [ASSIGNMENT, ORG, OWNER, [Q1, Q2], VERSION])
  for (const q of [Q1, Q2]) await db.query('INSERT INTO questions(id,created_by,org_id,updated_at) VALUES($1,$2,$3,$4)', [q, OWNER, ORG, VERSION])
  await db.query('INSERT INTO assignment_seb_config_revisions VALUES($1,1)', [ASSIGNMENT])
  await db.query('INSERT INTO assignment_seb_config_releases VALUES($1,1,$2,$3,$4)', [ASSIGNMENT, RELEASE, ORG, OWNER])
  await db.query('INSERT INTO assignment_classrooms VALUES($1,$2,NULL)', [ASSIGNMENT, ROOM])
  await db.query('INSERT INTO classroom_students VALUES($1,$2)', [ROOM, STUDENT])
})

describe('atomic SEB start PostgreSQL boundary', () => {
  it('commits header, snapshots and derived tenant/max score together', async () => {
    const result = (await start()).rows[0]
    expect(result).toMatchObject({ created: true, submission_status: 'in_progress', attempt_number: 1, seb_config_revision: 1 })
    expect(await counts()).toEqual({ submissions: 1, answers: 2 })
    const row = (await db.query<{ org_id: string; max_score: string }>('SELECT org_id,max_score FROM submissions')).rows[0]
    expect(row.org_id).toBe(ORG); expect(Number(row.max_score)).toBe(2)
  })
  it('reuses ID, time, answer IDs and first random values for a lost-response retry', async () => {
    const first = (await start()).rows[0]
    const before = (await db.query('SELECT * FROM submission_answers ORDER BY order_index')).rows
    const fresh = answers().map(v => ({ ...v, random_values: { x: 999 }, correct_answer: 'different' }))
    expect((await start({ fresh, assignmentVersion: '2000-01-01T00:00:00Z', versions: [] })).rows[0]).toEqual({ ...first, created: false })
    expect((await db.query('SELECT * FROM submission_answers ORDER BY order_index')).rows).toEqual(before)
  })
  it('replays its completed generation without allocating another permitted attempt', async () => {
    await db.exec('UPDATE assignments SET max_attempts=3')
    const first = (await start()).rows[0]; await finish(first.submission_id)
    expect((await start()).rows[0]).toMatchObject({ submission_id: first.submission_id, created: false, submission_status: 'submitted' })
    const second = (await start({ predecessor: first.submission_id })).rows[0]
    expect(second).toMatchObject({ created: true, attempt_number: 2 })
    expect(await counts()).toEqual({ submissions: 2, answers: 4 })
  })
  it('overlapping dispatch returns one allocation on the serialized PGlite connection', async () => {
    const results = await Promise.all([start(), start(), start()])
    expect(new Set(results.map(v => v.rows[0].submission_id)).size).toBe(1)
    expect(results.filter(v => v.rows[0].created)).toHaveLength(1)
    expect(await counts()).toEqual({ submissions: 1, answers: 2 })
  })
  it('rolls back the header and earlier answer row when a later answer violates a constraint', async () => {
    const fresh = answers(); fresh[1].correct_answer = 'reject-me'
    await expect(start({ fresh })).rejects.toMatchObject({ code: '23514' })
    expect(await counts()).toEqual({ submissions: 0, answers: 0 })
  })
  it.each(['anon', 'authenticated'])('denies execute to %s', async role => {
    await expect(db.transaction(async tx => { await tx.exec(`SET LOCAL ROLE ${role}`); return rpc(tx) })).rejects.toMatchObject({ code: '42501' })
    expect(await counts()).toEqual({ submissions: 0, answers: 0 })
  })
  it('fixes search_path, leaves legacy/browser grants unchanged and grants only service execute', async () => {
    const result = await db.query<{ config: string[]; browser: boolean; service: boolean }>(`SELECT proconfig AS config,
      has_function_privilege('authenticated',oid,'EXECUTE') AS browser,
      has_function_privilege('service_role',oid,'EXECUTE') AS service
      FROM pg_proc WHERE oid=('public.start_seb_submission_atomic(${FUNCTION_TYPES})')::regprocedure`)
    expect(result.rows[0]).toMatchObject({ config: ['search_path=""'], browser: false, service: true })
    expect(MIGRATION).not.toMatch(/ALTER TABLE|CREATE POLICY|DROP FUNCTION|CREATE OR REPLACE FUNCTION/)
  })
  it.each([
    ['student', { student: OTHER }, '42501'], ['release', { release: 'wrong' }, '40001'],
    ['revision', { revision: 2 }, '40001'], ['version token', { assignmentVersion: '2000-01-01T00:00:00Z' }, '40001'],
    ['expired session', { verifiedAt: '2000-01-01T00:00:00Z', validUntil: '2000-01-01T01:00:00Z' }, 'PT410'],
    ['lifetime', { validUntil: new Date(Date.now() + 24 * 3_600_000).toISOString() }, '22023'],
    ['platform', { platform: 'android' }, '22023'],
  ] as const)('rejects wrong %s', async (_label, input, code) => {
    await expect(start(input)).rejects.toMatchObject({ code }); expect(await counts()).toEqual({ submissions: 0, answers: 0 })
  })
  it.each(["status='closed'", "mode='print'", "type='exercise'", "secure_browser_mode='browser'"])(
    'denies ineligible assignment %s', async update => {
      await db.exec(`UPDATE assignments SET ${update}`); await expect(start()).rejects.toMatchObject({ code: '42501' })
    })
  it('denies inactive account, roster removal and wrong initial group', async () => {
    await db.exec("UPDATE users SET status='inactive'"); await expect(start()).rejects.toMatchObject({ code: '42501' })
    await db.exec("UPDATE users SET status='active'")
    await db.query('UPDATE assignment_classrooms SET group_ids=$1', [[GROUP]])
    await expect(start()).rejects.toMatchObject({ code: '42501' })
    await db.query('INSERT INTO classroom_group_members VALUES($1,$2,$3)', [ROOM, STUDENT, GROUP])
    await start(); await db.exec('DELETE FROM classroom_group_members')
    expect((await start()).rows[0].created).toBe(false)
    await db.exec('DELETE FROM classroom_students'); await expect(start()).rejects.toMatchObject({ code: '42501' })
  })
  it('enforces opening, individual deadline extension and expired timer without creating a replacement', async () => {
    await db.exec("UPDATE assignments SET start_at=clock_timestamp()+interval '1 hour'")
    await expect(start()).rejects.toMatchObject({ code: 'PT410' })
    await db.exec("UPDATE assignments SET start_at=NULL,end_at=clock_timestamp()-interval '1 hour'")
    await expect(start()).rejects.toMatchObject({ code: 'PT410' })
    await db.query("INSERT INTO assignment_extensions VALUES($1,$2,clock_timestamp()+interval '1 hour')", [ASSIGNMENT, STUDENT])
    const first = (await start()).rows[0]
    await db.exec("UPDATE assignments SET duration_minutes=1; UPDATE submissions SET started_at=clock_timestamp()-interval '2 minutes'")
    await expect(start()).rejects.toMatchObject({ code: 'PT410' })
    expect((await db.query('SELECT id FROM submissions')).rows).toEqual([{ id: first.submission_id }])
  })
  it('enforces fixed attempt quota and refuses an active or foreign predecessor', async () => {
    const first = (await start()).rows[0]
    await expect(start({ predecessor: first.submission_id })).rejects.toMatchObject({ code: '40001' })
    await finish(first.submission_id)
    await expect(start({ predecessor: first.submission_id })).rejects.toMatchObject({ code: '42501' })
    await db.query('UPDATE submissions SET student_id=$1', [OTHER])
    await expect(start({ predecessor: first.submission_id })).rejects.toMatchObject({ code: '40001' })
  })
  it('blocks an earlier passing run even when the latest legacy run failed', async () => {
    await db.exec("UPDATE assignments SET passing_type='score',passing_value=1,max_attempts=1")
    const first = (await start()).rows[0]; await finish(first.submission_id, 0)
    const second = (await start({ predecessor: first.submission_id })).rows[0]; await finish(second.submission_id, 0)
    await db.query('UPDATE submissions SET total_score=2 WHERE id=$1', [first.submission_id])
    await expect(start({ predecessor: second.submission_id })).rejects.toMatchObject({ code: '42501' })
  })
  it.each([0.005, 0.015, 1.005, 4.015])('matches JS rescaled threshold rounding at raw score %s', async score => {
    const first = (await start()).rows[0]; await finish(first.submission_id, score)
    await db.exec('UPDATE submissions SET max_score=10')
    const threshold = Math.round(score * 10 / 10 * 100) / 100
    await db.query("UPDATE assignments SET passing_type='score',passing_value=$1,display_max_score=10", [threshold])
    expect(findPassingCompletion({ max_attempts: 1, type: 'exam', passing_type: 'score', passing_value: threshold,
      display_max_score: 10 }, [{ status: 'submitted', total_score: score, max_score: 10 }])).not.toBeNull()
    await expect(start({ predecessor: first.submission_id })).rejects.toMatchObject({ code: '42501' })
  })
  it('does not count null scores as passing a zero-percent threshold with zero max score', async () => {
    const first = (await start()).rows[0]; await finish(first.submission_id)
    await db.exec("UPDATE submissions SET total_score=NULL,max_score=0; UPDATE assignments SET passing_type='percent',passing_value=0")
    expect((await start({ predecessor: first.submission_id })).rows[0].created).toBe(true)
  })
  it('allows genuine empty streak start, preserves resume and blocks a completed reached streak', async () => {
    await db.exec("UPDATE assignments SET completion_rule='streak',streak_target=2")
    const first = (await start({ fresh: [] })).rows[0]
    expect(await counts()).toEqual({ submissions: 1, answers: 0 })
    expect((await start({ fresh: [] })).rows[0]).toEqual({ ...first, created: false })
    await finish(first.submission_id); await db.exec('UPDATE submissions SET streak_reached=true')
    await expect(start({ predecessor: first.submission_id, fresh: [] })).rejects.toMatchObject({ code: '42501' })
  })
  it('fails closed on legacy fixed header with no snapshots', async () => {
    await start(); await db.exec('DELETE FROM submission_answers')
    await expect(start()).rejects.toMatchObject({ code: '40001' })
    expect(await counts()).toEqual({ submissions: 1, answers: 0 })
  })
  it.each([
    [{ ...answers()[0], org_id: OTHER_ORG }, answers()[1]],
    [{ ...answers()[0], random_values: { x: 'secret' } }, answers()[1]],
    [{ ...answers()[0], max_score: -1 }, answers()[1]],
    [{ ...answers()[0], option_order: [1, 1] }, answers()[1]],
    [{ ...answers()[0], order_index: 1 }, answers()[1]],
    [answers()[0]],
  ].map(fresh => ({ fresh })))('rejects malformed or incomplete fresh snapshots %#', async ({ fresh }) => {
    await expect(start({ fresh })).rejects.toMatchObject({ code: '22023' }); expect(await counts()).toEqual({ submissions: 0, answers: 0 })
  })
  it('rejects provenance and version drift, with public/share and exact research snapshot compatibility', async () => {
    await db.query('UPDATE questions SET created_by=$1,org_id=$2', [OTHER, OTHER_ORG])
    await expect(start()).rejects.toMatchObject({ code: '42501' })
    await db.exec("UPDATE questions SET visibility='public'")
    await db.exec("UPDATE questions SET updated_at=clock_timestamp()")
    await expect(start()).rejects.toMatchObject({ code: '40001' })
    await db.query('UPDATE questions SET updated_at=$1,visibility=\'private\'', [VERSION])
    for (const q of [Q1, Q2]) await db.query('INSERT INTO question_shares VALUES($1,$2)', [q, ORG])
    await start()
  })
  it('requires exact research measurement lineage', async () => {
    await db.query('UPDATE questions SET is_research_snapshot=true,research_snapshot_project_id=$1', [GROUP])
    await expect(start()).rejects.toMatchObject({ code: '42501' })
    await db.query('INSERT INTO education_research_measurements VALUES($1,$2,$3)', [ASSIGNMENT, GROUP, [Q2, Q1]])
    await expect(start()).rejects.toMatchObject({ code: '42501' })
    await db.query('UPDATE education_research_measurements SET snapshot_question_ids=$1', [[Q1, Q2]])
    await start()
  })
  it('fails closed for a null legacy/corrupt question pool rather than relying on SQL unknown', async () => {
    await db.exec('ALTER TABLE assignments ALTER COLUMN question_ids DROP NOT NULL')
    try {
      await db.exec('UPDATE assignments SET question_ids=NULL')
      await expect(start({ versions: [], fresh: [] })).rejects.toMatchObject({ code: '22023' })
      expect(await counts()).toEqual({ submissions: 0, answers: 0 })
    } finally {
      await db.query('UPDATE assignments SET question_ids=$1', [[Q1, Q2]])
      await db.exec('ALTER TABLE assignments ALTER COLUMN question_ids SET NOT NULL')
    }
  })
  it('copies only exact carried source rows, retaining teacher edits, input modes, images and original slots', async () => {
    await db.exec("UPDATE assignments SET max_attempts=3,retry_scope='wrong_only'")
    const first = (await start()).rows[0]; await finish(first.submission_id)
    await db.query(`UPDATE submission_answers SET student_answer='saved',is_correct=true,score=max_score,
      teacher_feedback='feedback',math_input_modes='{"answer":"rad"}',work_images='["legacy-image"]',
      score_edited_by=$1,score_edited_at=$2 WHERE question_id=$3`, [OWNER, VERSION, Q1])
    await db.query('UPDATE submission_answers SET is_correct=false WHERE question_id=$1', [Q2])
    const source = (await db.query<{ id: string }>('SELECT id FROM submission_answers WHERE question_id=$1', [Q1])).rows[0].id
    await expect(start({ predecessor: first.submission_id, fresh: [answers()[1]], carried: [OTHER] })).rejects.toMatchObject({ code: '40001' })
    const second = (await start({ predecessor: first.submission_id, fresh: [answers()[1]], carried: [source] })).rows[0]
    const copied = (await db.query(`SELECT student_answer,is_correct,teacher_feedback,math_input_modes,work_images,
      score_edited_by,order_index,carried_over FROM submission_answers WHERE submission_id=$1 AND question_id=$2`, [second.submission_id, Q1])).rows[0]
    expect(copied).toEqual({ student_answer: 'saved', is_correct: true, teacher_feedback: 'feedback', math_input_modes: { answer: 'rad' },
      work_images: ['legacy-image'], score_edited_by: OWNER, order_index: 0, carried_over: true })
    expect(Number((await db.query<{ max_score: string }>('SELECT max_score FROM submissions WHERE id=$1', [second.submission_id])).rows[0].max_score)).toBe(2)
  })
  it('preserves legacy wrong-only streak retries with repeated questions and unique original slots', async () => {
    await db.exec("UPDATE assignments SET completion_rule='streak',streak_target=2,retry_scope='wrong_only'")
    const first = (await start({ fresh: [] })).rows[0]
    for (const [order, question] of [Q1, Q2, Q1].entries()) {
      await db.query(`INSERT INTO submission_answers(org_id,submission_id,question_id,correct_answer,max_score,order_index,is_correct)
        VALUES($1,$2,$3,'MCQ:0',1,$4,false)`, [ORG, first.submission_id, question, order])
    }
    await finish(first.submission_id)
    const fresh = [Q1, Q2, Q1].map((question_id, order_index) => ({ ...answers()[0], question_id, order_index }))
    const second = (await start({ predecessor: first.submission_id, fresh })).rows[0]
    expect(Number((await db.query<{ max_score: string }>('SELECT max_score FROM submissions WHERE id=$1', [second.submission_id])).rows[0].max_score)).toBe(3)
  })
})
