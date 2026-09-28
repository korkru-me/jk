import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const PASSWORD_MIGRATION = new URL(
  '../supabase/migrations/20260923073215_persist_seb_quit_password_revisions.sql',
  import.meta.url,
)
const RELEASE_MIGRATION = new URL(
  '../supabase/migrations/20260923161000_bind_assignment_seb_config_releases.sql',
  import.meta.url,
)

const ORG_ID = '10000000-0000-4000-8000-000000000001'
const OWNER_ID = '20000000-0000-4000-8000-000000000001'
const STUDENT_ID = '20000000-0000-4000-8000-000000000002'
const ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000001'
const OTHER_ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000002'
const UNRELEASED_ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000003'
const ARTIFACT_HASH = 'a'.repeat(64)
const CONFIG_KEY = 'b'.repeat(64)
const QUIT_HASH = 'c'.repeat(64)
const BROWSER_KEYS = JSON.stringify([{
  platform: 'windows',
  versionString: '3.10.2',
  buildNumber: '920',
  key: 'd'.repeat(64),
}])

let db: PGlite

const MINIMAL_SCHEMA = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA storage;

  CREATE TABLE storage.buckets (
    id text PRIMARY KEY,
    name text NOT NULL,
    public boolean NOT NULL,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  CREATE TABLE public.organizations (id uuid PRIMARY KEY);
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
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    max_score numeric NOT NULL,
    status text NOT NULL,
    attempt_number integer NOT NULL,
    exam_access_mode text,
    secure_browser_verified_at timestamptz,
    secure_browser_platform text,
    secure_browser_version text,
    android_approved_at timestamptz,
    android_approved_by uuid
  );
  CREATE TABLE public.exam_proctor_sessions (
    submission_id uuid PRIMARY KEY REFERENCES public.submissions(id) ON DELETE CASCADE,
    secure_browser_verified_at timestamptz,
    secure_browser_platform text,
    secure_browser_version text,
    exam_access_mode text,
    android_approved_at timestamptz,
    android_approved_by uuid
  );
  CREATE TABLE public.exam_seb_checkins (
    assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    PRIMARY KEY (assignment_id, student_id)
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

async function expectSqlState(run: Promise<unknown>, code: string) {
  try {
    await run
    throw new Error(`Expected SQLSTATE ${code}`)
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code)
  }
}

async function createPasswordRevision(assignmentId: string, expectedRevision: number, hash = QUIT_HASH) {
  return db.query(
    'SELECT * FROM public.create_assignment_seb_quit_password_revision($1, $2, $3, $4)',
    [assignmentId, OWNER_ID, expectedRevision, hash],
  )
}

async function registerRelease(assignmentId: string, hash = ARTIFACT_HASH, browserKeys = BROWSER_KEYS) {
  return db.query<Record<string, unknown>>(
    `SELECT * FROM public.register_assignment_seb_config_release(
      $1, 1, $2, $3, 1024, $4, $5::jsonb, 'x509_encrypted'
    )`,
    [
      assignmentId,
      `assignments/${assignmentId}/r1/${hash}.seb`,
      hash,
      CONFIG_KEY,
      browserKeys,
    ],
  )
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(MINIMAL_SCHEMA)
  await db.exec(readFileSync(PASSWORD_MIGRATION, 'utf8'))
  await db.exec(readFileSync(RELEASE_MIGRATION, 'utf8'))

  await db.query('INSERT INTO public.organizations (id) VALUES ($1)', [ORG_ID])
  await db.query(
    `INSERT INTO public.users (id, role, status) VALUES
      ($1, 'teacher', 'active'), ($2, 'student', 'active')`,
    [OWNER_ID, STUDENT_ID],
  )
  await db.query(
    `INSERT INTO public.organization_members (org_id, user_id, org_role)
     VALUES ($1, $2, 'owner')`,
    [ORG_ID, OWNER_ID],
  )
  for (const assignmentId of [ASSIGNMENT_ID, OTHER_ASSIGNMENT_ID, UNRELEASED_ASSIGNMENT_ID]) {
    await db.query(
      `INSERT INTO public.assignments
        (id, org_id, created_by, mode, type, status, secure_browser_mode)
       VALUES ($1, $2, $3, 'online', 'exam', 'draft', 'seb_required')`,
      [assignmentId, ORG_ID, OWNER_ID],
    )
    await asRole('service_role', () => createPasswordRevision(assignmentId, 0))
  }
}, 60_000)

afterAll(async () => { await db?.close() })

