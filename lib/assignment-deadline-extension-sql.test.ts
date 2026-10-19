import { PGlite, type Transaction } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../supabase/migrations/20261019154815_extend_assignment_deadline.sql', import.meta.url), 'utf8')
const gradingMigration = readFileSync(new URL('../supabase/migrations/20261018005611_assignment_regrading_and_void.sql', import.meta.url), 'utf8')
const authorizationHelper = gradingMigration.slice(
  gradingMigration.indexOf('CREATE FUNCTION public.actor_can_manage_grading_assignment('),
  gradingMigration.indexOf('-- Capture legacy rules'),
)
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const OWNER = id(1), OTHER = id(2), MANAGER = id(3), VIEWER = id(4), STUDENT = id(5), SUPER = id(6)
const ASSIGNMENT = id(10), OTHER_ASSIGNMENT = id(11), ROOM = id(20), SECOND_ROOM = id(21)
const LEGACY = id(30), PERSONAL = id(31), LONGER = id(32), OTHER_EXTENSION = id(33)
const ORIGINAL_END = '2090-01-04T10:00:00.000Z'
const NEW_END = '2090-01-06T10:00:00.000Z'
const ORIGINAL_REVISION = '2026-10-01T00:00:00.000Z'
let db: PGlite

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.users (id uuid PRIMARY KEY, role text DEFAULT 'teacher', status text DEFAULT 'active');
    CREATE TABLE public.super_admins (user_id uuid PRIMARY KEY REFERENCES public.users(id));
    CREATE TABLE public.assignment_classrooms (assignment_id uuid, classroom_id uuid);
    CREATE TABLE public.classroom_co_teachers (classroom_id uuid, user_id uuid, permission text);
    CREATE TABLE public.assignments (
      id uuid PRIMARY KEY, created_by uuid REFERENCES public.users(id), org_id uuid,
      type text DEFAULT 'exercise', mode text DEFAULT 'online', status text DEFAULT 'published',
      title text DEFAULT 'งานทดสอบ', start_at timestamptz DEFAULT '2090-01-01T10:00:00Z',
      due_at timestamptz DEFAULT '2090-01-02T10:00:00Z', end_at timestamptz DEFAULT '${ORIGINAL_END}',
      late_bands jsonb DEFAULT '[{"starts_at":"2090-01-02T10:00:00Z"},{"starts_at":"2090-01-03T10:00:00Z"}]',
      duration_minutes integer DEFAULT 45, max_attempts integer DEFAULT 2,
      updated_at timestamptz DEFAULT '${ORIGINAL_REVISION}'
    );
    CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END
    $$;
    CREATE TRIGGER assignments_updated_at BEFORE UPDATE ON public.assignments
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
    CREATE TABLE public.assignment_extensions (
      id uuid PRIMARY KEY, assignment_id uuid REFERENCES public.assignments(id), student_id uuid,
      extended_end_at timestamptz NOT NULL, extended_due_at timestamptz,
      note text, granted_by uuid, created_at timestamptz DEFAULT '${ORIGINAL_REVISION}',
      UNIQUE(assignment_id, student_id),
      CHECK(extended_due_at IS NULL OR extended_due_at <= extended_end_at)
    );
    CREATE TABLE public.submissions (
      id uuid PRIMARY KEY, assignment_id uuid, status text, total_score numeric,
      started_at timestamptz, submitted_at timestamptz, closed_at timestamptz
    );
    CREATE TABLE public.submission_answers (id uuid PRIMARY KEY, submission_id uuid, score numeric, student_answer text);
    INSERT INTO public.users(id) VALUES ('${OWNER}'),('${OTHER}'),('${MANAGER}'),('${VIEWER}'),('${SUPER}');
    INSERT INTO public.users(id,role) VALUES ('${STUDENT}','student');
    INSERT INTO public.super_admins VALUES ('${SUPER}');
    INSERT INTO public.assignments(id,created_by,org_id) VALUES
      ('${ASSIGNMENT}','${OWNER}','${id(90)}'),('${OTHER_ASSIGNMENT}','${OTHER}','${id(91)}');
    INSERT INTO public.assignment_classrooms VALUES
      ('${ASSIGNMENT}','${ROOM}'),('${ASSIGNMENT}','${SECOND_ROOM}');
    INSERT INTO public.classroom_co_teachers VALUES
      ('${SECOND_ROOM}','${MANAGER}','manage'),('${ROOM}','${VIEWER}','view');
    INSERT INTO public.assignment_extensions(id,assignment_id,student_id,extended_end_at,extended_due_at,note,granted_by) VALUES
      ('${LEGACY}','${ASSIGNMENT}','${id(40)}','2090-01-05T10:00:00Z',NULL,'legacy note','${OWNER}'),
      ('${PERSONAL}','${ASSIGNMENT}','${id(41)}','2090-01-05T11:00:00Z','2090-01-03T11:00:00Z','personal note','${MANAGER}'),
      ('${LONGER}','${ASSIGNMENT}','${id(42)}','2090-01-09T10:00:00Z',NULL,'longer note','${OWNER}'),
      ('${OTHER_EXTENSION}','${OTHER_ASSIGNMENT}','${id(43)}','2090-01-05T10:00:00Z',NULL,'other note','${OTHER}');
    INSERT INTO public.submissions VALUES
      ('${id(50)}','${ASSIGNMENT}','submitted',0.7,'2090-01-01','2090-01-02',NULL),
      ('${id(51)}','${ASSIGNMENT}','in_progress',0.2,'2090-01-01',NULL,NULL),
      ('${id(52)}','${ASSIGNMENT}','submitted',0.3,'2090-01-01','2090-01-02','2090-01-02');
    INSERT INTO public.submission_answers VALUES ('${id(60)}','${id(50)}',0.7,'unchanged answer');
    ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.assignment_extensions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    CREATE POLICY assignments_owner ON public.assignments TO authenticated
      USING (created_by=auth.uid()) WITH CHECK (created_by=auth.uid());
    CREATE POLICY extensions_owner ON public.assignment_extensions TO authenticated
      USING (EXISTS(SELECT 1 FROM public.assignments a WHERE a.id=assignment_id AND a.created_by=auth.uid()))
      WITH CHECK (EXISTS(SELECT 1 FROM public.assignments a WHERE a.id=assignment_id AND a.created_by=auth.uid()));
    CREATE POLICY own_user ON public.users FOR SELECT TO authenticated USING(id=auth.uid());
    GRANT SELECT, UPDATE ON public.assignments TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.assignment_extensions TO authenticated;
    GRANT SELECT ON public.users TO authenticated;
  `)
  await db.exec(authorizationHelper)
  await db.exec(migration)
})
afterEach(async () => { await db?.close() })

async function asRole<T>(role: 'authenticated' | 'anon' | 'service_role', userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [userId ?? ''])
    await tx.exec(`SET LOCAL ROLE ${role}`)
    return fn(tx)
  })
}
type ExtensionOptions = { actor?: string | null; assignmentId?: string; endAt?: string | null; expectedEndAt?: string | null; expectedUpdatedAt?: string | null }
async function extend(options: ExtensionOptions = {}) {
  return asRole('authenticated', options.actor === undefined ? OWNER : options.actor, async tx => {
    const { rows } = await tx.query<{ result: { id: string; end_at: string; updated_at: string } }>(
      'SELECT public.extend_assignment_deadline($1,$2,$3,$4) AS result',
      [options.assignmentId ?? ASSIGNMENT, options.endAt === undefined ? NEW_END : options.endAt,
        options.expectedEndAt === undefined ? ORIGINAL_END : options.expectedEndAt,
        options.expectedUpdatedAt === undefined ? ORIGINAL_REVISION : options.expectedUpdatedAt],
    )
    return rows[0].result
  })
}
async function assignment(assignmentId = ASSIGNMENT) {
  return (await db.query<Record<string, unknown>>('SELECT * FROM public.assignments WHERE id=$1', [assignmentId])).rows[0]
}
async function extensions() {
  return (await db.query<Record<string, unknown>>('SELECT * FROM public.assignment_extensions ORDER BY id')).rows
}

describe('whole-assignment deadline extension transaction', () => {
  it('changes only the hard close and revision, without touching grades, attempt timers or finished states', async () => {
    const beforeAssignment = await assignment(), beforeOther = await assignment(OTHER_ASSIGNMENT)
    const beforeSubmissions = (await db.query('SELECT * FROM public.submissions ORDER BY id')).rows
    const beforeAnswers = (await db.query('SELECT * FROM public.submission_answers')).rows
    const result = await extend()
    expect(result.id).toBe(ASSIGNMENT)
    expect(new Date(result.end_at).toISOString()).toBe(NEW_END)
    expect(new Date(result.updated_at).toISOString()).not.toBe(ORIGINAL_REVISION)
    const after = await assignment()
    expect(after).toEqual({ ...beforeAssignment, end_at: new Date(NEW_END), updated_at: new Date(result.updated_at) })
    expect(await assignment(OTHER_ASSIGNMENT)).toEqual(beforeOther)
    expect((await db.query('SELECT * FROM public.submissions ORDER BY id')).rows).toEqual(beforeSubmissions)
    expect((await db.query('SELECT * FROM public.submission_answers')).rows).toEqual(beforeAnswers)
  })

  it('lifts shorter overrides atomically while preserving legacy on-time meaning and longer personal closes', async () => {
    const before = await extensions()
    await extend()
    const after = await extensions()
    expect(after.find(row => row.id === LEGACY)).toEqual({
      ...before.find(row => row.id === LEGACY), extended_due_at: new Date('2090-01-05T10:00:00Z'), extended_end_at: new Date(NEW_END),
    })
    expect(after.find(row => row.id === PERSONAL)).toEqual({ ...before.find(row => row.id === PERSONAL), extended_end_at: new Date(NEW_END) })
    expect(after.find(row => row.id === LONGER)).toEqual(before.find(row => row.id === LONGER))
    expect(after.find(row => row.id === OTHER_EXTENSION)).toEqual(before.find(row => row.id === OTHER_EXTENSION))
  })

  it.each([MANAGER, SUPER])('allows exact management through another linked room or super-admin authority (%s)', async actor => {
    expect((await extend({ actor })).id).toBe(ASSIGNMENT)
  })
  it('allows an admin co-teacher but denies organization peers and view-only co-teachers', async () => {
    for (const actor of [OTHER, VIEWER]) await expect(extend({ actor })).rejects.toMatchObject({ code: '42501' })
    await db.query("UPDATE public.classroom_co_teachers SET permission='admin' WHERE user_id=$1", [MANAGER])
    expect((await extend({ actor: MANAGER })).id).toBe(ASSIGNMENT)
  })
  it('denies students even if a malformed ownership link names them', async () => {
    await db.query('UPDATE public.assignments SET created_by=$1 WHERE id=$2', [STUDENT, ASSIGNMENT])
    await expect(extend({ actor: STUDENT })).rejects.toMatchObject({ code: '42501' })
  })
  it.each([OWNER, SUPER])('denies inactive managers, including inactive super admins (%s)', async actor => {
    await db.query("UPDATE public.users SET status='inactive' WHERE id=$1", [actor])
    await expect(extend({ actor })).rejects.toMatchObject({ code: '42501' })
  })
  it('denies missing sessions, missing assignments and unauthorized cross-assignment IDs', async () => {
    for (const options of [{ actor: null }, { assignmentId: id(99) }, { assignmentId: OTHER_ASSIGNMENT }]) {
      await expect(extend(options)).rejects.toMatchObject({ code: '42501' })
    }
  })
  it('exposes the RPC only to authenticated and keeps the private authorization helper inaccessible', async () => {
    for (const role of ['anon', 'service_role'] as const) {
      await expect(asRole(role, OWNER, tx => tx.query('SELECT public.extend_assignment_deadline($1,$2,$3,$4)',
        [ASSIGNMENT, NEW_END, ORIGINAL_END, ORIGINAL_REVISION]))).rejects.toMatchObject({ code: '42501' })
    }
    await expect(asRole('authenticated', OWNER, tx => tx.query('SELECT public.actor_can_manage_grading_assignment($1,$2)', [OWNER, ASSIGNMENT])))
      .rejects.toMatchObject({ code: '42501' })
    const definitions = (await db.query<{ prosecdef: boolean; proconfig: string[] }>(
      "SELECT prosecdef,proconfig FROM pg_proc WHERE proname='extend_assignment_deadline'",
    )).rows[0]
    expect(definitions.prosecdef).toBe(true)
    expect(definitions.proconfig).toContain('search_path=""')
  })
  it.each([
    { expectedEndAt: '2090-01-03T10:00:00Z' }, { expectedEndAt: null },
    { expectedUpdatedAt: '2026-09-30T00:00:00Z' }, { expectedUpdatedAt: null },
  ])('rejects stale or missing optimistic snapshots without any write (%j)', async options => {
    const before = await assignment(), beforeExtensions = await extensions()
    await expect(extend(options)).rejects.toMatchObject({ code: '40001' })
    expect(await assignment()).toEqual(before)
    expect(await extensions()).toEqual(beforeExtensions)
  })
  it('rejects a repeated stale save after another manager has extended the assignment', async () => {
    await extend()
    await expect(extend({ endAt: '2090-01-07T10:00:00Z' })).rejects.toMatchObject({ code: '40001' })
  })
  it.each([
    ['draft', 'online', 'exercise'], ['closed', 'online', 'exercise'],
    ['published', 'print', 'exercise'], ['published', 'online', 'survey'],
  ])('rejects unsupported assignment state (%s/%s/%s)', async (status, mode, type) => {
    await db.query('UPDATE public.assignments SET status=$1,mode=$2,type=$3 WHERE id=$4', [status, mode, type, ASSIGNMENT])
    const current = await assignment()
    await expect(extend({ expectedUpdatedAt: (current.updated_at as Date).toISOString() })).rejects.toMatchObject({ code: '22023' })
  })
  it.each([null, 'infinity', '-infinity'])('does not turn an unlimited or non-finite assignment into a limited assignment (%s)', async endAt => {
    await db.query('UPDATE public.assignments SET end_at=$1 WHERE id=$2', [endAt, ASSIGNMENT])
    const current = await assignment()
    await expect(extend({ expectedEndAt: endAt, expectedUpdatedAt: (current.updated_at as Date).toISOString() }))
      .rejects.toMatchObject({ code: '22023' })
  })
  it.each([null, 'infinity', '-infinity', ORIGINAL_END, '2090-01-04T09:59:59Z', '2000-01-01T00:00:00Z'])
    ('rejects a new close that is missing, non-finite, past or not later (%s)', async endAt => {
      await expect(extend({ endAt })).rejects.toMatchObject({ code: '22023' })
    })
  it.each(['start_at', 'due_at'])('rejects extending to or before a later schedule boundary (%s)', async column => {
    await db.exec(`UPDATE public.assignments SET ${column}='2090-01-07T10:00:00Z' WHERE id='${ASSIGNMENT}'`)
    const current = await assignment()
    await expect(extend({ expectedUpdatedAt: (current.updated_at as Date).toISOString() })).rejects.toMatchObject({ code: '22023' })
  })
  it('checks every late-band boundary and permits legacy assignments without a due date', async () => {
    await db.query("UPDATE public.assignments SET late_bands='[{\"starts_at\":\"2090-01-07T10:00:00Z\"}]' WHERE id=$1", [ASSIGNMENT])
    let current = await assignment()
    await expect(extend({ expectedUpdatedAt: (current.updated_at as Date).toISOString() })).rejects.toMatchObject({ code: '22023' })
    await db.query("UPDATE public.assignments SET due_at=NULL,start_at=NULL,late_bands='[]' WHERE id=$1", [ASSIGNMENT])
    current = await assignment()
    expect((await extend({ expectedUpdatedAt: (current.updated_at as Date).toISOString() })).id).toBe(ASSIGNMENT)
  })
  it('rolls back the global close and all earlier extension changes if any extension cannot be saved', async () => {
    await db.exec(`ALTER TABLE public.assignment_extensions ADD CONSTRAINT fixture_failure
      CHECK(id<>'${PERSONAL}' OR extended_end_at<'${NEW_END}')`)
    const before = await assignment(), beforeExtensions = await extensions()
    await expect(extend()).rejects.toMatchObject({ code: '23514' })
    expect(await assignment()).toEqual(before)
    expect(await extensions()).toEqual(beforeExtensions)
  })
  it('floors delayed legacy personal writes at the current global close while retaining their on-time boundary', async () => {
    await extend()
    await asRole('authenticated', OWNER, tx => tx.query(
      'UPDATE public.assignment_extensions SET extended_end_at=$1,extended_due_at=NULL WHERE id=$2',
      ['2090-01-05T12:00:00Z', LEGACY],
    ))
    const legacy = (await extensions()).find(row => row.id === LEGACY)
    expect(legacy).toMatchObject({ extended_end_at: new Date(NEW_END), extended_due_at: new Date('2090-01-05T12:00:00Z'), note: 'legacy note' })
    await asRole('authenticated', OWNER, tx => tx.query(
      'INSERT INTO public.assignment_extensions(id,assignment_id,student_id,extended_end_at,granted_by) VALUES($1,$2,$3,$4,$5)',
      [id(34), ASSIGNMENT, id(44), '2090-01-05T15:00:00Z', OWNER],
    ))
    expect((await extensions()).find(row => row.id === id(34))).toMatchObject({
      extended_end_at: new Date(NEW_END), extended_due_at: new Date('2090-01-05T15:00:00Z'),
    })
  })
  it('retains a longer legacy personal extension and leaves unlimited global schedules alone', async () => {
    await asRole('authenticated', OWNER, tx => tx.query(
      'UPDATE public.assignment_extensions SET extended_end_at=$1 WHERE id=$2', ['2090-01-10T10:00:00Z', LONGER],
    ))
    expect((await extensions()).find(row => row.id === LONGER)).toMatchObject({ extended_end_at: new Date('2090-01-10T10:00:00Z'), extended_due_at: null })
    await db.query('UPDATE public.assignments SET end_at=NULL WHERE id=$1', [ASSIGNMENT])
    await asRole('authenticated', OWNER, tx => tx.query(
      'UPDATE public.assignment_extensions SET extended_end_at=$1 WHERE id=$2', ['2090-01-03T10:00:00Z', LEGACY],
    ))
    expect((await extensions()).find(row => row.id === LEGACY)).toMatchObject({ extended_end_at: new Date('2090-01-03T10:00:00Z'), extended_due_at: null })
  })
  it('keeps existing direct-table RLS active for unrelated teachers', async () => {
    const result = await asRole('authenticated', OTHER, tx => tx.query('UPDATE public.assignments SET end_at=$1 WHERE id=$2 RETURNING id', [NEW_END, ASSIGNMENT]))
    expect(result.rows).toEqual([])
    await expect(asRole('authenticated', OTHER, tx => tx.query(
      'INSERT INTO public.assignment_extensions(id,assignment_id,student_id,extended_end_at,granted_by) VALUES($1,$2,$3,$4,$5)',
      [id(34), ASSIGNMENT, id(44), NEW_END, OTHER],
    ))).rejects.toMatchObject({ code: '42501' })
  })
})
