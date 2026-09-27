import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const MIGRATION = new URL(
  '../supabase/migrations/20260923073215_persist_seb_quit_password_revisions.sql',
  import.meta.url,
)

const ORG_ID = '10000000-0000-4000-8000-000000000001'
const OWNER_ID = '20000000-0000-4000-8000-000000000002'
const OTHER_TEACHER_ID = '20000000-0000-4000-8000-000000000003'
const STUDENT_ID = '20000000-0000-4000-8000-000000000004'
const HASH_ONE = '1'.repeat(64)
const HASH_TWO = '2'.repeat(64)

const ASSIGNMENTS = {
  acl: '30000000-0000-4000-8000-000000000001',
  happy: '30000000-0000-4000-8000-000000000002',
  cas: '30000000-0000-4000-8000-000000000003',
  active: '30000000-0000-4000-8000-000000000004',
  otherActive: '30000000-0000-4000-8000-000000000005',
  authorization: '30000000-0000-4000-8000-000000000006',
  eligibility: '30000000-0000-4000-8000-000000000007',
  immutable: '30000000-0000-4000-8000-000000000008',
} as const

let db: PGlite

const MINIMAL_SCHEMA = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;

  CREATE TABLE public.organizations (
    id uuid PRIMARY KEY
  );

  CREATE TABLE public.users (
    id uuid PRIMARY KEY,
    role text NOT NULL,
    status text NOT NULL
  );

  CREATE TABLE public.organization_members (
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    org_role text NOT NULL,
    PRIMARY KEY (org_id, user_id)
  );

  CREATE TABLE public.assignments (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    mode text NOT NULL,
    type text NOT NULL,
    status text NOT NULL,
    secure_browser_mode text NOT NULL
  );

  CREATE TABLE public.submissions (
    id uuid PRIMARY KEY,
    assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    status text NOT NULL
  );
