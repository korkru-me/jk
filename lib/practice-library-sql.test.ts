import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite, type Transaction } from '@electric-sql/pglite'

const migration = readFileSync(
  new URL('../supabase/migrations/20261012155740_self_practice_library.sql', import.meta.url),
  'utf8',
)
const rpcMigration = readFileSync(
  new URL('../supabase/migrations/20261013045149_self_practice_atomic_rpcs.sql', import.meta.url),
  'utf8',
)
const multiClassroomMigration = readFileSync(
  new URL('../supabase/migrations/20261014040543_practice_multi_classroom_creation.sql', import.meta.url),
  'utf8',
)
const settingsMigration = readFileSync(
  new URL('../supabase/migrations/20261014042628_practice_library_settings.sql', import.meta.url),
  'utf8',
)
const compatibilityMigration = readFileSync(
  new URL('../supabase/migrations/20261014043342_practice_draft_backward_compatibility.sql', import.meta.url),
  'utf8',
)
const layoutMigration = readFileSync(
  new URL('../supabase/migrations/20261014125654_classroom_practice_work_layout.sql', import.meta.url), 'utf8',
)
const categoryMigration = readFileSync(
  new URL('../supabase/migrations/20260928234553_classroom_assignment_categories.sql', import.meta.url), 'utf8',
)
const categoryGuard = categoryMigration.slice(
  categoryMigration.indexOf('CREATE FUNCTION public.enforce_assignment_category_classroom()'),
  categoryMigration.indexOf('CREATE TRIGGER assignment_classrooms_category_same_classroom'),
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
const STUDENT_ZERO = '20000000-0000-4000-8000-000000000009'
const ROOM_A = '30000000-0000-4000-8000-000000000001'
const ROOM_B = '30000000-0000-4000-8000-000000000002'
const ROOM_DELETE = '30000000-0000-4000-8000-000000000003'
const ROOM_A_SECOND = '30000000-0000-4000-8000-000000000004'
const QUESTION_A1 = '40000000-0000-4000-8000-000000000001'
const QUESTION_A2 = '40000000-0000-4000-8000-000000000002'
const QUESTION_B = '40000000-0000-4000-8000-000000000003'
const QUESTION_A3 = '40000000-0000-4000-8000-000000000004'
const QUESTION_SNAPSHOT = '40000000-0000-4000-8000-000000000005'
const QUESTION_PUBLIC = '40000000-0000-4000-8000-000000000006'
const LIBRARY = '50000000-0000-4000-8000-000000000001'
const LIBRARY_DELETE = '50000000-0000-4000-8000-000000000002'
const PERFORMANCE_LIBRARY = '50000000-0000-4000-8000-000000000003'
const CATEGORY_A = '60000000-0000-4000-8000-000000000001'
const CATEGORY_B = '60000000-0000-4000-8000-000000000002'
const ASSIGNMENT_A = '70000000-0000-4000-8000-000000000001'

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
      status text NOT NULL,
      full_name text NOT NULL
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
      roster_order integer,
      PRIMARY KEY (classroom_id, student_id)
    );
    CREATE TABLE public.student_profiles (
      student_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
      class_number smallint
    );
    CREATE TABLE public.questions (
      id uuid PRIMARY KEY,
      created_by uuid NOT NULL REFERENCES public.users(id),
      org_id uuid REFERENCES public.organizations(id),
      visibility text NOT NULL DEFAULT 'private',
      title text NOT NULL,
      question_text text NOT NULL DEFAULT '',
      question_type text NOT NULL DEFAULT 'written',
      difficulty text NOT NULL DEFAULT 'medium',
      subject text,
      tags text[] NOT NULL DEFAULT '{}',
      search_text text NOT NULL,
      variables jsonb NOT NULL DEFAULT '[]',
      logic_rules jsonb NOT NULL DEFAULT '[]',
      answer_formula text NOT NULL DEFAULT 'x',
      answer_unit text,
      answer_tolerance numeric NOT NULL DEFAULT 0.01,
      answer_parts jsonb,
      mcq_options jsonb,
      image_urls text[] NOT NULL DEFAULT '{}',
      extra_data jsonb NOT NULL DEFAULT '{}',
      is_random boolean NOT NULL DEFAULT false,
      is_research_snapshot boolean NOT NULL DEFAULT false
    );
    ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY questions_owner_select ON public.questions
      FOR SELECT TO authenticated USING (created_by = auth.uid());
    CREATE POLICY questions_public_select ON public.questions
      FOR SELECT TO authenticated USING (visibility = 'public');
    GRANT SELECT ON public.questions TO authenticated;

    CREATE FUNCTION public.question_tag_key(p_tag text)
    RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
      SELECT lower(btrim(regexp_replace(p_tag, '[[:space:]]+', ' ', 'g')))
    $$;
    CREATE FUNCTION public.question_tag_display(p_tag text)
    RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
      SELECT btrim(regexp_replace(p_tag, '[[:space:]]+', ' ', 'g'))
    $$;
    CREATE FUNCTION public.get_user_org_ids()
    RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
      SELECT CASE
        WHEN (SELECT auth.uid()) IN (
          '${OWNER_A}'::uuid,
          '${CO_MANAGE}'::uuid,
          '${CO_VIEW}'::uuid,
          '${STUDENT_A}'::uuid,
          '${STUDENT_B}'::uuid,
          '${SUSPENDED_STUDENT}'::uuid,
          '${STUDENT_ZERO}'::uuid
        ) THEN ARRAY['${ORG_A}'::uuid]
        WHEN (SELECT auth.uid()) IN ('${OWNER_B}'::uuid, '${STUDENT_OTHER_ROOM}'::uuid)
          THEN ARRAY['${ORG_B}'::uuid]
        ELSE ARRAY[]::uuid[]
      END
    $$;
    CREATE FUNCTION public.question_shared_with_my_orgs(p_question_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
      SELECT false
    $$;

    INSERT INTO public.organizations VALUES ('${ORG_A}'), ('${ORG_B}');
    INSERT INTO public.users VALUES
      ('${OWNER_A}', 'teacher', 'active', 'ครูหนึ่ง'),
      ('${OWNER_B}', 'teacher', 'active', 'ครูสอง'),
      ('${CO_MANAGE}', 'teacher', 'active', 'ครูร่วมจัดการ'),
      ('${CO_VIEW}', 'teacher', 'active', 'ครูร่วมดู'),
      ('${STUDENT_A}', 'student', 'active', 'นักเรียนหนึ่ง'),
      ('${STUDENT_B}', 'student', 'active', 'นักเรียนสอง'),
      ('${STUDENT_OTHER_ROOM}', 'student', 'active', 'นักเรียนต่างห้อง'),
      ('${SUSPENDED_STUDENT}', 'student', 'suspended', 'นักเรียนระงับ'),
      ('${STUDENT_ZERO}', 'student', 'active', 'นักเรียนยังไม่ตอบ');
    INSERT INTO public.classrooms VALUES
      ('${ROOM_A}', '${ORG_A}', '${OWNER_A}', 'active', 'subject'),
      ('${ROOM_B}', '${ORG_B}', '${OWNER_B}', 'active', 'subject'),
      ('${ROOM_A_SECOND}', '${ORG_A}', '${OWNER_A}', 'active', 'subject');
    INSERT INTO public.classroom_co_teachers VALUES
      ('${ROOM_A}', '${CO_MANAGE}', 'manage'),
      ('${ROOM_A}', '${CO_VIEW}', 'view'),
      -- Deliberately malformed relation: role checks must stop a student from
      -- escalating through a guessed/legacy co-teacher row.
      ('${ROOM_A}', '${STUDENT_B}', 'manage');
    INSERT INTO public.classroom_students VALUES
      ('${ROOM_A}', '${STUDENT_A}', 2),
      ('${ROOM_A}', '${STUDENT_B}', 1),
      ('${ROOM_A}', '${SUSPENDED_STUDENT}', 3),
      ('${ROOM_B}', '${STUDENT_OTHER_ROOM}', 1),
      ('${ROOM_A}', '${STUDENT_ZERO}', 4);
    INSERT INTO public.student_profiles VALUES
      ('${STUDENT_A}', 8),
      ('${STUDENT_B}', 3),
      ('${STUDENT_OTHER_ROOM}', 1),
      ('${STUDENT_ZERO}', 12);
    INSERT INTO public.questions
      (id, created_by, org_id, visibility, title, question_text, question_type,
       tags, search_text, is_research_snapshot)
    VALUES
      ('${QUESTION_A1}', '${OWNER_A}', '${ORG_A}', 'private',
        'Newton Force', 'force body', 'written',
        ARRAY[' Physics ', 'physics', 'Core'], 'newton force motion', false),
      ('${QUESTION_A2}', '${OWNER_A}', '${ORG_A}', 'private',
        'Electric Field', 'field body', 'mcq',
        ARRAY[' Physics  ', 'ElecTRic'], 'electric field vector', false),
      ('${QUESTION_B}', '${OWNER_B}', '${ORG_B}', 'private',
        'Other Organization', 'private body', 'written',
        ARRAY['Private'], 'other organization private', false),
      ('${QUESTION_A3}', '${OWNER_A}', '${ORG_A}', 'private',
        'Literal 100%_Match', 'wildcards', 'written',
        ARRAY['Wave'], 'literal 100%_match wave', false),
      ('${QUESTION_SNAPSHOT}', '${OWNER_A}', '${ORG_A}', 'private',
        'Snapshot', 'snapshot', 'written', ARRAY['Archive'], 'snapshot archive', true),
      ('${QUESTION_PUBLIC}', '${OWNER_B}', '${ORG_B}', 'public',
        'Public Question', 'public body', 'written', ARRAY['Public'], 'public question', false);
  `)
  await db.exec(migration)
  await db.exec(rpcMigration)
  await db.exec(multiClassroomMigration)
  await db.exec(settingsMigration)
  await db.exec(compatibilityMigration)
  await db.exec(`
    CREATE TABLE public.classroom_assignment_categories (
      id uuid PRIMARY KEY, classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE
    );
    CREATE TABLE public.assignment_classrooms (
      assignment_id uuid NOT NULL, classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
      display_order integer, PRIMARY KEY (assignment_id, classroom_id)
    );
    INSERT INTO public.classroom_assignment_categories VALUES ('${CATEGORY_A}', '${ROOM_A}'), ('${CATEGORY_B}', '${ROOM_B}');
    INSERT INTO public.assignment_classrooms VALUES ('${ASSIGNMENT_A}', '${ROOM_A}', 1);
    GRANT SELECT ON public.classroom_assignment_categories TO authenticated, service_role;
    GRANT SELECT, UPDATE ON public.assignment_classrooms TO service_role;
    GRANT SELECT, UPDATE ON public.classrooms TO service_role;
    GRANT SELECT ON public.users, public.classroom_co_teachers TO service_role;
  `)
  await db.exec(categoryGuard)
  await db.exec(layoutMigration)
  // Supabase's service role already has broad table access; the fixture uses
  // explicit grants so this check exercises the trigger rather than ACLs.
  await db.exec('GRANT UPDATE (category_id) ON public.practice_libraries TO service_role')
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
       VALUES ($1, $2, 0), ($1, $3, 1), ($1, $4, 2)`,
      [LIBRARY, QUESTION_A1, QUESTION_A2, QUESTION_A3],
    )
    await tx.query(
      `UPDATE public.practice_libraries SET status = 'published' WHERE id = $1`,
      [LIBRARY],
    )
  }, true)
}, 60_000)

