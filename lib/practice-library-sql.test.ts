import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite, type Transaction } from '@electric-sql/pglite'

const migration = readFileSync(
  new URL('../supabase/migrations/20261012155740_self_practice_library.sql', import.meta.url),
  'utf8',
)

const ORG_A = '10000000-0000-4000-8000-000000000001'
const ORG_B = '10000000-0000-4000-8000-000000000002'
const OWNER_A = '20000000-0000-4000-8000-000000000001'
const OWNER_B = '20000000-0000-4000-8000-000000000002'
const CO_MANAGE = '20000000-0000-4000-8000-000000000003'
const CO_VIEW = '20000000-0000-4000-8000-000000000004'
const STUDENT_A = '20000000-0000-4000-8000-000000000005'
const STUDENT_B = '20000000-0000-4000-8000-000000000006'
const STUDENT_OTHER_ROOM = '20000000-0000-4000-8000-000000000007'
const SUSPENDED_STUDENT = '20000000-0000-4000-8000-000000000008'
const ROOM_A = '30000000-0000-4000-8000-000000000001'
const ROOM_B = '30000000-0000-4000-8000-000000000002'
const ROOM_DELETE = '30000000-0000-4000-8000-000000000003'
const QUESTION_A1 = '40000000-0000-4000-8000-000000000001'
const QUESTION_A2 = '40000000-0000-4000-8000-000000000002'
const QUESTION_B = '40000000-0000-4000-8000-000000000003'
const LIBRARY = '50000000-0000-4000-8000-000000000001'
const LIBRARY_DELETE = '50000000-0000-4000-8000-000000000002'

let db: PGlite

type Actor = { role: 'anon' } | { role: 'authenticated'; userId: string } | { role: 'service_role' }
const user = (userId: string): Actor => ({ role: 'authenticated', userId })
const service: Actor = { role: 'service_role' }

async function as<T>(actor: Actor, fn: (tx: Transaction) => Promise<T>, keep = false): Promise<T> {
  let value!: T
  await db.transaction(async tx => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [
      actor.role === 'authenticated' ? actor.userId : '',
    ])
    await tx.exec(`SET LOCAL ROLE ${actor.role}`)
    value = await fn(tx)
    if (!keep) await tx.rollback()
  })
  return value
}

async function visibleLibraryIds(actor: Actor): Promise<string[]> {
  return as(actor, async tx => (
    await tx.query<{ id: string }>('SELECT id FROM public.practice_libraries ORDER BY id')
  ).rows.map(row => row.id))
}

async function attemptCount(actor: Actor): Promise<number> {
  return as(actor, async tx => (
    await tx.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM public.practice_answer_attempts',
    )
  ).rows[0].count)
}