`

async function asRole<T>(role: 'anon' | 'authenticated' | 'service_role', run: () => Promise<T>) {
  await db.exec(`SET ROLE ${role}`)
  try {
    return await run()
  } finally {
    await db.exec('RESET ROLE')
  }
}

async function createRevision(
  assignmentId: string,
  actorId: string,
  expectedRevision: number,
  hash = HASH_ONE,
) {
  return db.query<{
    assignment_id: string
    org_id: string
    owner_id: string
    revision: number
    created_at: string
  }>(
    `SELECT * FROM public.create_assignment_seb_quit_password_revision($1, $2, $3, $4)`,
    [assignmentId, actorId, expectedRevision, hash],
  )
}

async function expectSqlState(run: Promise<unknown>, code: string) {
  try {
    await run
    throw new Error(`Expected SQLSTATE ${code}`)
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code)
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(MINIMAL_SCHEMA)
  await db.exec(readFileSync(MIGRATION, 'utf8'))

  await db.query('INSERT INTO public.organizations (id) VALUES ($1)', [ORG_ID])
  await db.query(
    `INSERT INTO public.users (id, role, status) VALUES
      ($1, 'teacher', 'active'),
      ($2, 'teacher', 'active'),
      ($3, 'student', 'active')`,
    [OWNER_ID, OTHER_TEACHER_ID, STUDENT_ID],
  )
  await db.query(
    `INSERT INTO public.organization_members (org_id, user_id, org_role) VALUES
      ($1, $2, 'owner'),
      ($1, $3, 'teacher')`,
    [ORG_ID, OWNER_ID, OTHER_TEACHER_ID],
  )

  for (const assignmentId of Object.values(ASSIGNMENTS)) {
    await db.query(
      `INSERT INTO public.assignments
        (id, org_id, created_by, mode, type, status, secure_browser_mode)
       VALUES ($1, $2, $3, 'online', 'exam', 'draft', 'seb_required')`,
      [assignmentId, ORG_ID, OWNER_ID],
    )
  }
}, 60_000)

afterAll(async () => { await db?.close() })

describe('SEB quit-password revision migration security boundary', () => {
  it('exposes no browser table policy or privilege and grants only the service RPC', async () => {
    const catalog = await db.query<{
      rls: boolean
      policy_count: number
      anon_select: boolean
      authenticated_select: boolean
      authenticated_insert: boolean
      service_select: boolean
      service_insert: boolean
      service_update: boolean
      service_delete: boolean
      service_truncate: boolean
      anon_execute: boolean
      authenticated_execute: boolean
      service_execute: boolean
      security_definer: boolean
      config: string[] | null
      definition: string
    }>(`
      SELECT
        class.relrowsecurity AS rls,
        (SELECT COUNT(*)::integer FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'assignment_seb_config_revisions') AS policy_count,
        has_table_privilege('anon', class.oid, 'SELECT') AS anon_select,
        has_table_privilege('authenticated', class.oid, 'SELECT') AS authenticated_select,
        has_table_privilege('authenticated', class.oid, 'INSERT') AS authenticated_insert,
        has_table_privilege('service_role', class.oid, 'SELECT') AS service_select,
        has_table_privilege('service_role', class.oid, 'INSERT') AS service_insert,
        has_table_privilege('service_role', class.oid, 'UPDATE') AS service_update,
        has_table_privilege('service_role', class.oid, 'DELETE') AS service_delete,
        has_table_privilege('service_role', class.oid, 'TRUNCATE') AS service_truncate,
        has_function_privilege('anon', function.oid, 'EXECUTE') AS anon_execute,
        has_function_privilege('authenticated', function.oid, 'EXECUTE') AS authenticated_execute,
        has_function_privilege('service_role', function.oid, 'EXECUTE') AS service_execute,
        function.prosecdef AS security_definer,
        function.proconfig AS config,
        pg_get_functiondef(function.oid) AS definition
      FROM pg_class class
      JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
      CROSS JOIN pg_proc function
      JOIN pg_namespace function_namespace ON function_namespace.oid = function.pronamespace
      WHERE namespace.nspname = 'public'
        AND class.relname = 'assignment_seb_config_revisions'
        AND function_namespace.nspname = 'public'
        AND function.proname = 'create_assignment_seb_quit_password_revision'
    `)

    expect(catalog.rows).toHaveLength(1)
    expect(catalog.rows[0]).toMatchObject({
      rls: true,
      policy_count: 0,
      anon_select: false,
      authenticated_select: false,
      authenticated_insert: false,
      service_select: true,
      service_insert: false,
      service_update: false,
      service_delete: false,
      service_truncate: false,
      anon_execute: false,
      authenticated_execute: false,
      service_execute: true,
      security_definer: true,
    })
    expect(catalog.rows[0].config).toContain('search_path=\"\"')
    expect(catalog.rows[0].definition).toContain('FOR UPDATE')

    await expect(asRole('authenticated', () => db.query(
      'SELECT * FROM public.assignment_seb_config_revisions',
    ))).rejects.toThrow()
    await expectSqlState(
      asRole('authenticated', () => createRevision(ASSIGNMENTS.acl, OWNER_ID, 0)),
      '42501',
    )

    const created = await asRole(
      'service_role',
      () => createRevision(ASSIGNMENTS.acl, OWNER_ID, 0),
    )
    expect(created.rows[0].revision).toBe(1)
  })

  it('persists only a canonical hash and returns non-secret revision metadata', async () => {
    const created = await asRole(
      'service_role',
      () => createRevision(ASSIGNMENTS.happy, OWNER_ID, 0),
    )

    expect(created.rows).toHaveLength(1)
    expect(created.rows[0]).toMatchObject({
      assignment_id: ASSIGNMENTS.happy,
      org_id: ORG_ID,
      owner_id: OWNER_ID,
      revision: 1,
    })
    expect(Object.keys(created.rows[0]).sort()).toEqual([
      'assignment_id',
      'created_at',
      'org_id',
      'owner_id',
      'revision',
    ])
    expect(JSON.stringify(created.rows[0])).not.toContain(HASH_ONE)

    const stored = await db.query<{ hashed_quit_password: string }>(
      `SELECT hashed_quit_password
       FROM public.assignment_seb_config_revisions
       WHERE assignment_id = $1 AND revision = 1`,
      [ASSIGNMENTS.happy],
    )
    expect(stored.rows).toEqual([{ hashed_quit_password: HASH_ONE }])

    await expectSqlState(
      createRevision(ASSIGNMENTS.eligibility, OWNER_ID, 0, 'A'.repeat(64)),
      '22023',
    )
  })

  it('uses exact compare-and-swap revisions and leaves earlier rows unchanged', async () => {
    await asRole('service_role', () => createRevision(ASSIGNMENTS.cas, OWNER_ID, 0, HASH_ONE))

    await expectSqlState(
      asRole('service_role', () => createRevision(ASSIGNMENTS.cas, OWNER_ID, 0, HASH_TWO)),
      '40001',
    )

    const second = await asRole(
      'service_role',
      () => createRevision(ASSIGNMENTS.cas, OWNER_ID, 1, HASH_TWO),
    )
    expect(second.rows[0].revision).toBe(2)

    const revisions = await db.query<{ revision: number; hashed_quit_password: string }>(
      `SELECT revision, hashed_quit_password
       FROM public.assignment_seb_config_revisions
       WHERE assignment_id = $1
       ORDER BY revision`,
      [ASSIGNMENTS.cas],
    )
    expect(revisions.rows).toEqual([
      { revision: 1, hashed_quit_password: HASH_ONE },
      { revision: 2, hashed_quit_password: HASH_TWO },
    ])
  })

  it('blocks the exact assignment while an attempt is active', async () => {
    await db.query(
      `INSERT INTO public.submissions (id, assignment_id, status) VALUES
        ('40000000-0000-4000-8000-000000000001', $1, 'in_progress'),
        ('40000000-0000-4000-8000-000000000002', $2, 'in_progress')`,
      [ASSIGNMENTS.active, ASSIGNMENTS.otherActive],
    )

    await expectSqlState(
      asRole('service_role', () => createRevision(ASSIGNMENTS.active, OWNER_ID, 0)),
      '55006',
    )
    await db.query(
      `UPDATE public.submissions SET status = 'submitted' WHERE assignment_id = $1`,
      [ASSIGNMENTS.active],
    )

    const created = await asRole(
      'service_role',
      () => createRevision(ASSIGNMENTS.active, OWNER_ID, 0),
    )
    expect(created.rows[0].revision).toBe(1)
  })

  it('rechecks exact owner, active teacher, organization membership and assignment eligibility', async () => {
    await expectSqlState(
      asRole('service_role', () => createRevision(ASSIGNMENTS.authorization, OTHER_TEACHER_ID, 0)),
      '42501',
    )

    await db.query(`UPDATE public.users SET status = 'suspended' WHERE id = $1`, [OWNER_ID])
    await expectSqlState(
      asRole('service_role', () => createRevision(ASSIGNMENTS.authorization, OWNER_ID, 0)),
      '42501',
    )
    await db.query(`UPDATE public.users SET status = 'active' WHERE id = $1`, [OWNER_ID])

    await db.query(
      `DELETE FROM public.organization_members WHERE org_id = $1 AND user_id = $2`,
      [ORG_ID, OWNER_ID],
    )
    await expectSqlState(
      asRole('service_role', () => createRevision(ASSIGNMENTS.authorization, OWNER_ID, 0)),
      '42501',
    )
    await db.query(
      `INSERT INTO public.organization_members (org_id, user_id, org_role)
       VALUES ($1, $2, 'owner')`,
      [ORG_ID, OWNER_ID],
    )

    await db.query(
      `UPDATE public.assignments SET secure_browser_mode = 'browser' WHERE id = $1`,
      [ASSIGNMENTS.eligibility],
    )
    await expectSqlState(
      asRole('service_role', () => createRevision(ASSIGNMENTS.eligibility, OWNER_ID, 0)),
      '55000',
    )
    await db.query(
      `UPDATE public.assignments SET secure_browser_mode = 'seb_required', status = 'closed' WHERE id = $1`,
      [ASSIGNMENTS.eligibility],
    )
    await expectSqlState(
      asRole('service_role', () => createRevision(ASSIGNMENTS.eligibility, OWNER_ID, 0)),
      '55000',
    )
  })

  it('rejects direct revision mutation but preserves parent-assignment cascade deletion', async () => {
    await asRole('service_role', () => createRevision(ASSIGNMENTS.immutable, OWNER_ID, 0))

    await expectSqlState(
      db.query(
        `UPDATE public.assignment_seb_config_revisions
         SET hashed_quit_password = $1
         WHERE assignment_id = $2 AND revision = 1`,
        [HASH_TWO, ASSIGNMENTS.immutable],
      ),
      '55000',
    )
    await expectSqlState(
      db.query(
        `DELETE FROM public.assignment_seb_config_revisions
         WHERE assignment_id = $1 AND revision = 1`,
        [ASSIGNMENTS.immutable],
      ),
      '55000',
    )

    await expect(db.query(
      `DELETE FROM public.assignments WHERE id = $1`,
      [ASSIGNMENTS.immutable],
    )).resolves.toBeDefined()
    const remaining = await db.query<{ count: number }>(
      `SELECT COUNT(*)::integer AS count
       FROM public.assignment_seb_config_revisions
       WHERE assignment_id = $1`,
      [ASSIGNMENTS.immutable],
    )
    expect(remaining.rows[0].count).toBe(0)
  })
})