afterAll(async () => { await db?.close() })

describe('practice work grouping and mixed order', () => {
  it('groups published practice within its own classroom without changing activity or creation time', async () => {
    await as(user(OWNER_A), async tx => {
      const before = (await tx.query<{ created_at: Date }>('SELECT created_at FROM practice_libraries WHERE id=$1', [LIBRARY])).rows[0]
      await tx.query('UPDATE practice_libraries SET category_id=$1 WHERE id=$2', [CATEGORY_A, LIBRARY])
      const after = (await tx.query<{ category_id: string; created_at: Date; status: string }>('SELECT category_id, created_at, status FROM practice_libraries WHERE id=$1', [LIBRARY])).rows[0]
      expect(after.category_id).toBe(CATEGORY_A)
      expect(after.created_at).toEqual(before.created_at)
      expect(after.status).toBe('published')
    })
  })

  it('rejects a category from a different classroom even for service writes', async () => {
    await expect(as(service, tx => tx.query('UPDATE practice_libraries SET category_id=$1 WHERE id=$2', [CATEGORY_B, LIBRARY]))).rejects.toMatchObject({ code: '23514' })
  })

  it('returns practice to ungrouped when a category is deleted', async () => {
    await db.transaction(async tx => {
      await tx.query('UPDATE practice_libraries SET category_id=$1 WHERE id=$2', [CATEGORY_A, LIBRARY])
      await tx.query('DELETE FROM classroom_assignment_categories WHERE id=$1', [CATEGORY_A])
      expect((await tx.query<{ category_id: string | null }>('SELECT category_id FROM practice_libraries WHERE id=$1', [LIBRARY])).rows[0].category_id).toBeNull()
      await tx.rollback()
    })
  })

  it.each([OWNER_A, CO_MANAGE])('persists interleaved order atomically for an authorized actor %s', async actor => {
    await as(service, async tx => {
      await tx.query('SELECT reorder_classroom_work($1,$2,$3)', [actor, ROOM_A, [`practice:${LIBRARY}`, ASSIGNMENT_A]])
      expect((await tx.query<{ display_order: number }>('SELECT display_order FROM practice_libraries WHERE id=$1', [LIBRARY])).rows[0].display_order).toBe(1)
      expect((await tx.query<{ display_order: number }>('SELECT display_order FROM assignment_classrooms WHERE assignment_id=$1', [ASSIGNMENT_A])).rows[0].display_order).toBe(2)
    })
  })

  it.each([CO_VIEW, OWNER_B, STUDENT_A])('denies ordering for unauthorized actor %s', async actor => {
    await expect(as(service, tx => tx.query('SELECT reorder_classroom_work($1,$2,$3)', [actor, ROOM_A, [ASSIGNMENT_A, `practice:${LIBRARY}`]]))).rejects.toMatchObject({ code: '42501' })
  })

  it.each([{ role: 'anon' } as const, user(OWNER_A)])('does not expose the order RPC to browser roles %s', async actor => {
    await expect(as(actor, tx => tx.query('SELECT reorder_classroom_work($1,$2,$3)', [OWNER_A, ROOM_A, [ASSIGNMENT_A, `practice:${LIBRARY}`]]))).rejects.toMatchObject({ code: '42501' })
  })

  it.each([[ASSIGNMENT_A], [ASSIGNMENT_A, ASSIGNMENT_A], [ASSIGNMENT_A, `practice:${LIBRARY}`, QUESTION_B]].map(ids => ({ ids })))('rejects stale, duplicate or foreign work without a partial write $ids', async ({ ids }) => {
    await expect(as(service, tx => tx.query('SELECT reorder_classroom_work($1,$2,$3)', [OWNER_A, ROOM_A, ids]))).rejects.toMatchObject({ code: '22023' })
    expect((await db.query<{ display_order: number }>('SELECT display_order FROM assignment_classrooms WHERE assignment_id=$1', [ASSIGNMENT_A])).rows[0].display_order).toBe(1)
  })
})

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