async function recordAttempt(
  tx: Transaction,
  actorId: string,
  questionId: string,
  key: string,
): Promise<{ question_id: string; created: boolean; checked_at: Date }> {
  return (await tx.query<{ question_id: string; created: boolean; checked_at: Date }>(
    `SELECT question_id, created, checked_at
     FROM public.record_practice_answer_attempt($1, $2, $3, $4)`,
    [actorId, LIBRARY, questionId, key],
  )).rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$;

    CREATE TABLE public.organizations (id uuid PRIMARY KEY);
    CREATE TABLE public.users (
      id uuid PRIMARY KEY,
      role text NOT NULL,
      status text NOT NULL
    );
    CREATE TABLE public.classrooms (
      id uuid PRIMARY KEY,
      org_id uuid NOT NULL REFERENCES public.organizations(id),
      teacher_id uuid NOT NULL REFERENCES public.users(id),
      status text NOT NULL DEFAULT 'active',
      classroom_type text NOT NULL DEFAULT 'subject'
    );
    CREATE TABLE public.classroom_co_teachers (
      classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES public.users(id),
      permission text NOT NULL,
      PRIMARY KEY (classroom_id, user_id)
    );
    CREATE TABLE public.classroom_students (
      classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
      student_id uuid NOT NULL REFERENCES public.users(id),
      PRIMARY KEY (classroom_id, student_id)
    );
    CREATE TABLE public.questions (
      id uuid PRIMARY KEY,
      created_by uuid NOT NULL REFERENCES public.users(id),
      is_research_snapshot boolean NOT NULL DEFAULT false
    );
    ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY questions_owner_select ON public.questions
      FOR SELECT TO authenticated USING (created_by = auth.uid());
    GRANT SELECT ON public.questions TO authenticated;

    INSERT INTO public.organizations VALUES ('${ORG_A}'), ('${ORG_B}');
    INSERT INTO public.users VALUES
      ('${OWNER_A}', 'teacher', 'active'),
      ('${OWNER_B}', 'teacher', 'active'),
      ('${CO_MANAGE}', 'teacher', 'active'),
      ('${CO_VIEW}', 'teacher', 'active'),
      ('${STUDENT_A}', 'student', 'active'),
      ('${STUDENT_B}', 'student', 'active'),
      ('${STUDENT_OTHER_ROOM}', 'student', 'active'),
      ('${SUSPENDED_STUDENT}', 'student', 'suspended');
    INSERT INTO public.classrooms VALUES
      ('${ROOM_A}', '${ORG_A}', '${OWNER_A}', 'active', 'subject'),
      ('${ROOM_B}', '${ORG_B}', '${OWNER_B}', 'active', 'subject');
    INSERT INTO public.classroom_co_teachers VALUES
      ('${ROOM_A}', '${CO_MANAGE}', 'manage'),
      ('${ROOM_A}', '${CO_VIEW}', 'view'),
      -- Deliberately malformed relation: role checks must stop a student from
      -- escalating through a guessed/legacy co-teacher row.
      ('${ROOM_A}', '${STUDENT_B}', 'manage');
    INSERT INTO public.classroom_students VALUES
      ('${ROOM_A}', '${STUDENT_A}'),
      ('${ROOM_A}', '${STUDENT_B}'),
      ('${ROOM_A}', '${SUSPENDED_STUDENT}'),
      ('${ROOM_B}', '${STUDENT_OTHER_ROOM}');
    INSERT INTO public.questions VALUES
      ('${QUESTION_A1}', '${OWNER_A}', false),
      ('${QUESTION_A2}', '${OWNER_A}', false),
      ('${QUESTION_B}', '${OWNER_B}', false);
  `)
  await db.exec(migration)
  await as(user(OWNER_A), async tx => {
    await tx.query(
      `INSERT INTO public.practice_libraries
        (id, org_id, classroom_id, created_by, title)
       VALUES ($1, $2, $3, $4, 'คลังทดสอบ')`,
      [LIBRARY, ORG_A, ROOM_A, OWNER_A],
    )
    await tx.query(
      `INSERT INTO public.practice_library_questions
        (library_id, question_id, position)
       VALUES ($1, $2, 0), ($1, $3, 1)`,
      [LIBRARY, QUESTION_A1, QUESTION_A2],
    )
    await tx.query(
      `UPDATE public.practice_libraries SET status = 'published' WHERE id = $1`,
      [LIBRARY],
    )
  }, true)
}, 60_000)

afterAll(async () => { await db?.close() })

describe('self-practice migration privacy contract', () => {
  it('creates exactly five durable attempt fields and no grading payload', async () => {
    const { rows } = await db.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'practice_answer_attempts'
      ORDER BY ordinal_position
    `)
    expect(rows.map(row => row.column_name)).toEqual([
      'library_id',
      'student_id',
      'question_id',
      'checked_at',
      'idempotency_key',
    ])
  })

  it('makes the append RPC security-definer with an empty path and service-only execution', async () => {
    const fn = (await db.query<{ prosecdef: boolean; proconfig: string[] }>(`
      SELECT prosecdef, proconfig
      FROM pg_proc
      WHERE oid = 'public.record_practice_answer_attempt(uuid,uuid,uuid,uuid)'::regprocedure
    `)).rows[0]
    expect(fn).toEqual({ prosecdef: true, proconfig: ['search_path=""'] })

    const grants = (await db.query<{
      anon_can: boolean
      authenticated_can: boolean
      service_can: boolean
      direct_insert: boolean
      authenticated_checked_at: boolean
      authenticated_idempotency_key: boolean
      service_insert: boolean
      service_update: boolean
      service_delete: boolean
      service_question_id: boolean
      service_checked_at: boolean
      service_library_insert: boolean
      service_library_update: boolean
      service_library_delete: boolean
      service_membership_insert: boolean
      service_membership_update: boolean
      service_membership_delete: boolean
    }>(`
      SELECT
        has_function_privilege('anon', 'public.record_practice_answer_attempt(uuid,uuid,uuid,uuid)', 'EXECUTE') AS anon_can,
        has_function_privilege('authenticated', 'public.record_practice_answer_attempt(uuid,uuid,uuid,uuid)', 'EXECUTE') AS authenticated_can,
        has_function_privilege('service_role', 'public.record_practice_answer_attempt(uuid,uuid,uuid,uuid)', 'EXECUTE') AS service_can,
        has_table_privilege('authenticated', 'public.practice_answer_attempts', 'INSERT') AS direct_insert,
        has_column_privilege('authenticated', 'public.practice_answer_attempts', 'checked_at', 'SELECT') AS authenticated_checked_at,
        has_column_privilege('authenticated', 'public.practice_answer_attempts', 'idempotency_key', 'SELECT') AS authenticated_idempotency_key,
        has_table_privilege('service_role', 'public.practice_answer_attempts', 'INSERT') AS service_insert,
        has_table_privilege('service_role', 'public.practice_answer_attempts', 'UPDATE') AS service_update,
        has_table_privilege('service_role', 'public.practice_answer_attempts', 'DELETE') AS service_delete,
        has_column_privilege('service_role', 'public.practice_answer_attempts', 'question_id', 'SELECT') AS service_question_id,
        has_column_privilege('service_role', 'public.practice_answer_attempts', 'checked_at', 'SELECT') AS service_checked_at,
        has_table_privilege('service_role', 'public.practice_libraries', 'INSERT') AS service_library_insert,
        has_table_privilege('service_role', 'public.practice_libraries', 'UPDATE') AS service_library_update,
        has_table_privilege('service_role', 'public.practice_libraries', 'DELETE') AS service_library_delete,
        has_table_privilege('service_role', 'public.practice_library_questions', 'INSERT') AS service_membership_insert,
        has_table_privilege('service_role', 'public.practice_library_questions', 'UPDATE') AS service_membership_update,
        has_table_privilege('service_role', 'public.practice_library_questions', 'DELETE') AS service_membership_delete
    `)).rows[0]
    expect(grants).toEqual({
      anon_can: false,
      authenticated_can: false,
      service_can: true,
      direct_insert: false,
      authenticated_checked_at: false,
      authenticated_idempotency_key: false,
      service_insert: false,
      service_update: false,
      service_delete: false,
      service_question_id: true,
      service_checked_at: false,
      service_library_insert: false,
      service_library_update: false,
      service_library_delete: false,
      service_membership_insert: false,
      service_membership_update: false,
      service_membership_delete: false,
    })
  })

  it('does not leave schema-owner default privileges on authenticated tables', async () => {
    const { rows } = await db.query<{
      table_name: string
      can_truncate: boolean
      can_trigger: boolean
      can_reference: boolean
    }>(`
      SELECT table_name,
        has_table_privilege('authenticated', 'public.' || table_name, 'TRUNCATE') AS can_truncate,
        has_table_privilege('authenticated', 'public.' || table_name, 'TRIGGER') AS can_trigger,
        has_table_privilege('authenticated', 'public.' || table_name, 'REFERENCES') AS can_reference
      FROM (VALUES
        ('practice_libraries'),
        ('practice_library_questions'),
        ('practice_answer_attempts')
      ) AS practice_tables(table_name)
      ORDER BY table_name
    `)
    expect(rows).toEqual([
      {
        table_name: 'practice_answer_attempts',
        can_truncate: false,
        can_trigger: false,
        can_reference: false,
      },
      {
        table_name: 'practice_libraries',
        can_truncate: false,
        can_trigger: false,
        can_reference: false,
      },
      {
        table_name: 'practice_library_questions',
        can_truncate: false,
        can_trigger: false,
        can_reference: false,
      },
    ])
  })
})