describe('assignment-specific SEB release migration', () => {
  it('applies with a private bucket and no browser-readable release policy', async () => {
    const catalog = await db.query<{
      rls: boolean
      policy_count: number
      authenticated_select: boolean
      service_select: boolean
      authenticated_execute: boolean
      service_execute: boolean
      bucket_public: boolean
    }>(`
      SELECT
        class.relrowsecurity AS rls,
        (SELECT COUNT(*)::integer FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'assignment_seb_config_releases') AS policy_count,
        has_table_privilege('authenticated', class.oid, 'SELECT') AS authenticated_select,
        has_table_privilege('service_role', class.oid, 'SELECT') AS service_select,
        has_function_privilege('authenticated', function.oid, 'EXECUTE') AS authenticated_execute,
        has_function_privilege('service_role', function.oid, 'EXECUTE') AS service_execute,
        (SELECT NOT public FROM storage.buckets WHERE id = 'assignment-seb-configs') AS bucket_public
      FROM pg_class class
      JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
      CROSS JOIN pg_proc function
      JOIN pg_namespace function_namespace ON function_namespace.oid = function.pronamespace
      WHERE namespace.nspname = 'public'
        AND class.relname = 'assignment_seb_config_releases'
        AND function_namespace.nspname = 'public'
        AND function.proname = 'register_assignment_seb_config_release'
    `)

    expect(catalog.rows).toEqual([{
      rls: true,
      policy_count: 0,
      authenticated_select: false,
      service_select: true,
      authenticated_execute: false,
      service_execute: true,
      bucket_public: true,
    }])
    await expect(asRole('authenticated', () => db.query(
      'SELECT * FROM public.assignment_seb_config_releases',
    ))).rejects.toThrow()
  })

  it('registers only the current revision and returns metadata without CK or BEK', async () => {
    const registered = await asRole('service_role', () => registerRelease(ASSIGNMENT_ID))
    expect(registered.rows).toHaveLength(1)
    expect(registered.rows[0]).toMatchObject({
      assignment_id: ASSIGNMENT_ID,
      revision: 1,
      artifact_sha256: ARTIFACT_HASH,
      browser_exam_key_count: 1,
      security_mode: 'x509_encrypted',
    })
    expect(Object.keys(registered.rows[0])).not.toContain('config_key')
    expect(Object.keys(registered.rows[0])).not.toContain('browser_exam_keys')
    expect(JSON.stringify(registered.rows[0])).not.toContain(CONFIG_KEY)
    expect(JSON.stringify(registered.rows[0])).not.toContain('d'.repeat(64))

    await expectSqlState(
      asRole('service_role', () => registerRelease(
        OTHER_ASSIGNMENT_ID,
        ARTIFACT_HASH,
        JSON.stringify([
          JSON.parse(BROWSER_KEYS)[0],
          { ...JSON.parse(BROWSER_KEYS)[0], key: 'e'.repeat(64) },
        ]),
      )),
      '22023',
    )
  })

  it('enforces a current release at the database publication boundary', async () => {
    await expectSqlState(
      db.query(
        `UPDATE public.assignments SET status = 'published' WHERE id = $1`,
        [UNRELEASED_ASSIGNMENT_ID],
      ),
      '55000',
    )
    const assignment = await db.query<{ status: string }>(
      'SELECT status FROM public.assignments WHERE id = $1',
      [UNRELEASED_ASSIGNMENT_ID],
    )
    expect(assignment.rows[0].status).toBe('draft')
  })

  it('creates an attempt only for the exact current registered revision', async () => {
    await db.query(
      `UPDATE public.assignments SET status = 'published' WHERE id = $1`,
      [ASSIGNMENT_ID],
    )
    const created = await asRole('service_role', () => db.query<{
      submission_id: string
      seb_config_revision: number
    }>(
      `SELECT * FROM public.create_seb_submission_with_revision(
        $1, $2, $3, 10, 1, clock_timestamp(), 'windows',
        'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser', 1
      )`,
      [ORG_ID, ASSIGNMENT_ID, STUDENT_ID],
    ))
    expect(created.rows).toHaveLength(1)
    expect(created.rows[0].seb_config_revision).toBe(1)

    await expectSqlState(
      asRole('service_role', () => db.query(
        `SELECT * FROM public.create_seb_submission_with_revision(
          $1, $2, $3, 10, 2, clock_timestamp(), 'windows',
          'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser', 2
        )`,
        [ORG_ID, ASSIGNMENT_ID, STUDENT_ID],
      )),
      '40001',
    )
  })

  it('makes a published assignment draft atomically when the password rotates', async () => {
    await db.query(
      `UPDATE public.submissions SET status = 'submitted' WHERE assignment_id = $1`,
      [ASSIGNMENT_ID],
    )
    await db.query(
      `INSERT INTO public.exam_seb_checkins (assignment_id, student_id) VALUES ($1, $2)`,
      [ASSIGNMENT_ID, STUDENT_ID],
    )
    const rotated = await asRole(
      'service_role',
      () => createPasswordRevision(ASSIGNMENT_ID, 1, 'f'.repeat(64)),
    )
    expect(rotated.rows[0]).toMatchObject({ revision: 2 })
    const assignment = await db.query<{ status: string }>(
      'SELECT status FROM public.assignments WHERE id = $1',
      [ASSIGNMENT_ID],
    )
    expect(assignment.rows[0].status).toBe('draft')
    const checkins = await db.query(
      'SELECT student_id FROM public.exam_seb_checkins WHERE assignment_id = $1',
      [ASSIGNMENT_ID],
    )
    expect(checkins.rows).toHaveLength(0)
  })

  it('keeps release rows immutable while allowing parent assignment cascade deletion', async () => {
    await expectSqlState(
      db.query(
        `UPDATE public.assignment_seb_config_releases
         SET artifact_size_bytes = 2048 WHERE assignment_id = $1`,
        [ASSIGNMENT_ID],
      ),
      '55000',
    )
    await db.query('DELETE FROM public.assignments WHERE id = $1', [ASSIGNMENT_ID])
    const remaining = await db.query(
      'SELECT assignment_id FROM public.assignment_seb_config_releases WHERE assignment_id = $1',
      [ASSIGNMENT_ID],
    )
    expect(remaining.rows).toHaveLength(0)
  })
})