describe('self-practice RPC privilege and execution contracts', () => {
  it('pins definer/invoker mode, volatility, empty paths, and exact role grants', async () => {
    const functions = (await db.query<{
      name: string
      prosecdef: boolean
      provolatile: string
      proconfig: string[]
      anon_can: boolean
      authenticated_can: boolean
      service_can: boolean
    }>(`
      SELECT
        expected.name,
        proc.prosecdef,
        proc.provolatile,
        proc.proconfig,
        has_function_privilege('anon', expected.signature, 'EXECUTE') AS anon_can,
        has_function_privilege('authenticated', expected.signature, 'EXECUTE') AS authenticated_can,
        has_function_privilege('service_role', expected.signature, 'EXECUTE') AS service_can
      FROM (VALUES
        ('bulk_update_practice_question_tags',
          'public.bulk_update_practice_question_tags(uuid,uuid[],text,text)'::regprocedure),
        ('create_practice_library',
          'public.create_practice_library(uuid,uuid,text,text,boolean,uuid[],boolean)'::regprocedure),
        ('create_practice_libraries_for_classrooms',
          'public.create_practice_libraries_for_classrooms(uuid,uuid[],text,text,boolean,text,boolean,boolean,boolean,boolean,uuid[],boolean)'::regprocedure),
        ('duplicate_practice_library',
          'public.duplicate_practice_library(uuid)'::regprocedure),
        ('get_practice_library_questions_for_manager',
          'public.get_practice_library_questions_for_manager(uuid,uuid)'::regprocedure),
        ('get_practice_library_student_progress',
          'public.get_practice_library_student_progress(uuid,uuid)'::regprocedure),
        ('get_practice_question_for_student',
          'public.get_practice_question_for_student(uuid,uuid,uuid)'::regprocedure),
        ('get_practice_student_question_progress',
          'public.get_practice_student_question_progress(uuid,uuid,uuid,text,integer,integer)'::regprocedure),
        ('replace_draft_practice_library_questions',
          'public.replace_draft_practice_library_questions(uuid,uuid[])'::regprocedure),
        ('search_practice_library_questions',
          'public.search_practice_library_questions(uuid,uuid,text[],text[],integer,integer)'::regprocedure),
        ('update_practice_library_draft',
          'public.update_practice_library_draft(uuid,text,text,boolean,text,boolean,boolean,boolean,boolean,uuid[])'::regprocedure)
      ) AS expected(name, signature)
      JOIN pg_proc proc ON proc.oid = expected.signature
      ORDER BY expected.name
    `)).rows

    expect(functions).toEqual([
      {
        name: 'bulk_update_practice_question_tags',
        prosecdef: true,
        provolatile: 'v',
        proconfig: ['search_path=""'],
        anon_can: false,
        authenticated_can: true,
        service_can: false,
      },
      {
        name: 'create_practice_libraries_for_classrooms',
        prosecdef: false,
        provolatile: 'v',
        proconfig: ['search_path=""'],
        anon_can: false,
        authenticated_can: true,
        service_can: false,
      },
      {
        name: 'create_practice_library',
        prosecdef: false,
        provolatile: 'v',
        proconfig: ['search_path=""'],
        anon_can: false,
        authenticated_can: true,
        service_can: false,
      },
      {
        name: 'duplicate_practice_library',
        prosecdef: true,
        provolatile: 'v',
        proconfig: ['search_path=""'],
        anon_can: false,
        authenticated_can: true,
        service_can: false,
      },
      {
        name: 'get_practice_library_questions_for_manager',
        prosecdef: true,
        provolatile: 's',
        proconfig: ['search_path=""'],
        anon_can: false,
        authenticated_can: false,
        service_can: true,
      },
      {
        name: 'get_practice_library_student_progress',
        prosecdef: true,
        provolatile: 'v',
        proconfig: ['search_path=""'],
        anon_can: false,
        authenticated_can: false,
        service_can: true,
      },
      {
        name: 'get_practice_question_for_student',
        prosecdef: true,
        provolatile: 's',
        proconfig: ['search_path=""'],
        anon_can: false,
        authenticated_can: false,
        service_can: true,
      },
      {
        name: 'get_practice_student_question_progress',
        prosecdef: true,
        provolatile: 'v',
        proconfig: ['search_path=""'],
        anon_can: false,
        authenticated_can: false,
        service_can: true,
      },
      {
        name: 'replace_draft_practice_library_questions',
        prosecdef: true,
        provolatile: 'v',
        proconfig: ['search_path=""'],
        anon_can: false,
        authenticated_can: true,
        service_can: false,
      },
      {
        name: 'search_practice_library_questions',
        prosecdef: true,
        provolatile: 'v',
        proconfig: ['search_path=""'],
        anon_can: false,
        authenticated_can: false,
        service_can: true,
      },
      {
        name: 'update_practice_library_draft',
        prosecdef: true,
        provolatile: 'v',
        proconfig: ['search_path=""'],
        anon_can: false,
        authenticated_can: true,
        service_can: false,
      },
    ])

    const supersededCountRpc = (await db.query<{ exists: boolean }>(`
      SELECT to_regprocedure(
        'public.get_practice_student_attempt_counts(uuid,uuid,uuid[])'
      ) IS NOT NULL AS exists
    `)).rows[0].exists
    expect(supersededCountRpc).toBe(false)
  })

  it('returns every active current roster member in roster order, including exact zero counts', async () => {
    const rows = await as(service, async tx => (
      await tx.query<{
        student_id: string
        display_name: string
        class_number: number | null
        roster_order: number | null
        attempted_question_count: bigint
        total_attempt_count: bigint
      }>(
        'SELECT * FROM public.get_practice_library_student_progress($1, $2)',
        [OWNER_A, LIBRARY],
      )
    ).rows)

    expect(rows.map(row => ({
      ...row,
      attempted_question_count: Number(row.attempted_question_count),
      total_attempt_count: Number(row.total_attempt_count),
    }))).toEqual([
      expect.objectContaining({
        student_id: STUDENT_B,
        display_name: 'นักเรียนสอง',
        class_number: 3,
        roster_order: 1,
        attempted_question_count: 1,
        total_attempt_count: 1,
      }),
      expect.objectContaining({
        student_id: STUDENT_A,
        display_name: 'นักเรียนหนึ่ง',
        class_number: 8,
        roster_order: 2,
      }),
      {
        student_id: STUDENT_ZERO,
        display_name: 'นักเรียนยังไม่ตอบ',
        class_number: 12,
        roster_order: 4,
        attempted_question_count: 0,
        total_attempt_count: 0,
      },
    ])
    expect(rows.some(row => row.student_id === SUSPENDED_STUDENT)).toBe(false)
  })

  it('counts more than 1,000 events exactly without returning raw attempts', async () => {
    await as(service, async tx => {
      const beforeDetail = (await tx.query<{ attempt_count: bigint }>(`
        SELECT attempt_count
        FROM public.get_practice_student_question_progress($1, $2, $3, '', 100, 0)
        WHERE question_id = $4
      `, [OWNER_A, LIBRARY, STUDENT_A, QUESTION_A1])).rows[0]
      const beforeOverview = (await tx.query<{ total_attempt_count: bigint }>(`
        SELECT total_attempt_count
        FROM public.get_practice_library_student_progress($1, $2)
        WHERE student_id = $3
      `, [OWNER_A, LIBRARY, STUDENT_A])).rows[0]
      const beforeSearch = (await tx.query<{ attempt_count: bigint }>(`
        SELECT attempt_count
        FROM public.search_practice_library_questions(
          $1, $2, ARRAY[]::text[], ARRAY[]::text[], 24, 0
        )
        WHERE question_id = $3
      `, [STUDENT_A, LIBRARY, QUESTION_A1])).rows[0]

      await tx.exec('RESET ROLE')
      await tx.query(`
        INSERT INTO public.practice_answer_attempts
          (library_id, student_id, question_id, idempotency_key)
        SELECT $1, $2, $3, gen_random_uuid()
        FROM generate_series(1, 1001)
      `, [LIBRARY, STUDENT_A, QUESTION_A1])
      await tx.exec('SET LOCAL ROLE service_role')

      const afterDetail = (await tx.query<{ attempt_count: bigint }>(`
        SELECT attempt_count
        FROM public.get_practice_student_question_progress($1, $2, $3, '', 100, 0)
        WHERE question_id = $4
      `, [OWNER_A, LIBRARY, STUDENT_A, QUESTION_A1])).rows[0]
      const afterOverview = (await tx.query<{ total_attempt_count: bigint }>(`
        SELECT total_attempt_count
        FROM public.get_practice_library_student_progress($1, $2)
        WHERE student_id = $3
      `, [OWNER_A, LIBRARY, STUDENT_A])).rows[0]
      const afterSearch = (await tx.query<{ attempt_count: bigint }>(`
        SELECT attempt_count
        FROM public.search_practice_library_questions(
          $1, $2, ARRAY[]::text[], ARRAY[]::text[], 24, 0
        )
        WHERE question_id = $3
      `, [STUDENT_A, LIBRARY, QUESTION_A1])).rows[0]

      expect(Number(afterDetail.attempt_count) - Number(beforeDetail.attempt_count)).toBe(1001)
      expect(Number(afterOverview.total_attempt_count) - Number(beforeOverview.total_attempt_count))
        .toBe(1001)
      expect(Number(afterSearch.attempt_count) - Number(beforeSearch.attempt_count)).toBe(1001)
    })
  })

  it('returns paged safe detail rows, searches tags, and includes zero-count questions', async () => {
    const all = await as(service, async tx => (
      await tx.query<{
        question_id: string
        title: string
        tags: string[]
        attempt_count: bigint
        total_count: bigint
      }>(
        `SELECT * FROM public.get_practice_student_question_progress(
          $1, $2, $3, '', 2, 0
        )`,
        [OWNER_A, LIBRARY, STUDENT_ZERO],
      )
    ).rows)
    expect(all.map(row => ({
      question_id: row.question_id,
      attempt_count: Number(row.attempt_count),
      total_count: Number(row.total_count),
    }))).toEqual([
      { question_id: QUESTION_A1, attempt_count: 0, total_count: 3 },
      { question_id: QUESTION_A2, attempt_count: 0, total_count: 3 },
    ])
    expect(Object.keys(all[0]).sort()).toEqual([
      'attempt_count', 'question_id', 'tags', 'title', 'total_count',
    ])

    const tagMatch = await as(service, async tx => (
      await tx.query<{ question_id: string }>(
        `SELECT question_id
         FROM public.get_practice_student_question_progress($1, $2, $3, 'core', 100, 0)`,
        [OWNER_A, LIBRARY, STUDENT_ZERO],
      )
    ).rows)
    expect(tagMatch).toEqual([{ question_id: QUESTION_A1 }])
  })

  it('reads one trusted question through one published-roster authorization statement', async () => {
    const row = await as(service, async tx => (
      await tx.query<Record<string, unknown>>(
        'SELECT * FROM public.get_practice_question_for_student($1, $2, $3)',
        [STUDENT_A, LIBRARY, QUESTION_A1],
      )
    ).rows[0])

    expect(row).toMatchObject({
      library_id: LIBRARY,
      classroom_id: ROOM_A,
      library_title: 'คลังทดสอบ',
      library_description: null,
      reveal_answer_key: false,
      requires_access_code: false,
      calculator_enabled: false,
      scratchpad_enabled: true,
      shuffle_options: true,
      question_id: QUESTION_A1,
      position: 0,
      title: 'Newton Force',
      question_text: 'force body',
      question_type: 'written',
      tags: [' Physics ', 'physics', 'Core'],
      is_random: false,
    })
    expect(Object.keys(row).sort()).toEqual([
      'answer_formula',
      'answer_parts',
      'answer_tolerance',
      'answer_unit',
      'calculator_enabled',
      'classroom_id',
      'extra_data',
      'image_urls',
      'is_random',
      'library_description',
      'library_id',
      'library_title',
      'logic_rules',
      'mcq_options',
      'position',
      'question_id',
      'question_text',
      'question_type',
      'requires_access_code',
      'reveal_answer_key',
      'scratchpad_enabled',
      'shuffle_options',
      'tags',
      'title',
      'variables',
    ])

    expect(await as(service, async tx => (
      await tx.query(
        'SELECT * FROM public.get_practice_question_for_student($1, $2, $3)',
        [STUDENT_OTHER_ROOM, LIBRARY, QUESTION_A1],
      )
    ).rows)).toEqual([])
    expect(await as(service, async tx => (
      await tx.query(
        'SELECT * FROM public.get_practice_question_for_student($1, $2, $3)',
        [STUDENT_A, LIBRARY, QUESTION_B],
      )
    ).rows)).toEqual([])
    await expect(as(user(STUDENT_A), tx => tx.query(
      'SELECT * FROM public.get_practice_question_for_student($1, $2, $3)',
      [STUDENT_A, LIBRARY, QUESTION_A1],
    ))).rejects.toMatchObject({ code: '42501' })

    await as(user(OWNER_A), async tx => {
      const draft = (await tx.query<{ id: string }>(`
        SELECT public.create_practice_library(
          $1, $2, 'ร่างอ่านไม่ได้', NULL, false, ARRAY[$3]::uuid[], false
        ) AS id
      `, [ORG_A, ROOM_A, QUESTION_A1])).rows[0].id
      await tx.exec('SET LOCAL ROLE service_role')
      expect((await tx.query(
        'SELECT * FROM public.get_practice_question_for_student($1, $2, $3)',
        [STUDENT_A, draft, QUESTION_A1],
      )).rows).toEqual([])
    })
  })

  it('returns ordered trusted membership shapes only for an exact library manager', async () => {
    const load = (actorId: string) => as(service, async tx => (
      await tx.query<Record<string, unknown>>(
        'SELECT * FROM public.get_practice_library_questions_for_manager($1, $2)',
        [actorId, LIBRARY],
      )
    ).rows)

    for (const actorId of [OWNER_A, CO_MANAGE]) {
      const rows = await load(actorId)
      expect(rows.map(row => ({
        question_id: row.question_id,
        position: row.position,
        title: row.title,
      }))).toEqual([
        { question_id: QUESTION_A1, position: 0, title: 'Newton Force' },
        { question_id: QUESTION_A2, position: 1, title: 'Electric Field' },
        { question_id: QUESTION_A3, position: 2, title: 'Literal 100%_Match' },
      ])
      expect(rows[0]).toMatchObject({
        created_by: OWNER_A,
        org_id: ORG_A,
        question_text: 'force body',
        question_type: 'written',
        difficulty: 'medium',
        subject: null,
        answer_formula: 'x',
        tags: [' Physics ', 'physics', 'Core'],
        is_random: false,
        is_research_snapshot: false,
      })
      expect(Object.keys(rows[0]).sort()).toEqual([
        'answer_formula',
        'answer_parts',
        'answer_tolerance',
        'answer_unit',
        'created_by',
        'difficulty',
        'extra_data',
        'image_urls',
        'is_random',
        'is_research_snapshot',
        'logic_rules',
        'mcq_options',
        'org_id',
        'position',
        'question_id',
        'question_text',
        'question_type',
        'subject',
        'tags',
        'title',
        'variables',
      ])
    }

    expect(await load(CO_VIEW)).toEqual([])
    expect(await load(OWNER_B)).toEqual([])
    await expect(as(user(OWNER_A), tx => tx.query(
      'SELECT * FROM public.get_practice_library_questions_for_manager($1, $2)',
      [OWNER_A, LIBRARY],
    ))).rejects.toMatchObject({ code: '42501' })

    await as(service, async tx => {
      await tx.exec('RESET ROLE')
      await tx.query("UPDATE public.users SET status = 'suspended' WHERE id = $1", [CO_MANAGE])
      await tx.exec('SET LOCAL ROLE service_role')
      expect((await tx.query(
        'SELECT * FROM public.get_practice_library_questions_for_manager($1, $2)',
        [CO_MANAGE, LIBRARY],
      )).rows).toEqual([])
    })
  })

  it('searches terms and normalized whole tags with AND semantics in one counted response', async () => {
    await as(service, async tx => {
      await recordAttempt(
        tx,
        STUDENT_ZERO,
        QUESTION_A2,
        '91000000-0000-4000-8000-000000000001',
      )
      const rows = (await tx.query<{
        question_id: string
        position: number
        title: string
        question_type: string
        tags: string[]
        attempt_count: bigint
        total_count: bigint
      }>(`
        SELECT *
        FROM public.search_practice_library_questions(
          $1, $2, ARRAY['  FIELD  ', 'eLeCtRiC'],
          ARRAY['  pHySiCs ', ' ELECTRIC  '], 24, 0
        )
      `, [STUDENT_ZERO, LIBRARY])).rows

      expect(rows.map(row => ({
        ...row,
        attempt_count: Number(row.attempt_count),
        total_count: Number(row.total_count),
      }))).toEqual([{
        question_id: QUESTION_A2,
        position: 1,
        title: 'Electric Field',
        question_type: 'mcq',
        tags: [' Physics  ', 'ElecTRic'],
        attempt_count: 1,
        total_count: 1,
      }])

      const allCounts = (await tx.query<{ question_id: string; attempt_count: bigint }>(`
        SELECT question_id, attempt_count
        FROM public.search_practice_library_questions(
          $1, $2, ARRAY[]::text[], ARRAY[]::text[], 24, 0
        )
        ORDER BY position
      `, [STUDENT_ZERO, LIBRARY])).rows
      expect(allCounts.map(row => ({
        question_id: row.question_id,
        attempt_count: Number(row.attempt_count),
      }))).toEqual([
        { question_id: QUESTION_A1, attempt_count: 0 },
        { question_id: QUESTION_A2, attempt_count: 1 },
        { question_id: QUESTION_A3, attempt_count: 0 },
      ])

      expect((await tx.query(`
        SELECT question_id
        FROM public.search_practice_library_questions(
          $1, $2, ARRAY[]::text[], ARRAY['electric field']::text[], 24, 0
        )
      `, [STUDENT_ZERO, LIBRARY])).rows).toEqual([])

      const literalWildcard = (await tx.query<{ question_id: string }>(`
        SELECT question_id
        FROM public.search_practice_library_questions(
          $1, $2, ARRAY['100%_match'], ARRAY[]::text[], 24, 0
        )
      `, [STUDENT_ZERO, LIBRARY])).rows
      expect(literalWildcard).toEqual([{ question_id: QUESTION_A3 }])

      await tx.exec('RESET ROLE')
      await tx.query('UPDATE public.questions SET question_type = $1 WHERE id = $2', [
        'essay', QUESTION_A3,
      ])
      await tx.exec('SET LOCAL ROLE service_role')
      const supportedOnly = (await tx.query<{ question_id: string }>(`
        SELECT question_id
        FROM public.search_practice_library_questions(
          $1, $2, ARRAY[]::text[], ARRAY[]::text[], 24, 0
        )
        ORDER BY position
      `, [STUDENT_ZERO, LIBRARY])).rows
      expect(supportedOnly).toEqual([
        { question_id: QUESTION_A1 },
        { question_id: QUESTION_A2 },
      ])
    })
  })

  it('keeps a 1,000-question library paged, bounded, and counted in one search RPC', async () => {
    await as(service, async tx => {
      await tx.exec('RESET ROLE')
      await tx.query(`
        INSERT INTO public.practice_libraries
          (id, org_id, classroom_id, created_by, title)
        VALUES ($1, $2, $3, $4, 'คลังทดสอบหนึ่งพันข้อ')
      `, [PERFORMANCE_LIBRARY, ORG_A, ROOM_A, OWNER_A])
      await tx.query(`
        INSERT INTO public.questions
          (id, created_by, org_id, visibility, title, question_text, question_type,
           tags, search_text, is_research_snapshot)
        SELECT
          ('41000000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
          $1,
          $2,
          'private',
          'โจทย์ฝึก ' || item,
          'โจทย์สำหรับทดสอบคลังขนาดใหญ่ ' || item,
          'written',
          CASE WHEN item % 2 = 0
            THEN ARRAY['สอวน. ค่าย 1', 'ไฟฟ้า']::text[]
            ELSE ARRAY['สอวน. ค่าย 1', 'นิวตัน']::text[]
          END,
          'โจทย์ สอวน. ค่าย 1 ' || CASE WHEN item % 2 = 0 THEN 'ไฟฟ้า' ELSE 'นิวตัน' END
            || ' ' || item,
          false
        FROM generate_series(1, 1000) item
      `, [OWNER_A, ORG_A])
      await tx.query(`
        INSERT INTO public.practice_library_questions
          (library_id, question_id, position)
        SELECT
          $1,
          ('41000000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
          item - 1
        FROM generate_series(1, 1000) item
      `, [PERFORMANCE_LIBRARY])
      await tx.query(`
        INSERT INTO public.practice_answer_attempts
          (library_id, student_id, question_id, idempotency_key)
        SELECT
          $1::uuid,
          $2::uuid,
          ('41000000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
          ('63000000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid
        FROM generate_series(10, 1000, 10) item
        UNION ALL
        SELECT
          $1::uuid,
          $3::uuid,
          ('41000000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
          ('64000000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid
        FROM generate_series(7, 1000, 7) item
      `, [PERFORMANCE_LIBRARY, STUDENT_A, STUDENT_B])
      await tx.query(
        "UPDATE public.practice_libraries SET status = 'published' WHERE id = $1",
        [PERFORMANCE_LIBRARY],
      )
      await tx.exec('SET LOCAL ROLE service_role')

      const startedAt = process.hrtime.bigint()
      const rows = (await tx.query<{
        question_id: string
        position: number
        title: string
        question_type: string
        tags: string[]
        attempt_count: bigint
        total_count: bigint
      }>(`
        SELECT *
        FROM public.search_practice_library_questions(
          $1, $2, ARRAY['โจทย์'], ARRAY['สอวน. ค่าย 1', 'ไฟฟ้า'], 24, 0
        )
      `, [STUDENT_A, PERFORMANCE_LIBRARY])).rows
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
      const normalizedRows = rows.map(row => ({
        ...row,
        attempt_count: Number(row.attempt_count),
        total_count: Number(row.total_count),
      }))
      const payloadBytes = Buffer.byteLength(JSON.stringify(normalizedRows), 'utf8')

      const explain = await tx.query<Record<string, unknown>>(`
        EXPLAIN (ANALYZE, FORMAT JSON)
        SELECT *
        FROM public.search_practice_library_questions(
          $1, $2, ARRAY['โจทย์'], ARRAY['สอวน. ค่าย 1', 'ไฟฟ้า'], 24, 0
        )
      `, [STUDENT_A, PERFORMANCE_LIBRARY])

      expect(normalizedRows).toHaveLength(24)
      expect(normalizedRows.every(row => row.total_count === 500)).toBe(true)
      expect(normalizedRows.map(row => row.position)).toEqual(
        Array.from({ length: 24 }, (_, index) => index * 2 + 1),
      )
      expect(normalizedRows.find(row => row.title === 'โจทย์ฝึก 10')?.attempt_count).toBe(1)
      expect(payloadBytes).toBeLessThan(64 * 1024)
      expect(elapsedMs).toBeLessThan(5_000)
      expect(explain.rows[0]?.['QUERY PLAN']).toBeDefined()

      if (process.env.PRACTICE_PERF_EVIDENCE === '1') {
        console.info('[practice-library-performance]', JSON.stringify({
          questions: 1000,
          matchingQuestions: 500,
          requestDatabaseCalls: 1,
          returnedRows: rows.length,
          payloadBytes,
          elapsedMs: Number(elapsedMs.toFixed(2)),
          queryPlan: explain.rows[0]?.['QUERY PLAN'],
        }))
      }
    })
  })

  it('denies service read RPCs across actor, roster, lifecycle, and caller-role boundaries', async () => {
    await expect(as(user(OWNER_A), tx => tx.query(
      'SELECT * FROM public.get_practice_library_student_progress($1, $2)',
      [OWNER_A, LIBRARY],
    ))).rejects.toMatchObject({ code: '42501' })
    await expect(as(service, tx => tx.query(
      'SELECT * FROM public.get_practice_library_student_progress($1, $2)',
      [CO_VIEW, LIBRARY],
    ))).rejects.toMatchObject({ code: '42501' })
    await expect(as(service, tx => tx.query(
      `SELECT * FROM public.get_practice_student_question_progress(
        $1, $2, $3, '', 50, 0
      )`,
      [OWNER_A, LIBRARY, STUDENT_OTHER_ROOM],
    ))).rejects.toMatchObject({ code: '42501' })
    await expect(as(service, tx => tx.query(
      `SELECT * FROM public.search_practice_library_questions(
        $1, $2, ARRAY[]::text[], ARRAY[]::text[], 24, 0
      )`,
      [STUDENT_OTHER_ROOM, LIBRARY],
    ))).rejects.toMatchObject({ code: '42501' })
    await expect(as(service, tx => tx.query(
      `SELECT * FROM public.search_practice_library_questions(
        $1, $2, ARRAY[]::text[], ARRAY[]::text[], 25, 0
      )`,
      [STUDENT_A, LIBRARY],
    ))).rejects.toMatchObject({ code: '22023' })

    await as(user(OWNER_A), async tx => {
      const draft = (await tx.query<{ id: string }>(`
        SELECT public.create_practice_library(
          $1, $2, 'ค้นร่าง', NULL, false, ARRAY[$3]::uuid[], false
        ) AS id
      `, [ORG_A, ROOM_A, QUESTION_A1])).rows[0].id
      await tx.exec('SET LOCAL ROLE service_role')
      await expect(tx.query(`
        SELECT * FROM public.search_practice_library_questions(
          $1, $2, ARRAY[]::text[], ARRAY[]::text[], 24, 0
        )
      `, [STUDENT_A, draft])).rejects.toMatchObject({ code: '42501' })
    })
  })
})