describe('self-practice RLS boundaries', () => {
  it('lets the owner and all co-teachers read metadata, but hides it across rooms', async () => {
    expect(await visibleLibraryIds(user(OWNER_A))).toEqual([LIBRARY])
    expect(await visibleLibraryIds(user(CO_MANAGE))).toEqual([LIBRARY])
    expect(await visibleLibraryIds(user(CO_VIEW))).toEqual([LIBRARY])
    expect(await visibleLibraryIds(user(OWNER_B))).toEqual([])
  })

  it('lets active roster members read the published library but denies other and suspended students', async () => {
    expect(await visibleLibraryIds(user(STUDENT_A))).toEqual([LIBRARY])
    expect(await visibleLibraryIds(user(STUDENT_OTHER_ROOM))).toEqual([])
    expect(await visibleLibraryIds(user(SUSPENDED_STUDENT))).toEqual([])
  })

  it('does not treat a student co-teacher row as teacher or progress access', async () => {
    expect(await visibleLibraryIds(user(STUDENT_B))).toEqual([LIBRARY])
    const updated = await as(user(STUDENT_B), async tx => (
      await tx.query<{ id: string }>(
        `UPDATE public.practice_libraries SET title = 'ยึดคลัง'
         WHERE id = $1 RETURNING id`,
        [LIBRARY],
      )
    ).rows)
    expect(updated).toEqual([])
  })

  it('lets only owner/admin/manage see all progress; view-only co-teachers see none', async () => {
    const KEY_A = '60000000-0000-4000-8000-000000000001'
    const KEY_B = '60000000-0000-4000-8000-000000000002'
    await as(service, async tx => {
      await recordAttempt(tx, STUDENT_A, QUESTION_A1, KEY_A)
      await recordAttempt(tx, STUDENT_B, QUESTION_A2, KEY_B)
    }, true)

    expect(await attemptCount(user(OWNER_A))).toBe(2)
    expect(await attemptCount(user(CO_MANAGE))).toBe(2)
    expect(await attemptCount(user(CO_VIEW))).toBe(0)
    expect(await attemptCount(user(OWNER_B))).toBe(0)
    expect(await attemptCount(user(STUDENT_A))).toBe(1)
    expect(await attemptCount(user(STUDENT_B))).toBe(1)
  })

  it('rejects direct attempt writes even from a roster member', async () => {
    await expect(as(user(STUDENT_A), tx => tx.query(`
      INSERT INTO public.practice_answer_attempts
        (library_id, student_id, question_id, idempotency_key)
      VALUES ('${LIBRARY}', '${STUDENT_A}', '${QUESTION_A1}',
        '60000000-0000-4000-8000-000000000099')
    `))).rejects.toMatchObject({ code: '42501' })
  })
})

