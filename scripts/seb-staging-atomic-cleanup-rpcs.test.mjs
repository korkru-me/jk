import { readFileSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import { pageinspect } from '@electric-sql/pglite/contrib/pageinspect'
import { describe, expect, it } from 'vitest'

const MIGRATION_URL = new URL(
  '../supabase/migrations/20260923201848_seb_s5_atomic_cleanup_rpcs.sql',
  import.meta.url,
)

const FUNCTION_NAMES = Object.freeze([
  'seb_s5_delete_exact_cleanup_target',
  'seb_s5_attest_storage_object',
  'seb_s5_find_exact_run_targets',
])

function migrationSql() {
  return readFileSync(MIGRATION_URL, 'utf8')
}

function functionBody(sql, name) {
  const start = sql.indexOf(`create function public.${name}`)
  const next = sql.indexOf('\ncreate function public.', start + 1)
  if (start < 0) throw new Error(`missing ${name}`)
  return sql.slice(start, next < 0 ? sql.length : next)
}

function occurrences(value, pattern) {
  return [...value.matchAll(pattern)].length
}

describe('SEB S5 atomic cleanup RPC migration contract', () => {
  it('defines only the three fixed service-role boundaries with internal role gates', () => {
    const sql = migrationSql()

    expect(occurrences(sql, /create function public\.seb_s5_/g)).toBe(3)
    expect(occurrences(sql, /security definer/gi)).toBe(3)
    expect(occurrences(sql, /set search_path = ''/gi)).toBe(3)
    expect(occurrences(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/g)).toBe(3)
    expect(occurrences(sql, /grant execute on function public\.seb_s5_/gi)).toBe(3)
    expect(occurrences(sql, /from public, anon, authenticated/gi)).toBe(3)
    expect(sql).not.toMatch(/grant\s+all/i)
    expect(sql).not.toMatch(/grant\s+execute[\s\S]*?\bto\s+(?:public|anon|authenticated)\b/i)

    for (const name of FUNCTION_NAMES) {
      const body = functionBody(sql, name)
      expect(body).toContain("coalesce(auth.role(), '') <> 'service_role'")
      expect(body).toContain('security definer')
      expect(body).toContain("set search_path = ''")
    }
  })

  it('keeps deletion atomic, run-bound, exact-cardinality, and fail-closed', () => {
    const body = functionBody(migrationSql(), 'seb_s5_delete_exact_cleanup_target')

    expect(body).toContain("'serializable-parent-lock'")
    expect(body).toContain('for update')
    expect(body).toContain('pg_advisory_xact_lock')
    expect(body).toContain('in share row exclusive mode')
    expect(body).toContain("'education_research_measurements:snapshot_question_ids.contains'")
    expect(body).toContain("('education_research_measurements','snapshot_question_ids')")
    expect(body).toContain('SEB S5 closure cardinality changed')
    expect(body).toContain('SEB S5 closure graph mismatch')
    expect(body).toContain('SEB S5 cascade declaration mismatch')
    expect(body).toContain('SEB S5 foreign-key graph drifted')
    expect(body).toContain('constraint_row.conkey')
    expect(body).toContain('constraint_row.confkey')
    expect(body).toContain('constraint_row.confdeltype::text')
    expect(body).toContain('with ordinality')
    expect(body).toContain('with recursive protected_parent(relid)')
    expect(body).toContain('child.relname = any(v_expected_cascades)')
    expect(body).toContain(
      "'assignment_seb_config_releases(assignment_id,revision)->assignment_seb_config_revisions(assignment_id,revision):c'",
    )
    expect(body).toContain('cardinality(v_fk_signatures)')
    expect(body).not.toContain('array_agg(distinct child.relname')
    expect(body).toContain('SEB S5 exact parent is missing')
    expect(body).toContain('if v_deleted <> 1 then')
    expect(body).toContain("'deletedCount', v_deleted")
    expect(body).toContain("'atomicClosureVerified', true")
    expect(body).not.toContain("'deletedCount', 0")
  })

  it('returns only the narrow storage and reconciliation response schemas', () => {
    const sql = migrationSql()
    const storage = functionBody(sql, 'seb_s5_attest_storage_object')
    const reconciliation = functionBody(sql, 'seb_s5_find_exact_run_targets')

    for (const field of [
      'bucketName', 'path', 'ownerId', 'createdAt', 'sizeBytes', 'mimeType',
    ]) expect(storage).toContain(`'${field}'`)
    expect(storage).toContain("'objects', json_build_array()")
    expect(storage).toContain("p_path ~ '[[:cntrl:]]'")
    expect(storage).toContain("account.raw_user_meta_data ->> 'qa_namespace' = p_qa_namespace")
    expect(storage).toContain("question.question_type::text = 'file_upload'")
    expect(storage).toContain("answer.student_answer::jsonb #>> '{0,url}'")
    expect(storage).toMatch(
      /from public\.seb_staging_qa_run_reservations[\s\S]*?reservation\.state = 'reserved'[\s\S]*?for share;/,
    )
    expect(storage).toContain('for key share;')

    for (const field of [
      'targetKey', 'kind', 'identity', 'targetId', 'namespace', 'ownerId',
      'organizationId', 'resourceType', 'createdAt',
    ]) expect(reconciliation).toContain(`'${field}'`)
    expect(reconciliation).toContain('limit 9')
    expect(reconciliation).toContain('if v_match_count > 8 then')
    expect(reconciliation).toContain('SEB S5 reconciliation owner is not run-bound')
    expect(reconciliation).toContain('SEB S5 reconciliation organization is not run-bound')
    expect(reconciliation).toContain('for share;')
    expect(reconciliation).not.toContain('for key share;')
    expect(reconciliation).toContain(
      "('check-in-primary','checkIn','windows','student-primary')",
    )
    expect(reconciliation).not.toMatch(/['"](?:config_key|browser_exam_keys|hashed_quit_password)['"]/)

    // This assertion is intentionally structural: a duplicated trailing IF or
    // exception fragment in the identity guard must fail independently of the
    // PostgreSQL parse check below.
    expect(occurrences(
      reconciliation,
      /raise exception 'invalid SEB S5 reconciliation identity'/g,
    )).toBe(1)
  })

  it('applies in Postgres and exposes execute only to service_role', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.role()
        RETURNS text
        LANGUAGE sql
        STABLE
        AS $$
          SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
        $$;
      `)
      await db.exec(migrationSql())

      const catalog = await db.query(`
        SELECT
          proc.proname,
          proc.prosecdef AS security_definer,
          proc.proconfig AS function_config,
          has_function_privilege('anon', proc.oid, 'EXECUTE') AS anon_execute,
          has_function_privilege('authenticated', proc.oid, 'EXECUTE') AS authenticated_execute,
          has_function_privilege('service_role', proc.oid, 'EXECUTE') AS service_execute
        FROM pg_proc proc
        JOIN pg_namespace namespace ON namespace.oid = proc.pronamespace
        WHERE namespace.nspname = 'public'
          AND proc.proname = ANY($1::text[])
        ORDER BY proc.proname
      `, [FUNCTION_NAMES])

      expect(catalog.rows).toHaveLength(3)
      for (const row of catalog.rows) {
        expect(row).toMatchObject({
          security_definer: true,
          function_config: ['search_path=""'],
          anon_execute: false,
          authenticated_execute: false,
          service_execute: true,
        })
      }

      await db.query("SELECT set_config('request.jwt.claim.role', 'authenticated', false)")
      await expect(db.query(
        "SELECT public.seb_s5_delete_exact_cleanup_target('qa:seb-s5-contract', '{}'::jsonb)",
      )).rejects.toThrow(/requires service_role/)
      await expect(db.query(
        "SELECT public.seb_s5_attest_storage_object(1, 'qa:seb-s5-contract', 'submission-files', 'x')",
      )).rejects.toThrow(/requires service_role/)
      await expect(db.query(
        "SELECT public.seb_s5_find_exact_run_targets('{}'::jsonb)",
      )).rejects.toThrow(/requires service_role/)

      await db.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)")
      await expect(db.query(
        "SELECT public.seb_s5_delete_exact_cleanup_target('qa:seb-s5-contract', '{}'::jsonb)",
      )).rejects.toThrow(/invalid SEB S5 cleanup request/)
      await expect(db.query(
        "SELECT public.seb_s5_attest_storage_object(0, 'qa:seb-s5-contract', 'submission-files', 'x')",
      )).rejects.toThrow(/invalid SEB S5 storage attestation request/)
      await expect(db.query(
        "SELECT public.seb_s5_find_exact_run_targets('{}'::jsonb)",
      )).rejects.toThrow(/invalid SEB S5 reconciliation criteria/)
    } finally {
      await db.close()
    }
  })

  it('fails closed when an already-known child table gains another parent FK', async () => {
    const db = new PGlite()
    const answerId = '11111111-1111-4111-8111-111111111111'
    const submissionId = '22222222-2222-4222-8222-222222222222'
    const questionId = '33333333-3333-4333-8333-333333333333'
    const organizationId = '44444444-4444-4444-8444-444444444444'
    const namespace = 'qa:seb-s5-fk-drift'
    const notBefore = '2026-09-23T00:00:00.000Z'
    const notAfter = '2026-09-23T01:00:00.000Z'
    try {
      await db.exec(`
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.role()
        RETURNS text
        LANGUAGE sql
        STABLE
        AS $$
          SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
        $$;

        CREATE TABLE auth.users (
          id uuid PRIMARY KEY,
          raw_user_meta_data jsonb,
          raw_app_meta_data jsonb,
          created_at timestamptz
        );
        CREATE TABLE public.users (
          id uuid PRIMARY KEY,
          created_at timestamptz
        );
        CREATE TABLE public.seb_staging_qa_run_reservations (
          run_id text PRIMARY KEY,
          qa_namespace text NOT NULL,
          source_sha text NOT NULL,
          deployment_id text NOT NULL,
          state text NOT NULL,
          reserved_at timestamptz NOT NULL
        );
        CREATE TABLE public.submission_answers (
          id uuid PRIMARY KEY,
          submission_id uuid NOT NULL,
          question_id uuid NOT NULL,
          org_id uuid NOT NULL,
          created_at timestamptz NOT NULL
        );
        CREATE TABLE public.submissions (
          id uuid PRIMARY KEY,
          student_id uuid NOT NULL
        );
        CREATE TABLE public.student_work_artifacts (
          id uuid PRIMARY KEY,
          submission_answer_id uuid
            REFERENCES public.submission_answers(id) ON DELETE CASCADE,
          shadow_submission_answer_id uuid
        );
      `)
      await db.exec(migrationSql())
      await db.query(`
        INSERT INTO public.seb_staging_qa_run_reservations VALUES
          ('seb-s5-fk-drift', $1, $2, $3, 'reserved', '2026-09-23T00:01:00.000Z')
      `, [namespace, 'a'.repeat(40), 'dpl_1234567890abcdef'])
      await db.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)")

      const request = {
        schemaVersion: 1,
        operationId: 'delete:answer-written',
        table: 'submission_answers',
        predicates: [
          { column: 'id', operator: 'eq', value: answerId },
          { column: 'submission_id', operator: 'eq', value: submissionId },
          { column: 'question_id', operator: 'eq', value: questionId },
          { column: 'org_id', operator: 'eq', value: organizationId },
          { column: 'created_at', operator: 'gte', value: notBefore },
          { column: 'created_at', operator: 'lte', value: notAfter },
        ],
        maxRows: 1,
        atomicClosure: {
          schemaVersion: 1,
          isolation: 'serializable-parent-lock',
          requireAbsent: [{
            table: 'student_work_artifacts',
            predicates: [{ column: 'submission_answer_id', operator: 'eq', value: answerId }],
            expectedCount: 0,
          }],
          requireExact: [],
          allowedCascadeTables: [],
        },
      }
      await expect(db.query(
        'SELECT public.seb_s5_delete_exact_cleanup_target($1, $2::jsonb)',
        [namespace, JSON.stringify(request)],
      )).rejects.toThrow(/SEB S5 exact parent is missing/)

      await db.exec(`
        ALTER TABLE public.student_work_artifacts
          ADD CONSTRAINT student_work_artifacts_shadow_answer_fk
          FOREIGN KEY (shadow_submission_answer_id)
          REFERENCES public.submission_answers(id) ON DELETE CASCADE;
      `)
      await expect(db.query(
        'SELECT public.seb_s5_delete_exact_cleanup_target($1, $2::jsonb)',
        [namespace, JSON.stringify(request)],
      )).rejects.toThrow(/SEB S5 foreign-key graph drifted/)
    } finally {
      await db.close()
    }
  })

  it('fails closed when a declared cascade child gains an unknown cascading grandchild', async () => {
    const db = new PGlite()
    const submissionId = '11111111-1111-4111-8111-111111111111'
    const assignmentId = '22222222-2222-4222-8222-222222222222'
    const studentId = '33333333-3333-4333-8333-333333333333'
    const organizationId = '44444444-4444-4444-8444-444444444444'
    const namespace = 'qa:seb-s5-transitive-fk-drift'
    const notBefore = '2026-09-23T00:00:00.000Z'
    const notAfter = '2026-09-23T01:00:00.000Z'
    try {
      await db.exec(`
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.role()
        RETURNS text
        LANGUAGE sql
        STABLE
        AS $$
          SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
        $$;

        CREATE TABLE auth.users (
          id uuid PRIMARY KEY,
          raw_user_meta_data jsonb,
          raw_app_meta_data jsonb,
          created_at timestamptz
        );
        CREATE TABLE public.users (
          id uuid PRIMARY KEY,
          created_at timestamptz
        );
        CREATE TABLE public.seb_staging_qa_run_reservations (
          run_id text PRIMARY KEY,
          qa_namespace text NOT NULL,
          source_sha text NOT NULL,
          deployment_id text NOT NULL,
          state text NOT NULL,
          reserved_at timestamptz NOT NULL
        );
        CREATE TABLE public.submissions (
          id uuid PRIMARY KEY,
          assignment_id uuid NOT NULL,
          student_id uuid NOT NULL,
          org_id uuid NOT NULL,
          created_at timestamptz NOT NULL
        );
        CREATE TABLE public.education_research_scores (
          id uuid PRIMARY KEY,
          submission_id uuid REFERENCES public.submissions(id) ON DELETE RESTRICT
        );
        CREATE TABLE public.exam_proctor_connections (
          id uuid PRIMARY KEY,
          submission_id uuid REFERENCES public.submissions(id) ON DELETE CASCADE
        );
        CREATE TABLE public.exam_proctor_events (
          id uuid PRIMARY KEY,
          submission_id uuid REFERENCES public.submissions(id) ON DELETE CASCADE
        );
        CREATE TABLE public.exam_proctor_sessions (
          id uuid PRIMARY KEY,
          submission_id uuid REFERENCES public.submissions(id) ON DELETE CASCADE,
          assignment_id uuid NOT NULL,
          student_id uuid NOT NULL,
          org_id uuid NOT NULL,
          created_at timestamptz NOT NULL
        );
        CREATE TABLE public.submission_answers (
          id uuid PRIMARY KEY,
          submission_id uuid REFERENCES public.submissions(id) ON DELETE CASCADE
        );
      `)
      await db.exec(migrationSql())
      await db.query(`
        INSERT INTO public.seb_staging_qa_run_reservations VALUES
          ('seb-s5-transitive-fk-drift', $1, $2, $3, 'reserved', '2026-09-23T00:01:00.000Z')
      `, [namespace, 'a'.repeat(40), 'dpl_1234567890abcdef'])
      await db.query(`
        INSERT INTO public.submissions VALUES
          ($1, $2, $3, $4, '2026-09-23T00:02:00.000Z')
      `, [submissionId, assignmentId, studentId, organizationId])
      await db.query(`
        INSERT INTO public.exam_proctor_sessions VALUES
          ('55555555-5555-4555-8555-555555555555', $1, $2, $3, $4, '2026-09-23T00:03:00.000Z')
      `, [submissionId, assignmentId, studentId, organizationId])
      await db.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)")

      const request = {
        schemaVersion: 1,
        operationId: 'delete:submission-proctored',
        table: 'submissions',
        predicates: [
          { column: 'id', operator: 'eq', value: submissionId },
          { column: 'assignment_id', operator: 'eq', value: assignmentId },
          { column: 'student_id', operator: 'eq', value: studentId },
          { column: 'org_id', operator: 'eq', value: organizationId },
          { column: 'created_at', operator: 'gte', value: notBefore },
          { column: 'created_at', operator: 'lte', value: notAfter },
        ],
        maxRows: 1,
        atomicClosure: {
          schemaVersion: 1,
          isolation: 'serializable-parent-lock',
          requireAbsent: [
            ['education_research_scores', 'submission_id'],
            ['exam_proctor_connections', 'submission_id'],
            ['exam_proctor_events', 'submission_id'],
            ['submission_answers', 'submission_id'],
          ].map(([table, column]) => ({
            table,
            predicates: [{ column, operator: 'eq', value: submissionId }],
            expectedCount: 0,
          })),
          requireExact: [
            {
              table: 'exam_proctor_sessions',
              predicates: [{
                column: 'submission_id', operator: 'eq', value: submissionId,
              }],
              expectedCount: 1,
            },
            {
              table: 'exam_proctor_sessions',
              predicates: [
                { column: 'submission_id', operator: 'eq', value: submissionId },
                { column: 'assignment_id', operator: 'eq', value: assignmentId },
                { column: 'student_id', operator: 'eq', value: studentId },
                { column: 'org_id', operator: 'eq', value: organizationId },
                { column: 'created_at', operator: 'gte', value: notBefore },
                { column: 'created_at', operator: 'lte', value: notAfter },
              ],
              expectedCount: 1,
            },
          ],
          allowedCascadeTables: ['exam_proctor_sessions'],
        },
      }

      // The baseline must traverse and accept the complete known FK graph;
      // only the intentionally absent owner lineage should stop the request.
      await expect(db.query(
        'SELECT public.seb_s5_delete_exact_cleanup_target($1, $2::jsonb)',
        [namespace, JSON.stringify(request)],
      )).rejects.toThrow(/SEB S5 owner lineage mismatch/)

      await db.exec(`
        CREATE TABLE public.exam_proctor_session_audits (
          id uuid PRIMARY KEY,
          session_id uuid REFERENCES public.exam_proctor_sessions(id) ON DELETE CASCADE
        );
      `)
      await expect(db.query(
        'SELECT public.seb_s5_delete_exact_cleanup_target($1, $2::jsonb)',
        [namespace, JSON.stringify(request)],
      )).rejects.toThrow(/SEB S5 foreign-key graph drifted/)
    } finally {
      await db.close()
    }
  })

  it('holds a SHARE row lock on the reservation through storage and reconciliation RPCs', async () => {
    const db = new PGlite({ extensions: { pageinspect } })
    const runId = 'seb-s5-reservation-lock'
    const namespace = `qa:${runId}`
    const sourceRevision = 'a'.repeat(40)
    const deploymentId = 'dpl_1234567890abcdef'
    const creationWindow = {
      notBefore: '2026-09-23T00:00:00.000Z',
      notAfter: '2026-09-23T01:00:00.000Z',
    }
    try {
      await db.exec(`
        CREATE EXTENSION pageinspect;
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
        CREATE SCHEMA auth;
        CREATE SCHEMA storage;
        CREATE FUNCTION auth.role()
        RETURNS text
        LANGUAGE sql
        STABLE
        AS $$
          SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
        $$;

        CREATE TABLE auth.users (
          id uuid PRIMARY KEY,
          raw_user_meta_data jsonb,
          raw_app_meta_data jsonb,
          created_at timestamptz
        );
        CREATE TABLE public.users (
          id uuid PRIMARY KEY,
          role text,
          created_at timestamptz
        );
        CREATE TABLE public.organizations (
          id uuid PRIMARY KEY,
          is_personal boolean,
          subscription_tier text,
          deleted_at timestamptz,
          created_at timestamptz
        );
        CREATE TABLE public.organization_members (
          id uuid PRIMARY KEY,
          org_id uuid,
          user_id uuid,
          org_role text,
          joined_at timestamptz
        );
        CREATE TABLE storage.objects (
          bucket_id text,
          name text,
          owner_id uuid,
          created_at timestamptz,
          metadata jsonb
        );
        CREATE TABLE public.seb_staging_qa_run_reservations (
          run_id text PRIMARY KEY,
          qa_namespace text NOT NULL,
          source_sha text NOT NULL,
          deployment_id text NOT NULL,
          state text NOT NULL,
          reserved_at timestamptz NOT NULL
        );
      `)
      await db.exec(migrationSql())
      await db.query(`
        INSERT INTO public.seb_staging_qa_run_reservations VALUES
          ($1, $2, $3, $4, 'reserved', '2026-09-23T00:01:00.000Z')
      `, [runId, namespace, sourceRevision, deploymentId])
      await db.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)")

      const reservationHasShareLock = async tx => {
        const lock = await tx.query(`
          SELECT 'HEAP_XMAX_SHR_LOCK' = ANY(
            (heap_tuple_infomask_flags(t_infomask, t_infomask2)).combined_flags
          ) AS share_locked
          FROM heap_page_items(
            get_raw_page('public.seb_staging_qa_run_reservations', 0)
          )
          WHERE lp_flags = 1
        `)
        expect(lock.rows).toEqual([{ share_locked: true }])
      }

      await db.transaction(async tx => {
        const result = await tx.query(`
          SELECT public.seb_s5_attest_storage_object(
            1, $1, 'submission-files', 'missing-object'
          ) AS result
        `, [namespace])
        expect(result.rows[0].result).toEqual({ schemaVersion: 1, objects: [] })
        await reservationHasShareLock(tx)
      })

      const criteria = {
        schemaVersion: 1,
        targetKey: 'account-teacher-primary',
        kind: 'account',
        identity: { runId, sourceRevision, deploymentId, creationWindow },
        namespace,
        ownerId: null,
        organizationId: null,
        resourceType: 'teacher',
        creationWindow,
      }
      await db.transaction(async tx => {
        const result = await tx.query(
          'SELECT public.seb_s5_find_exact_run_targets($1::jsonb) AS result',
          [JSON.stringify(criteria)],
        )
        expect(result.rows[0].result).toEqual({
          schemaVersion: 1,
          authoritative: true,
          matches: [],
        })
        await reservationHasShareLock(tx)
      })
    } finally {
      await db.close()
    }
  })

  it('reconciles the student-owned check-in through its exact run-bound account', async () => {
    const db = new PGlite()
    const teacherId = '11111111-1111-4111-8111-111111111111'
    const studentId = '22222222-2222-4222-8222-222222222222'
    const organizationId = '33333333-3333-4333-8333-333333333333'
    const assignmentId = '44444444-4444-4444-8444-444444444444'
    const runId = 'seb-s5-contract'
    const namespace = `qa:${runId}`
    const sourceRevision = 'a'.repeat(40)
    const deploymentId = 'dpl_1234567890abcdef'
    const creationWindow = {
      notBefore: '2026-09-23T00:00:00.000Z',
      notAfter: '2026-09-23T01:00:00.000Z',
    }
    try {
      await db.exec(`
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.role()
        RETURNS text
        LANGUAGE sql
        STABLE
        AS $$
          SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
        $$;

        CREATE TABLE auth.users (
          id uuid PRIMARY KEY,
          raw_user_meta_data jsonb NOT NULL,
          raw_app_meta_data jsonb NOT NULL,
          created_at timestamptz NOT NULL
        );
        CREATE TABLE public.users (
          id uuid PRIMARY KEY,
          role text NOT NULL,
          created_at timestamptz NOT NULL
        );
        CREATE TABLE public.organizations (
          id uuid PRIMARY KEY,
          is_personal boolean NOT NULL,
          subscription_tier text NOT NULL,
          deleted_at timestamptz,
          created_at timestamptz NOT NULL
        );
        CREATE TABLE public.organization_members (
          id uuid PRIMARY KEY,
          org_id uuid NOT NULL,
          user_id uuid NOT NULL,
          org_role text NOT NULL,
          joined_at timestamptz NOT NULL
        );
        CREATE TABLE public.seb_staging_qa_run_reservations (
          run_id text PRIMARY KEY,
          qa_namespace text NOT NULL,
          source_sha text NOT NULL,
          deployment_id text NOT NULL,
          state text NOT NULL,
          reserved_at timestamptz NOT NULL
        );
        CREATE TABLE public.exam_seb_checkins (
          org_id uuid NOT NULL,
          assignment_id uuid NOT NULL,
          student_id uuid NOT NULL,
          verified_at timestamptz NOT NULL,
          platform text NOT NULL
        );
      `)
      await db.exec(migrationSql())

      const teacherMetadata = JSON.stringify({
        qa_fixture: 'seb-s5',
        qa_namespace: namespace,
        qa_alias: 'teacher-primary',
        qa_role: 'teacher',
        qa_schema_version: 1,
      })
      const studentMetadata = JSON.stringify({
        qa_fixture: 'seb-s5',
        qa_namespace: namespace,
        qa_alias: 'student-primary',
        qa_role: 'student',
        qa_schema_version: 1,
      })
      await db.query(`
        INSERT INTO auth.users VALUES
          ($1, $2::jsonb, $2::jsonb, '2026-09-23T00:02:00.000Z'),
          ($3, $4::jsonb, $4::jsonb, '2026-09-23T00:02:00.000Z')
      `, [teacherId, teacherMetadata, studentId, studentMetadata])
      await db.query(`
        INSERT INTO public.users VALUES
          ($1, 'teacher', '2026-09-23T00:02:00.000Z'),
          ($2, 'student', '2026-09-23T00:02:00.000Z')
      `, [teacherId, studentId])
      await db.query(`
        INSERT INTO public.organizations VALUES
          ($1, true, 'free', null, '2026-09-23T00:02:00.000Z')
      `, [organizationId])
      await db.query(`
        INSERT INTO public.organization_members VALUES
          ('55555555-5555-4555-8555-555555555555', $1, $2, 'owner', '2026-09-23T00:02:00.000Z')
      `, [organizationId, teacherId])
      await db.query(`
        INSERT INTO public.seb_staging_qa_run_reservations VALUES
          ($1, $2, $3, $4, 'reserved', '2026-09-23T00:01:00.000Z')
      `, [runId, namespace, sourceRevision, deploymentId])
      await db.query(`
        INSERT INTO public.exam_seb_checkins VALUES
          ($1, $2, $3, '2026-09-23T00:03:00.000Z', 'windows')
      `, [organizationId, assignmentId, studentId])
      await db.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)")

      const criteria = {
        schemaVersion: 1,
        targetKey: 'check-in-primary',
        kind: 'checkIn',
        identity: { runId, sourceRevision, deploymentId, creationWindow },
        namespace,
        ownerId: studentId,
        organizationId,
        resourceType: 'windows',
        creationWindow,
      }
      const response = await db.query(
        'SELECT public.seb_s5_find_exact_run_targets($1::jsonb) AS result',
        [JSON.stringify(criteria)],
      )

      expect(response.rows).toHaveLength(1)
      expect(response.rows[0].result).toMatchObject({
        schemaVersion: 1,
        authoritative: true,
        matches: [{
          targetKey: 'check-in-primary',
          kind: 'checkIn',
          targetId: `${assignmentId}:${studentId}`,
          namespace,
          ownerId: studentId,
          organizationId,
          resourceType: 'windows',
        }],
      })
    } finally {
      await db.close()
    }
  })

  it('reconciles exact orphan storage objects without requiring the missing reference row', async () => {
    const db = new PGlite()
    const teacherId = '11111111-1111-4111-8111-111111111111'
    const studentId = '22222222-2222-4222-8222-222222222222'
    const organizationId = '33333333-3333-4333-8333-333333333333'
    const assignmentId = '44444444-4444-4444-8444-444444444444'
    const submissionId = '55555555-5555-4555-8555-555555555555'
    const answerId = '66666666-6666-4666-8666-666666666666'
    const uploadId = '77777777-7777-4777-8777-777777777777'
    const runId = 'seb-s5-orphan-storage'
    const namespace = `qa:${runId}`
    const sourceRevision = 'a'.repeat(40)
    const deploymentId = 'dpl_1234567890abcdef'
    const creationWindow = {
      notBefore: '2026-09-23T00:00:00.000Z',
      notAfter: '2026-09-23T01:00:00.000Z',
    }
    const answerPath = `${studentId}/${submissionId}/${answerId}/${uploadId}.pdf`
    const artifactHash = 'c'.repeat(64)
    const artifactPath = `assignments/${assignmentId}/r1/${artifactHash}.seb`
    try {
      await db.exec(`
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
        CREATE SCHEMA auth;
        CREATE SCHEMA storage;
        CREATE FUNCTION auth.role()
        RETURNS text
        LANGUAGE sql
        STABLE
        AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '') $$;
        CREATE TABLE auth.users (
          id uuid PRIMARY KEY,
          raw_user_meta_data jsonb NOT NULL,
          raw_app_meta_data jsonb NOT NULL,
          created_at timestamptz NOT NULL
        );
        CREATE TABLE public.users (id uuid PRIMARY KEY, role text NOT NULL, created_at timestamptz NOT NULL);
        CREATE TABLE public.organizations (
          id uuid PRIMARY KEY, is_personal boolean NOT NULL, subscription_tier text NOT NULL,
          deleted_at timestamptz, created_at timestamptz NOT NULL
        );
        CREATE TABLE public.organization_members (
          id uuid PRIMARY KEY, org_id uuid NOT NULL, user_id uuid NOT NULL,
          org_role text NOT NULL, joined_at timestamptz NOT NULL
        );
        CREATE TABLE public.seb_staging_qa_run_reservations (
          run_id text PRIMARY KEY, qa_namespace text NOT NULL, source_sha text NOT NULL,
          deployment_id text NOT NULL, state text NOT NULL, reserved_at timestamptz NOT NULL
        );
        CREATE TABLE public.submissions (
          id uuid PRIMARY KEY, student_id uuid NOT NULL, org_id uuid NOT NULL,
          created_at timestamptz NOT NULL
        );
        CREATE TABLE public.assignments (
          id uuid PRIMARY KEY, created_by uuid NOT NULL, org_id uuid NOT NULL,
          type text NOT NULL, secure_browser_mode text NOT NULL, created_at timestamptz NOT NULL
        );
        CREATE TABLE public.submission_answers (
          id uuid PRIMARY KEY, submission_id uuid NOT NULL, question_id uuid NOT NULL,
          org_id uuid NOT NULL, student_answer jsonb NOT NULL, created_at timestamptz NOT NULL
        );
        CREATE TABLE public.questions (
          id uuid PRIMARY KEY, org_id uuid NOT NULL, question_type text NOT NULL
        );
        CREATE TABLE public.assignment_seb_config_releases (
          assignment_id uuid NOT NULL, revision integer NOT NULL, org_id uuid NOT NULL,
          owner_id uuid NOT NULL, artifact_storage_path text NOT NULL,
          artifact_sha256 text NOT NULL, artifact_size_bytes integer NOT NULL,
          security_mode text NOT NULL, created_at timestamptz NOT NULL,
          PRIMARY KEY (assignment_id, revision)
        );
        CREATE TABLE storage.objects (
          bucket_id text NOT NULL, name text NOT NULL, owner_id uuid,
          created_at timestamptz NOT NULL, metadata jsonb NOT NULL
        );
      `)
      await db.exec(migrationSql())

      const teacherMetadata = JSON.stringify({
        qa_fixture: 'seb-s5', qa_namespace: namespace, qa_alias: 'teacher-primary',
        qa_role: 'teacher', qa_schema_version: 1,
      })
      const studentMetadata = JSON.stringify({
        qa_fixture: 'seb-s5', qa_namespace: namespace, qa_alias: 'student-primary',
        qa_role: 'student', qa_schema_version: 1,
      })
      await db.query(`
        INSERT INTO auth.users VALUES
          ($1, $2::jsonb, $2::jsonb, '2026-09-23T00:02:00.000Z'),
          ($3, $4::jsonb, $4::jsonb, '2026-09-23T00:02:00.000Z')
      `, [teacherId, teacherMetadata, studentId, studentMetadata])
      await db.query(`
        INSERT INTO public.users VALUES
          ($1, 'teacher', '2026-09-23T00:02:00.000Z'),
          ($2, 'student', '2026-09-23T00:02:00.000Z')
      `, [teacherId, studentId])
      await db.query(`
        INSERT INTO public.organizations VALUES
          ($1, true, 'free', null, '2026-09-23T00:02:00.000Z')
      `, [organizationId])
      await db.query(`
        INSERT INTO public.organization_members VALUES
          ('88888888-8888-4888-8888-888888888888', $1, $2, 'owner', '2026-09-23T00:02:00.000Z')
      `, [organizationId, teacherId])
      await db.query(`
        INSERT INTO public.seb_staging_qa_run_reservations VALUES
          ($1, $2, $3, $4, 'reserved', '2026-09-23T00:01:00.000Z')
      `, [runId, namespace, sourceRevision, deploymentId])
      await db.query(`
        INSERT INTO public.submissions VALUES
          ($1, $2, $3, '2026-09-23T00:03:00.000Z')
      `, [submissionId, studentId, organizationId])
      await db.query(`
        INSERT INTO public.assignments VALUES
          ($1, $2, $3, 'exam', 'seb_required', '2026-09-23T00:03:00.000Z')
      `, [assignmentId, teacherId, organizationId])
      await db.query(`
        INSERT INTO storage.objects VALUES
          ('submission-files', $1, $2, '2026-09-23T00:04:00.000Z',
            '{"size":"128","mimetype":"application/pdf"}'::jsonb),
          ('assignment-seb-configs', $3, null, '2026-09-23T00:04:00.000Z',
            '{"size":"256","mimetype":"application/seb"}'::jsonb)
      `, [answerPath, studentId, artifactPath])
      await db.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)")

      const criteria = (targetKey, kind, resourceType, ownerId) => ({
        schemaVersion: 1,
        targetKey,
        kind,
        identity: { runId, sourceRevision, deploymentId, creationWindow },
        namespace,
        ownerId,
        organizationId,
        resourceType,
        creationWindow,
      })
      const answer = await db.query(
        'SELECT public.seb_s5_find_exact_run_targets($1::jsonb) AS result',
        [JSON.stringify(criteria(
          'answer-storage', 'answerStorageObject', 'submission_file', studentId,
        ))],
      )
      const artifact = await db.query(
        'SELECT public.seb_s5_find_exact_run_targets($1::jsonb) AS result',
        [JSON.stringify(criteria(
          'assignment-artifact', 'assignmentArtifact', 'seb', teacherId,
        ))],
      )

      expect(answer.rows[0].result.matches).toEqual([
        expect.objectContaining({ targetId: answerPath, ownerId: studentId, organizationId }),
      ])
      expect(artifact.rows[0].result.matches).toEqual([
        expect.objectContaining({ targetId: artifactPath, ownerId: teacherId, organizationId }),
      ])

      const answerAttestation = await db.query(`
        SELECT public.seb_s5_attest_storage_object(
          1, $1, 'submission-files', $2
        ) AS result
      `, [namespace, answerPath])
      const artifactAttestation = await db.query(`
        SELECT public.seb_s5_attest_storage_object(
          1, $1, 'assignment-seb-configs', $2
        ) AS result
      `, [namespace, artifactPath])
      expect(answerAttestation.rows[0].result.objects).toEqual([
        expect.objectContaining({
          bucketName: 'submission-files', path: answerPath,
          ownerId: studentId, sizeBytes: 128, mimeType: 'application/pdf',
        }),
      ])
      expect(artifactAttestation.rows[0].result.objects).toEqual([
        expect.objectContaining({
          bucketName: 'assignment-seb-configs', path: artifactPath,
          ownerId: null, sizeBytes: 256, mimeType: 'application/seb',
        }),
      ])

      // An extant row is never treated as absent: any mismatch must fail
      // closed instead of falling back to orphan-object attestation.
      await db.query(`
        INSERT INTO public.submission_answers VALUES
          ($1, '99999999-9999-4999-8999-999999999999', $2, $3,
            '[]'::jsonb, '2026-09-23T00:03:00.000Z')
      `, [answerId, uploadId, organizationId])
      await expect(db.query(`
        SELECT public.seb_s5_attest_storage_object(
          1, $1, 'submission-files', $2
        )
      `, [namespace, answerPath])).rejects.toThrow(
        /SEB S5 submission object lineage mismatch/,
      )

      await db.query(`
        INSERT INTO public.assignment_seb_config_releases VALUES
          ($1, 1, $2, $3, 'assignments/wrong.seb', $4, 256,
            'test_plaintext', '2026-09-23T00:03:00.000Z')
      `, [assignmentId, organizationId, teacherId, artifactHash])
      await expect(db.query(`
        SELECT public.seb_s5_attest_storage_object(
          1, $1, 'assignment-seb-configs', $2
        )
      `, [namespace, artifactPath])).rejects.toThrow(
        /SEB S5 assignment artifact lineage mismatch/,
      )
    } finally {
      await db.close()
    }
  })
})