describe('self-practice atomic authenticated mutations', () => {
  it('creates equivalent classroom-scoped libraries for every selected room atomically', async () => {
    await as(user(OWNER_A), async tx => {
      const primaryId = (await tx.query<{ id: string }>(`
        SELECT public.create_practice_libraries_for_classrooms(
          $1, ARRAY[$2, $3]::uuid[], '  คลังหลายห้อง  ', '  ฝึกชุดเดียวกัน  ', true,
          'ห้องลับ', true, false, true, false,
          ARRAY[$4, $5]::uuid[], true
        ) AS id
      `, [ORG_A, ROOM_A, ROOM_A_SECOND, QUESTION_A2, QUESTION_A1])).rows[0].id
      const libraries = (await tx.query<{
        id: string
        classroom_id: string
        description: string
        status: string
        reveal_answer_key: boolean
        access_code: string
        calculator_enabled: boolean
        scratchpad_enabled: boolean
        shuffle_questions: boolean
        shuffle_options: boolean
      }>(`
        SELECT id, classroom_id, description, status, reveal_answer_key,
          access_code, calculator_enabled, scratchpad_enabled, shuffle_questions, shuffle_options
        FROM public.practice_libraries
        WHERE title = 'คลังหลายห้อง'
        ORDER BY CASE classroom_id WHEN $1 THEN 0 ELSE 1 END
      `, [ROOM_A])).rows

      expect(libraries).toHaveLength(2)
      expect(libraries[0]).toMatchObject({
        id: primaryId,
        classroom_id: ROOM_A,
        description: 'ฝึกชุดเดียวกัน',
        status: 'published',
        reveal_answer_key: true,
        access_code: 'ห้องลับ',
        calculator_enabled: true,
        scratchpad_enabled: false,
        shuffle_questions: true,
        shuffle_options: false,
      })
      expect(libraries[1]).toMatchObject({
        classroom_id: ROOM_A_SECOND,
        description: 'ฝึกชุดเดียวกัน',
        status: 'published',
        reveal_answer_key: true,
        access_code: 'ห้องลับ',
        calculator_enabled: true,
        scratchpad_enabled: false,
        shuffle_questions: true,
        shuffle_options: false,
      })

      const memberships = (await tx.query<{
        classroom_id: string
        question_id: string
        position: number
      }>(`
        SELECT library.classroom_id, membership.question_id, membership.position
        FROM public.practice_libraries library
        JOIN public.practice_library_questions membership ON membership.library_id = library.id
        WHERE library.title = 'คลังหลายห้อง'
        ORDER BY library.classroom_id, membership.position
      `)).rows
      expect(memberships).toEqual([
        { classroom_id: ROOM_A, question_id: QUESTION_A2, position: 0 },
        { classroom_id: ROOM_A, question_id: QUESTION_A1, position: 1 },
        { classroom_id: ROOM_A_SECOND, question_id: QUESTION_A2, position: 0 },
        { classroom_id: ROOM_A_SECOND, question_id: QUESTION_A1, position: 1 },
      ])
    })
  })

  it('rejects duplicate or unauthorized room targets without leaving partial libraries', async () => {
    await as(user(OWNER_A), async tx => {
      const attempts = [
        { rooms: [ROOM_A, ROOM_A], code: '22023' },
        { rooms: [ROOM_A, ROOM_B], code: '42501' },
      ]

      for (const [index, attempt] of attempts.entries()) {
        await tx.exec(`SAVEPOINT invalid_rooms_${index}`)
        await expect(tx.query(`
          SELECT public.create_practice_libraries_for_classrooms(
            $1, $2::uuid[], 'ต้องไม่เหลือหลายห้อง', NULL, false,
            NULL, false, true, false, true,
            ARRAY[$3]::uuid[], false
          )
        `, [ORG_A, attempt.rooms, QUESTION_A1])).rejects.toMatchObject({ code: attempt.code })
        await tx.exec(`ROLLBACK TO SAVEPOINT invalid_rooms_${index}`)
      }

      expect((await tx.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM public.practice_libraries WHERE title = 'ต้องไม่เหลือหลายห้อง'
      `)).rows[0].count).toBe(0)
    })
  })

  it('creates and publishes a library with ordered memberships in one RPC', async () => {
    await as(user(OWNER_A), async tx => {
      const id = (await tx.query<{ id: string }>(`
        SELECT public.create_practice_library(
          $1, $2, '  คลัง atomic  ', '  รายละเอียด  ', true,
          ARRAY[$3, $4]::uuid[], true
        ) AS id
      `, [ORG_A, ROOM_A, QUESTION_A2, QUESTION_A1])).rows[0].id
      const library = (await tx.query<{
        title: string
        description: string
        reveal_answer_key: boolean
        status: string
      }>(`
        SELECT title, description, reveal_answer_key, status
        FROM public.practice_libraries WHERE id = $1
      `, [id])).rows[0]
      const membership = (await tx.query<{ question_id: string; position: number }>(`
        SELECT question_id, position
        FROM public.practice_library_questions
        WHERE library_id = $1 ORDER BY position
      `, [id])).rows

      expect(library).toEqual({
        title: 'คลัง atomic',
        description: 'รายละเอียด',
        reveal_answer_key: true,
        status: 'published',
      })
      expect(membership).toEqual([
        { question_id: QUESTION_A2, position: 0 },
        { question_id: QUESTION_A1, position: 1 },
      ])
    })
  })

  it('rolls failed creation back without an orphan parent', async () => {
    await as(user(OWNER_A), async tx => {
      await tx.exec('SAVEPOINT invalid_create')
      await expect(tx.query(`
        SELECT public.create_practice_library(
          $1, $2, 'ต้องไม่เหลือ', NULL, false, ARRAY[$3]::uuid[], false
        )
      `, [ORG_A, ROOM_A, QUESTION_B])).rejects.toMatchObject({ code: '42501' })
      await tx.exec('ROLLBACK TO SAVEPOINT invalid_create')
      const orphanCount = (await tx.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM public.practice_libraries WHERE title = 'ต้องไม่เหลือ'
      `)).rows[0].count
      expect(orphanCount).toBe(0)

      await tx.exec('SAVEPOINT empty_publish')
      await expect(tx.query(`
        SELECT public.create_practice_library(
          $1, $2, 'ห้ามเผยแพร่ว่าง', NULL, false, ARRAY[]::uuid[], true
        )
      `, [ORG_A, ROOM_A])).rejects.toMatchObject({ code: '22023' })
      await tx.exec('ROLLBACK TO SAVEPOINT empty_publish')
      expect((await tx.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM public.practice_libraries WHERE title = 'ห้ามเผยแพร่ว่าง'
      `)).rows[0].count).toBe(0)
    })
  })

  it('rejects oversized mutation selections before touching library state', async () => {
    await as(user(OWNER_A), async tx => {
      const calls: Array<{ sql: string; params: string[] }> = [
        { sql: `SELECT public.create_practice_library(
          $1, $2, 'ใหญ่เกิน', NULL, false,
          ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 1001)), false
        )`, params: [ORG_A, ROOM_A] },
        { sql: `SELECT public.replace_draft_practice_library_questions(
          $1, ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 1001))
        )`, params: [LIBRARY] },
        { sql: `SELECT public.update_practice_library_draft(
          $1, 'ใหญ่เกิน', NULL, false,
          NULL, false, true, false, true,
          ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 1001))
        )`, params: [LIBRARY] },
        { sql: `SELECT public.bulk_update_practice_question_tags(
          $1, ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 1001)),
          'add', 'ใหญ่เกิน'
        )`, params: [LIBRARY] },
      ]

      for (const [index, call] of calls.entries()) {
        await tx.exec(`SAVEPOINT oversized_${index}`)
        await expect(tx.query(call.sql, call.params))
          .rejects.toMatchObject({ code: '22023' })
        await tx.exec(`ROLLBACK TO SAVEPOINT oversized_${index}`)
      }

      expect((await tx.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM public.practice_libraries WHERE title = 'ใหญ่เกิน'
      `)).rows[0].count).toBe(0)
    })
  })

  it('duplicates an exact source atomically for a co-manager without exposing private questions', async () => {
    await as(user(CO_MANAGE), async tx => {
      await tx.query(`
        UPDATE public.practice_libraries
        SET access_code = 'COPY', calculator_enabled = true, scratchpad_enabled = false,
          shuffle_questions = true, shuffle_options = false
        WHERE id = $1
      `, [LIBRARY])
      const id = (await tx.query<{ id: string }>(`
        SELECT public.duplicate_practice_library($1) AS id
      `, [LIBRARY])).rows[0].id
      expect((await tx.query<{
        created_by: string
        title: string
        status: string
        reveal_answer_key: boolean
        access_code: string
        calculator_enabled: boolean
        scratchpad_enabled: boolean
        shuffle_questions: boolean
        shuffle_options: boolean
      }>(`
        SELECT created_by, title, status, reveal_answer_key, access_code,
          calculator_enabled, scratchpad_enabled, shuffle_questions, shuffle_options
        FROM public.practice_libraries WHERE id = $1
      `, [id])).rows[0]).toEqual({
        created_by: CO_MANAGE,
        title: 'คลังทดสอบ (สำเนา)',
        status: 'draft',
        reveal_answer_key: false,
        access_code: 'COPY',
        calculator_enabled: true,
        scratchpad_enabled: false,
        shuffle_questions: true,
        shuffle_options: false,
      })
      expect((await tx.query<{ question_id: string; position: number }>(`
        SELECT question_id, position
        FROM public.practice_library_questions
        WHERE library_id = $1 ORDER BY position
      `, [id])).rows).toEqual([
        { question_id: QUESTION_A1, position: 0 },
        { question_id: QUESTION_A2, position: 1 },
        { question_id: QUESTION_A3, position: 2 },
      ])
    })

    await expect(as(user(CO_VIEW), tx => tx.query(
      'SELECT public.duplicate_practice_library($1)',
      [LIBRARY],
    ))).rejects.toMatchObject({ code: '42501' })
    await expect(as(user(OWNER_B), tx => tx.query(
      'SELECT public.duplicate_practice_library($1)',
      [LIBRARY],
    ))).rejects.toMatchObject({ code: '42501' })
    await expect(as(service, tx => tx.query(
      'SELECT public.duplicate_practice_library($1)',
      [LIBRARY],
    ))).rejects.toMatchObject({ code: '42501' })

    await as(user(CO_MANAGE), async tx => {
      await tx.exec('RESET ROLE')
      await tx.query("UPDATE public.users SET status = 'suspended' WHERE id = $1", [CO_MANAGE])
      await tx.exec('SET LOCAL ROLE authenticated')
      await expect(tx.query(
        'SELECT public.duplicate_practice_library($1)',
        [LIBRARY],
      )).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('lets a co-manager preserve private members, add visible rows, and publish atomically', async () => {
    await as(user(OWNER_A), async tx => {
      const draft = (await tx.query<{ id: string }>(`
        SELECT public.create_practice_library(
          $1, $2, 'ร่างครูร่วม', NULL, false, ARRAY[$3, $4]::uuid[], false
        ) AS id
      `, [ORG_A, ROOM_A, QUESTION_A1, QUESTION_A2])).rows[0].id

      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [CO_MANAGE])
      expect((await tx.query<{ count: number }>(`
        SELECT public.replace_draft_practice_library_questions(
          $1, ARRAY[$2, $3]::uuid[]
        ) AS count
      `, [draft, QUESTION_A2, QUESTION_A1])).rows[0].count).toBe(2)

      expect((await tx.query<{ count: number }>(`
        SELECT public.update_practice_library_draft(
          $1, 'แก้โดยครูร่วม', NULL, true, NULL, false, true, false, true,
          ARRAY[$2, $3, $4]::uuid[]
        ) AS count
      `, [draft, QUESTION_A2, QUESTION_A1, QUESTION_PUBLIC])).rows[0].count).toBe(3)

      await tx.exec('SAVEPOINT guessed_private')
      await expect(tx.query(`
        SELECT public.update_practice_library_draft(
          $1, 'ต้องไม่ค้าง', NULL, false, NULL, false, true, false, true,
          ARRAY[$2, $3]::uuid[]
        )
      `, [draft, QUESTION_A1, QUESTION_B])).rejects.toMatchObject({ code: '42501' })
      await tx.exec('ROLLBACK TO SAVEPOINT guessed_private')

      expect((await tx.query<{ title: string; reveal_answer_key: boolean }>(`
        SELECT title, reveal_answer_key FROM public.practice_libraries WHERE id = $1
      `, [draft])).rows[0]).toEqual({
        title: 'แก้โดยครูร่วม',
        reveal_answer_key: true,
      })
      expect((await tx.query<{ question_id: string; position: number }>(`
        SELECT question_id, position FROM public.practice_library_questions
        WHERE library_id = $1 ORDER BY position
      `, [draft])).rows).toEqual([
        { question_id: QUESTION_A2, position: 0 },
        { question_id: QUESTION_A1, position: 1 },
        { question_id: QUESTION_PUBLIC, position: 2 },
      ])

      await tx.query(
        "UPDATE public.practice_libraries SET status = 'published' WHERE id = $1",
        [draft],
      )
      expect((await tx.query<{ status: string }>(
        'SELECT status FROM public.practice_libraries WHERE id = $1',
        [draft],
      )).rows[0].status).toBe('published')
    })
  })

  it('replaces a draft atomically and preserves the old order on validation failure', async () => {
    await as(user(OWNER_A), async tx => {
      const draft = (await tx.query<{ id: string }>(`
        SELECT public.create_practice_library(
          $1, $2, 'ร่างแทนที่', NULL, false, ARRAY[$3, $4]::uuid[], false
        ) AS id
      `, [ORG_A, ROOM_A, QUESTION_A1, QUESTION_A2])).rows[0].id

      await tx.exec('SAVEPOINT bad_replace')
      await expect(tx.query(`
        SELECT public.replace_draft_practice_library_questions(
          $1, ARRAY[$2, $2]::uuid[]
        )
      `, [draft, QUESTION_A2])).rejects.toMatchObject({ code: '22023' })
      await tx.exec('ROLLBACK TO SAVEPOINT bad_replace')
      expect((await tx.query<{ question_id: string }>(`
        SELECT question_id FROM public.practice_library_questions
        WHERE library_id = $1 ORDER BY position
      `, [draft])).rows).toEqual([
        { question_id: QUESTION_A1 },
        { question_id: QUESTION_A2 },
      ])

      const replaced = (await tx.query<{ count: number }>(`
        SELECT public.replace_draft_practice_library_questions(
          $1, ARRAY[$2, $3]::uuid[]
        ) AS count
      `, [draft, QUESTION_A2, QUESTION_A3])).rows[0].count
      expect(replaced).toBe(2)
      expect((await tx.query<{ question_id: string; position: number }>(`
        SELECT question_id, position FROM public.practice_library_questions
        WHERE library_id = $1 ORDER BY position
      `, [draft])).rows).toEqual([
        { question_id: QUESTION_A2, position: 0 },
        { question_id: QUESTION_A3, position: 1 },
      ])

      await tx.query(
        "UPDATE public.practice_libraries SET status = 'published' WHERE id = $1",
        [draft],
      )
      await expect(tx.query(`
        SELECT public.replace_draft_practice_library_questions($1, ARRAY[$2]::uuid[])
      `, [draft, QUESTION_A1])).rejects.toMatchObject({ code: '23514' })
    })
  })

  it('updates draft metadata and membership together, rolling both back on invalid access', async () => {
    await as(user(OWNER_A), async tx => {
      const draft = (await tx.query<{ id: string }>(`
        SELECT public.create_practice_library(
          $1, $2, 'ก่อนแก้', 'เดิม', false, ARRAY[$3]::uuid[], false
        ) AS id
      `, [ORG_A, ROOM_A, QUESTION_A1])).rows[0].id
      const count = (await tx.query<{ count: number }>(`
        SELECT public.update_practice_library_draft(
          $1, '  หลังแก้  ', '  ใหม่  ', true, '  OPEN  ', true, false, true, false,
          ARRAY[$2, $3]::uuid[]
        ) AS count
      `, [draft, QUESTION_A2, QUESTION_A3])).rows[0].count
      expect(count).toBe(2)
      expect((await tx.query<{
        title: string
        description: string
        reveal_answer_key: boolean
        access_code: string
        calculator_enabled: boolean
        scratchpad_enabled: boolean
        shuffle_questions: boolean
        shuffle_options: boolean
      }>(`
        SELECT title, description, reveal_answer_key, access_code,
          calculator_enabled, scratchpad_enabled, shuffle_questions, shuffle_options
        FROM public.practice_libraries WHERE id = $1
      `, [draft])).rows[0]).toEqual({
        title: 'หลังแก้',
        description: 'ใหม่',
        reveal_answer_key: true,
        access_code: 'OPEN',
        calculator_enabled: true,
        scratchpad_enabled: false,
        shuffle_questions: true,
        shuffle_options: false,
      })

      await tx.exec('SAVEPOINT bad_atomic_update')
      await expect(tx.query(`
        SELECT public.update_practice_library_draft(
          $1, 'ห้ามค้าง', NULL, false, NULL, false, true, false, true,
          ARRAY[$2]::uuid[]
        )
      `, [draft, QUESTION_B])).rejects.toMatchObject({ code: '42501' })
      await tx.exec('ROLLBACK TO SAVEPOINT bad_atomic_update')
      expect((await tx.query<{ title: string }>(`
        SELECT title FROM public.practice_libraries WHERE id = $1
      `, [draft])).rows[0].title).toBe('หลังแก้')
      expect((await tx.query<{ question_id: string }>(`
        SELECT question_id FROM public.practice_library_questions
        WHERE library_id = $1 ORDER BY position
      `, [draft])).rows).toEqual([
        { question_id: QUESTION_A2 },
        { question_id: QUESTION_A3 },
      ])
    })
  })

  it('keeps the previous draft editor compatible without overwriting new settings', async () => {
    const draft = await as(user(OWNER_A), async tx => (
      (await tx.query<{ id: string }>(`
        SELECT public.create_practice_libraries_for_classrooms(
          $1, ARRAY[$2]::uuid[], 'compatibility draft', NULL, false,
          'KEEP', true, false, true, false, ARRAY[$3]::uuid[], false
        ) AS id
      `, [ORG_A, ROOM_A, QUESTION_A1])).rows[0].id
    ), true)
    await as(user(CO_MANAGE), async tx => {
      const result = await tx.query<{ count: number }>(`
        SELECT public.update_practice_library_draft(
          $1, 'previous editor saved', NULL, true, ARRAY[$2]::uuid[]
        ) AS count
      `, [draft, QUESTION_A1])
      expect(result.rows[0].count).toBe(1)
    }, true)
    await as(user(OWNER_A), async tx => {
      expect((await tx.query(`
        SELECT title, access_code, calculator_enabled, scratchpad_enabled,
          shuffle_questions, shuffle_options FROM public.practice_libraries WHERE id=$1
      `, [draft])).rows[0]).toEqual({
        title: 'previous editor saved', access_code: 'KEEP',
        calculator_enabled: true, scratchpad_enabled: false,
        shuffle_questions: true, shuffle_options: false,
      })
      await tx.query('DELETE FROM public.practice_libraries WHERE id=$1', [draft])
    }, true)
  })

  it('denies the previous draft editor to view-only and foreign teachers', async () => {
    const draft = await as(user(OWNER_A), async tx => (
      (await tx.query<{ id: string }>(`
        SELECT public.create_practice_library(
          $1, $2, 'compatibility denied', NULL, false, ARRAY[$3]::uuid[], false
        ) AS id
      `, [ORG_A, ROOM_A, QUESTION_A1])).rows[0].id
    ), true)
    for (const actor of [CO_VIEW, OWNER_B]) {
      await expect(as(user(actor), tx => tx.query(`
        SELECT public.update_practice_library_draft(
          $1, 'forbidden', NULL, false, ARRAY[$2]::uuid[]
        )
      `, [draft, QUESTION_A1]))).rejects.toMatchObject({ code: '42501' })
    }
    await as(user(OWNER_A), tx => tx.query('DELETE FROM public.practice_libraries WHERE id=$1', [draft]), true)
  })

  it('normalizes and de-duplicates bulk tags, and rejects a mixed invalid set atomically', async () => {
    await as(user(OWNER_A), async tx => {
      const deduped = (await tx.query<{ count: number }>(`
        SELECT public.bulk_update_practice_question_tags(
          $1, ARRAY[$2]::uuid[], 'add', '  pHySiCs  '
        ) AS count
      `, [LIBRARY, QUESTION_A1])).rows[0].count
      expect(deduped).toBe(1)
      expect((await tx.query<{ tags: string[] }>(
        'SELECT tags FROM public.questions WHERE id = $1',
        [QUESTION_A1],
      )).rows[0].tags).toEqual(['Physics', 'Core'])

      await tx.query(`
        SELECT public.bulk_update_practice_question_tags(
          $1, ARRAY[$2]::uuid[], 'add', '  New   Tag  '
        )
      `, [LIBRARY, QUESTION_A1])
      expect((await tx.query<{ tags: string[] }>(
        'SELECT tags FROM public.questions WHERE id = $1',
        [QUESTION_A1],
      )).rows[0].tags).toEqual(['Physics', 'Core', 'New Tag'])

      await tx.query(`
        SELECT public.bulk_update_practice_question_tags(
          $1, ARRAY[$2]::uuid[], 'remove', ' PHYSICS '
        )
      `, [LIBRARY, QUESTION_A1])
      expect((await tx.query<{ tags: string[] }>(
        'SELECT tags FROM public.questions WHERE id = $1',
        [QUESTION_A1],
      )).rows[0].tags).toEqual(['Core', 'New Tag'])

      const before = (await tx.query<{ tags: string[] }>(
        'SELECT tags FROM public.questions WHERE id = $1',
        [QUESTION_A2],
      )).rows[0].tags
      await tx.exec('SAVEPOINT bad_bulk')
      await expect(tx.query(`
        SELECT public.bulk_update_practice_question_tags(
          $1, ARRAY[$2, $3]::uuid[], 'add', 'should-not-stick'
        )
      `, [LIBRARY, QUESTION_A2, QUESTION_B])).rejects.toMatchObject({ code: '42501' })
      await tx.exec('ROLLBACK TO SAVEPOINT bad_bulk')
      expect((await tx.query<{ tags: string[] }>(
        'SELECT tags FROM public.questions WHERE id = $1',
        [QUESTION_A2],
      )).rows[0].tags).toEqual(before)
    })
  })

  it('enforces question ownership, manage scope, lifecycle, and authenticated-only mutation grants', async () => {
    await expect(as(user(CO_MANAGE), tx => tx.query(`
      SELECT public.bulk_update_practice_question_tags(
        $1, ARRAY[$2]::uuid[], 'add', 'co-teacher'
      )
    `, [LIBRARY, QUESTION_A1]))).rejects.toMatchObject({ code: '42501' })
    await expect(as(user(CO_VIEW), tx => tx.query(`
      SELECT public.bulk_update_practice_question_tags(
        $1, ARRAY[$2]::uuid[], 'add', 'viewer'
      )
    `, [LIBRARY, QUESTION_A1]))).rejects.toMatchObject({ code: '42501' })
    await expect(as(service, tx => tx.query(`
      SELECT public.create_practice_library(
        $1, $2, 'service', NULL, false, ARRAY[]::uuid[], false
      )
    `, [ORG_A, ROOM_A]))).rejects.toMatchObject({ code: '42501' })

    await as(user(OWNER_A), async tx => {
      await expect(tx.query(`
        SELECT public.update_practice_library_draft(
          $1, 'published', NULL, false, NULL, false, true, false, true,
          ARRAY[$2, $3, $4]::uuid[]
        )
      `, [LIBRARY, QUESTION_A1, QUESTION_A2, QUESTION_A3]))
        .rejects.toMatchObject({ code: '23514' })
    })
  })
})