describe('self-practice lifecycle and idempotency', () => {
  it('forces every inserted library to draft with server-controlled lifecycle timestamps', async () => {
    const row = await as(user(OWNER_A), async tx => (
      await tx.query<{ status: string; published_at: Date | null; closed_at: Date | null }>(
        `INSERT INTO public.practice_libraries
          (org_id, classroom_id, created_by, title, status, published_at, closed_at)
         VALUES ($1, $2, $3, 'พยายามข้ามร่าง', 'published', now(), now())
         RETURNING status, published_at, closed_at`,
        [ORG_A, ROOM_A, OWNER_A],
      )
    ).rows[0])
    expect(row).toEqual({ status: 'draft', published_at: null, closed_at: null })
  })

  it('returns the original event for a retry and creates a new event for a new key', async () => {
    const RETRY = '70000000-0000-4000-8000-000000000001'
    const NEXT = '70000000-0000-4000-8000-000000000002'
    await as(service, async tx => {
      const first = await recordAttempt(tx, STUDENT_A, QUESTION_A1, RETRY)
      const retry = await recordAttempt(tx, STUDENT_A, QUESTION_A1, RETRY)
      const next = await recordAttempt(tx, STUDENT_A, QUESTION_A1, NEXT)
      expect(first.created).toBe(true)
      expect(retry.created).toBe(false)
      expect(retry.checked_at.toISOString()).toBe(first.checked_at.toISOString())
      expect(next.created).toBe(true)
    }, true)

    const count = (await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM public.practice_answer_attempts
       WHERE student_id = $1 AND idempotency_key IN ($2, $3)`,
      [STUDENT_A, RETRY, NEXT],
    )).rows[0].count
    expect(count).toBe(2)
  })

  it('rejects key reuse for a different question and rejects invalid actor scope', async () => {
    const KEY = '80000000-0000-4000-8000-000000000001'
    await as(service, tx => recordAttempt(tx, STUDENT_A, QUESTION_A1, KEY), true)
    await expect(as(service, tx => recordAttempt(tx, STUDENT_A, QUESTION_A2, KEY)))
      .rejects.toMatchObject({ code: '22023' })
    await expect(as(service, tx => recordAttempt(
      tx,
      STUDENT_OTHER_ROOM,
      QUESTION_A1,
      '80000000-0000-4000-8000-000000000002',
    ))).rejects.toMatchObject({ code: '42501' })
    await expect(as(service, tx => recordAttempt(
      tx,
      SUSPENDED_STUDENT,
      QUESTION_A1,
      '80000000-0000-4000-8000-000000000003',
    ))).rejects.toMatchObject({ code: '42501' })
  })

  it('freezes membership and prevents deleting a published library with progress', async () => {
    const deleted = await as(user(OWNER_A), tx => tx.query(
      `DELETE FROM public.practice_library_questions
       WHERE library_id = $1 AND question_id = $2`,
      [LIBRARY, QUESTION_A1],
    ))
    expect(deleted.rowCount).toBe(0)
    const updated = await as(user(OWNER_A), tx => tx.query(
      `UPDATE public.practice_library_questions SET position = 9
       WHERE library_id = $1 AND question_id = $2`,
      [LIBRARY, QUESTION_A1],
    ))
    expect(updated.rowCount).toBe(0)
    await expect(as(user(OWNER_A), tx => tx.query(
      'DELETE FROM public.practice_libraries WHERE id = $1',
      [LIBRARY],
    ))).rejects.toMatchObject({ code: '23514' })
  })

  it('does not let a teacher attach a guessed private question from another organization', async () => {
    await as(user(OWNER_A), async tx => {
      const draft = (await tx.query<{ id: string }>(`
        INSERT INTO public.practice_libraries
          (org_id, classroom_id, created_by, title)
        VALUES ('${ORG_A}', '${ROOM_A}', '${OWNER_A}', 'ร่าง')
        RETURNING id
      `)).rows[0].id
      await expect(tx.query(
        `INSERT INTO public.practice_library_questions
          (library_id, question_id, position) VALUES ($1, $2, 0)`,
        [draft, QUESTION_B],
      )).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('cascades an intentional permanent classroom delete through attempts', async () => {
    await as(service, async tx => {
      await tx.query(
        `INSERT INTO public.classrooms
          (id, org_id, teacher_id, status, classroom_type)
         VALUES ($1, $2, $3, 'active', 'subject')`,
        [ROOM_DELETE, ORG_A, OWNER_A],
      )
      await tx.query(
        'INSERT INTO public.classroom_students (classroom_id, student_id) VALUES ($1, $2)',
        [ROOM_DELETE, STUDENT_A],
      )
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [OWNER_A])
      await tx.exec('SET LOCAL ROLE authenticated')
      await tx.query(
        `INSERT INTO public.practice_libraries
          (id, org_id, classroom_id, created_by, title)
         VALUES ($1, $2, $3, $4, 'คลังที่จะลบถาวร')`,
        [LIBRARY_DELETE, ORG_A, ROOM_DELETE, OWNER_A],
      )
      await tx.query(
        `INSERT INTO public.practice_library_questions
          (library_id, question_id, position) VALUES ($1, $2, 0)`,
        [LIBRARY_DELETE, QUESTION_A1],
      )
      await tx.query(
        "UPDATE public.practice_libraries SET status = 'published' WHERE id = $1",
        [LIBRARY_DELETE],
      )
      await tx.exec('SET LOCAL ROLE service_role')
      await tx.query(
        `SELECT * FROM public.record_practice_answer_attempt($1, $2, $3, $4)`,
        [
          STUDENT_A,
          LIBRARY_DELETE,
          QUESTION_A1,
          '90000000-0000-4000-8000-000000000001',
        ],
      )
      await tx.query('DELETE FROM public.classrooms WHERE id = $1', [ROOM_DELETE])
      const remaining = (await tx.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM public.practice_answer_attempts WHERE library_id = $1`,
        [LIBRARY_DELETE],
      )).rows[0].count
      expect(remaining).toBe(0)
    })
  })
})
