import { readFileSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

import {
  SebStagingRunReservationBlockedError,
  createSebStagingRunReservation,
} from './seb-staging-run-reservation.mjs'
import { createSebStagingAggregateCleanupCapability } from './seb-staging-aggregate-cleanup.mjs'
import { createSebStagingCompositeAdapter } from './seb-staging-composite-adapter.mjs'

const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SOURCE_REVISION = 'a'.repeat(40)
const DEPLOYMENT_ID = `dpl_${'B'.repeat(24)}`
const ARTIFACT_SHA256 = 'c'.repeat(64)
const MIGRATION_URL = new URL(
  '../supabase/migrations/20260923163333_add_seb_staging_qa_run_reservations.sql',
  import.meta.url,
)

function environment() {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN,
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
  }
}

function identity(runId = 'seb-s5-reservation-a') {
  return Object.freeze({
    runId,
    sourceRevision: SOURCE_REVISION,
    deploymentId: DEPLOYMENT_ID,
  })
}

function stepRequest(value = identity()) {
  return Object.freeze({
    schemaVersion: 1,
    stepId: 'reserve-unique-run-id',
    phase: 'fixture',
    actor: 'fixture-admin',
    mutates: true,
    identity: value,
  })
}

function cleanupAccounts(runId) {
  const namespace = `qa:${runId}`
  return Object.freeze([
    Object.freeze({
      id: '00000000-0000-4000-8000-000000000001',
      alias: 'teacher-primary',
      role: 'teacher',
      namespace,
    }),
    Object.freeze({
      id: '00000000-0000-4000-8000-000000000002',
      alias: 'student-primary',
      role: 'student',
      namespace,
    }),
  ])
}

function cleanupRequest(value = identity(), overrides = {}) {
  return Object.freeze({
    schemaVersion: 1,
    runId: value.runId,
    namespace: `qa:${value.runId}`,
    identity: value,
    accounts: cleanupAccounts(value.runId),
    ...overrides,
  })
}

function releaseBoundIdentity(value) {
  return Object.freeze({
    ...value,
    releaseId: `asr-${'1'.repeat(32)}-r3-${ARTIFACT_SHA256.slice(0, 16)}`,
    releaseRevision: 3,
    artifactSha256: ARTIFACT_SHA256,
  })
}

function randomBytes(seed) {
  return size => new Uint8Array(size).fill(seed)
}

function clone(value) {
  return value === null || value === undefined
    ? value
    : JSON.parse(JSON.stringify(value))
}

function createDatabaseHarness({ targetOrigin = SUPABASE_ORIGIN } = {}) {
  const rows = new Map()
  const calls = []
  const state = {
    insertMode: 'normal',
    updateMode: 'normal',
    readMode: 'normal',
    serverNow: '2026-09-23T16:30:00.000Z',
    factoryCalls: 0,
  }

  class QueryBuilder {
    constructor(table) {
      this.table = table
      this.operation = 'select'
      this.payload = null
      this.filters = []
    }

    select() {
      return this
    }

    insert(payload) {
      this.operation = 'insert'
      this.payload = clone(payload)
      return this
    }

    update(payload) {
      this.operation = 'update'
      this.payload = clone(payload)
      return this
    }

    eq(column, value) {
      this.filters.push([column, value])
      return this
    }

    maybeSingle() {
      return this.execute()
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject)
    }

    async execute() {
      calls.push({
        table: this.table,
        operation: this.operation,
        payload: clone(this.payload),
        filters: clone(this.filters),
      })
      if (this.table !== 'seb_staging_qa_run_reservations') {
        return { data: null, error: { code: 'wrong_table' } }
      }

      if (this.operation === 'insert') {
        if (state.insertMode === 'throw') throw new Error('transport details must stay private')
        const exists = rows.has(this.payload.run_id)
        if (exists) return { data: null, error: { code: '23505' } }
        if (state.insertMode === 'explicit-error') {
          return { data: null, error: { code: 'synthetic_insert_error' } }
        }
        rows.set(this.payload.run_id, {
          ...clone(this.payload),
          state: 'reserved',
          reserved_at: state.serverNow,
          cleaned_at: null,
        })
        if (state.insertMode === 'commit-throw') {
          state.insertMode = 'normal'
          throw new Error('ambiguous insert transport')
        }
        return { data: null, error: null }
      }

      if (this.operation === 'update') {
        if (state.updateMode === 'throw') throw new Error('transport details must stay private')
        const row = [...rows.values()].find(candidate => this.filters.every(
          ([column, expected]) => candidate[column] === expected,
        ))
        if (state.updateMode === 'explicit-error') {
          return { data: null, error: { code: 'synthetic_update_error' } }
        }
        if (row) {
          Object.assign(row, clone(this.payload))
          if (this.payload.state === 'cleaned') row.cleaned_at = state.serverNow
        }
        if (state.updateMode === 'commit-throw') {
          state.updateMode = 'normal'
          throw new Error('ambiguous update transport')
        }
        return { data: null, error: null }
      }

      if (state.readMode === 'throw') throw new Error('read details must stay private')
      if (state.readMode === 'explicit-error') {
        return { data: null, error: { code: 'synthetic_read_error' } }
      }
      const row = [...rows.values()].find(candidate => this.filters.every(
        ([column, expected]) => candidate[column] === expected,
      ))
      return { data: clone(row ?? null), error: null }
    }
  }

  const factory = async () => {
    state.factoryCalls += 1
    return {
      targetOrigin,
      credentialKind: 'service-role',
      client: {
        supabaseUrl: targetOrigin,
        from(table) {
          return new QueryBuilder(table)
        },
      },
    }
  }

  return { rows, calls, state, factory }
}

function createReservation({
  runIdentity = identity(),
  environmentState = environment(),
  harness = createDatabaseHarness(),
  seed = 7,
} = {}) {
  const capability = createSebStagingRunReservation({
    readEnvironment: () => ({ ...environmentState }),
    identity: runIdentity,
    serviceRoleClientFactory: harness.factory,
    randomBytes: randomBytes(seed),
  })
  return { capability, environmentState, harness, runIdentity }
}

describe('SEB Staging DB-backed run reservation', () => {
  it('blocks construction outside the exact synthetic-only Staging target', () => {
    for (const [field, value] of [
      ['KORKRU_DEPLOYMENT_ENV', 'production'],
      ['EXAM_QA_ENVIRONMENT', 'production'],
      ['VERCEL_ENV', 'production'],
      ['NEXT_PUBLIC_SITE_URL', 'https://korkru.com'],
      ['NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co'],
      ['EXAM_QA_DATA_POLICY', 'mixed'],
      ['EXAM_QA_COPY_PRODUCTION_DATA', 'true'],
      ['EXAM_QA_ALLOW_SYNTHETIC_WRITES', 'false'],
    ]) {
      const environmentState = environment()
      environmentState[field] = value
      expect(() => createReservation({ environmentState })).toThrow(
        SebStagingRunReservationBlockedError,
      )
    }
  })

  it('rejects unsafe identity values before a client is created', () => {
    for (const runIdentity of [
      identity('seb-s5-preview'),
      identity('seb-s5-production-copy'),
      { ...identity(), runId: ' seb-s5-reservation-a' },
      { ...identity(), sourceRevision: 'not-a-sha' },
      { ...identity(), deploymentId: 'not-a-deployment' },
      { ...identity(), extra: true },
    ]) {
      const harness = createDatabaseHarness()
      expect(() => createReservation({ runIdentity, harness })).toThrow(
        SebStagingRunReservationBlockedError,
      )
      expect(harness.state.factoryCalls).toBe(0)
    }
  })

  it('accepts only the exact mutating reservation step and returns redacted evidence', async () => {
    const { capability, harness, runIdentity } = createReservation()
    const invalid = {
      ...stepRequest(runIdentity),
      phase: 'preflight',
    }
    expect(await capability.executeStep(invalid)).toEqual({
      stepId: 'reserve-unique-run-id',
      status: 'failed',
    })
    expect(harness.rows.size).toBe(0)
  })

  it('zeroes the closure-private random nonce immediately after hashing it', () => {
    let nonce = null
    createSebStagingRunReservation({
      readEnvironment: () => environment(),
      identity: identity(),
      serviceRoleClientFactory: createDatabaseHarness().factory,
      randomBytes: size => {
        nonce = new Uint8Array(size).fill(29)
        return nonce
      },
    })
    expect([...nonce]).toEqual(new Array(32).fill(0))
  })

  it('reserves the run, independently reads it back, and never exposes its proof', async () => {
    const { capability, harness, runIdentity } = createReservation()
    const result = await capability.executeStep(stepRequest(runIdentity))

    expect(result).toEqual({ stepId: 'reserve-unique-run-id', status: 'passed' })
    expect(Object.keys(result)).toEqual(['stepId', 'status'])
    expect(harness.state.factoryCalls).toBe(2)
    expect(harness.calls.map(call => call.operation)).toEqual(['insert', 'select'])
    const row = harness.rows.get(runIdentity.runId)
    expect(row).toMatchObject({
      run_id: runIdentity.runId,
      qa_namespace: `qa:${runIdentity.runId}`,
      source_sha: runIdentity.sourceRevision,
      deployment_id: runIdentity.deploymentId,
      state: 'reserved',
      cleaned_at: null,
    })
    expect(row.reservation_proof_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result)).not.toContain(row.reservation_proof_sha256)
  })

  it('accepts a release-bound identity through the real composite reservation route', async () => {
    const harness = createDatabaseHarness()
    const runIdentity = identity('seb-s5-reservation-release-bound')
    const fullIdentity = releaseBoundIdentity(runIdentity)
    const reservation = createReservation({ harness, runIdentity }).capability
    const normalCapability = Object.freeze({
      executeStep: async request => Object.freeze({ stepId: request.stepId, status: 'passed' }),
    })
    const adapter = createSebStagingCompositeAdapter({
      preflightCapability: Object.freeze({
        attest: async () => Object.freeze({
          siteOrigin: 'https://staging.korkru.com',
          supabaseOrigin: SUPABASE_ORIGIN,
          sourceRevision: runIdentity.sourceRevision,
          deploymentId: runIdentity.deploymentId,
          branchRef: 'staging',
          readyState: 'READY',
        }),
      }),
      fixtureAdapter: normalCapability,
      browserDataCapability: normalCapability,
      nativeOperatorCapability: normalCapability,
      expiryControlCapability: normalCapability,
      runReservationCapability: reservation,
    })
    const preflight = Object.freeze({
      schemaVersion: 1,
      stepId: 'verify-staging-isolation',
      phase: 'preflight',
      actor: 'harness',
      mutates: false,
      identity: fullIdentity,
    })
    const reserve = Object.freeze({
      schemaVersion: 1,
      stepId: 'reserve-unique-run-id',
      phase: 'fixture',
      actor: 'fixture-admin',
      mutates: true,
      identity: fullIdentity,
    })

    expect(await adapter.executeStep(preflight)).toEqual({
      stepId: 'verify-staging-isolation',
      status: 'passed',
    })
    expect(await adapter.executeStep(reserve)).toEqual({
      stepId: 'reserve-unique-run-id',
      status: 'passed',
    })
    expect(harness.rows.get(runIdentity.runId)?.state).toBe('reserved')
  })

  it('resolves an ambiguous committed insert only through its private proof read-back', async () => {
    const harness = createDatabaseHarness()
    harness.state.insertMode = 'commit-throw'
    const { capability, runIdentity } = createReservation({ harness })

    expect(await capability.executeStep(stepRequest(runIdentity))).toEqual({
      stepId: 'reserve-unique-run-id',
      status: 'passed',
    })
  })

  it('fails closed when an ambiguous insert did not commit', async () => {
    const harness = createDatabaseHarness()
    harness.state.insertMode = 'throw'
    const { capability, runIdentity } = createReservation({ harness })

    expect(await capability.executeStep(stepRequest(runIdentity))).toEqual({
      stepId: 'reserve-unique-run-id',
      status: 'failed',
    })
    expect(harness.rows.size).toBe(0)
  })

  it('keeps a cleaned tombstone and rejects the same run id in another process', async () => {
    const harness = createDatabaseHarness()
    const first = createReservation({ harness, seed: 11 })
    expect(await first.capability.executeStep(stepRequest(first.runIdentity))).toMatchObject({
      status: 'passed',
    })
    expect(await first.capability.cleanupRun(cleanupRequest(first.runIdentity))).toEqual({
      status: 'passed',
    })

    const second = createReservation({ harness, seed: 12 })
    expect(await second.capability.executeStep(stepRequest(second.runIdentity))).toEqual({
      stepId: 'reserve-unique-run-id',
      status: 'failed',
    })
    expect(await second.capability.cleanupRun(cleanupRequest(second.runIdentity))).toEqual({
      status: 'failed',
    })
    expect(harness.rows.get(first.runIdentity.runId).state).toBe('cleaned')
  })

  it('marks the reservation cleaned and verifies it through a fresh client', async () => {
    const { capability, harness, runIdentity } = createReservation()
    expect((await capability.executeStep(stepRequest(runIdentity))).status).toBe('passed')

    const cleanup = await capability.cleanupRun(cleanupRequest(runIdentity))
    expect(cleanup).toEqual({ status: 'passed' })
    expect(Object.keys(cleanup)).toEqual(['status'])
    expect(harness.state.factoryCalls).toBe(5)
    expect(harness.calls.map(call => call.operation)).toEqual([
      'insert',
      'select',
      'select',
      'update',
      'select',
    ])
    expect(harness.rows.get(runIdentity.runId)).toMatchObject({
      state: 'cleaned',
      cleaned_at: '2026-09-23T16:30:00.000Z',
    })
    expect(harness.calls.find(call => call.operation === 'update')?.payload)
      .toEqual({ state: 'cleaned' })
    expect(await capability.cleanupRun(cleanupRequest(runIdentity))).toEqual({ status: 'passed' })
  })

  it('resolves an ambiguous committed cleanup update by read-back', async () => {
    const harness = createDatabaseHarness()
    const { capability, runIdentity } = createReservation({ harness })
    expect((await capability.executeStep(stepRequest(runIdentity))).status).toBe('passed')
    harness.state.updateMode = 'commit-throw'

    expect(await capability.cleanupRun(cleanupRequest(runIdentity))).toEqual({ status: 'passed' })
    expect(harness.rows.get(runIdentity.runId).state).toBe('cleaned')
  })

  it('fails an ambiguous cleanup update that did not commit and permits a safe retry', async () => {
    const harness = createDatabaseHarness()
    const { capability, runIdentity } = createReservation({ harness })
    expect((await capability.executeStep(stepRequest(runIdentity))).status).toBe('passed')
    harness.state.updateMode = 'throw'

    expect(await capability.cleanupRun(cleanupRequest(runIdentity))).toEqual({ status: 'failed' })
    expect(harness.rows.get(runIdentity.runId).state).toBe('reserved')
    harness.state.updateMode = 'normal'
    expect(await capability.cleanupRun(cleanupRequest(runIdentity))).toEqual({ status: 'passed' })
  })

  it('allows cleanup after writes are disabled but rechecks all other Staging guards', async () => {
    const fixture = createReservation()
    expect((await fixture.capability.executeStep(stepRequest(fixture.runIdentity))).status).toBe('passed')
    fixture.environmentState.EXAM_QA_ALLOW_SYNTHETIC_WRITES = 'false'
    expect(await fixture.capability.cleanupRun(cleanupRequest(fixture.runIdentity))).toEqual({
      status: 'passed',
    })

    const blockedCleanup = createReservation({
      runIdentity: identity('seb-s5-reservation-b'),
      seed: 8,
    })
    expect((await blockedCleanup.capability.executeStep(stepRequest(blockedCleanup.runIdentity))).status)
      .toBe('passed')
    blockedCleanup.environmentState.NEXT_PUBLIC_SITE_URL = 'https://korkru.com'
    expect(await blockedCleanup.capability.cleanupRun(cleanupRequest(blockedCleanup.runIdentity)))
      .toEqual({ status: 'failed' })
  })

  it('rejects a falsely attested service-role client without leaking target details', async () => {
    const harness = createDatabaseHarness({ targetOrigin: 'https://example.supabase.co' })
    const { capability, runIdentity } = createReservation({ harness })
    const result = await capability.executeStep(stepRequest(runIdentity))
    expect(result).toEqual({ stepId: 'reserve-unique-run-id', status: 'failed' })
    expect(JSON.stringify(result)).not.toContain('example.supabase.co')
  })

  it('fails cleanup before reservation without mutating the tombstone', async () => {
    const fixture = createReservation()
    expect(await fixture.capability.cleanupRun(cleanupRequest(fixture.runIdentity))).toEqual({
      status: 'failed',
    })
    expect((await fixture.capability.executeStep(stepRequest(fixture.runIdentity))).status).toBe('passed')
    expect(fixture.harness.rows.get(fixture.runIdentity.runId)?.state).toBe('reserved')
  })

  it('requires exact cleanup identity and namespace', async () => {
    const fixture = createReservation()
    expect((await fixture.capability.executeStep(stepRequest(fixture.runIdentity))).status).toBe('passed')
    expect(await fixture.capability.cleanupRun({
      ...cleanupRequest(fixture.runIdentity),
      namespace: 'qa:someone-else',
    })).toEqual({ status: 'failed' })
    expect(await fixture.capability.cleanupRun({
      ...cleanupRequest(fixture.runIdentity),
      extra: true,
    })).toEqual({ status: 'failed' })
    expect(await fixture.capability.cleanupRun(cleanupRequest(fixture.runIdentity, {
      accounts: [{
        ...cleanupAccounts(fixture.runIdentity.runId)[0],
        password: 'must-not-enter-cleanup',
      }],
    }))).toEqual({ status: 'failed' })
    expect(await fixture.capability.cleanupRun(cleanupRequest({
      ...releaseBoundIdentity(fixture.runIdentity),
      releaseRevision: 4,
    }))).toEqual({ status: 'failed' })
  })

  it('integrates with the exact aggregate cleanup manifest after release binding', async () => {
    const harness = createDatabaseHarness()
    const runIdentity = identity('seb-s5-reservation-integrated')
    const fixture = createReservation({ harness, runIdentity, seed: 19 })
    expect((await fixture.capability.executeStep(stepRequest(runIdentity))).status).toBe('passed')

    const passedParticipant = Object.freeze({
      cleanupRun: async () => Object.freeze({ status: 'passed' }),
    })
    const aggregate = createSebStagingAggregateCleanupCapability({
      readEnvironment: () => environment(),
      answerStorage: passedParticipant,
      artifactStorage: passedParticipant,
      databaseFixture: passedParticipant,
      personalOrganizations: passedParticipant,
      runReservation: fixture.capability,
    })
    const fullIdentity = releaseBoundIdentity(runIdentity)
    const manifest = cleanupRequest(fullIdentity)

    expect(await aggregate.cleanupRun(manifest)).toEqual({ status: 'passed' })
    expect(harness.rows.get(runIdentity.runId).state).toBe('cleaned')
  })
})

describe('SEB Staging reservation migration contract', () => {
  it('is service-role-only, RLS protected, immutable, and deliberately has no delete grant', () => {
    const sql = readFileSync(MIGRATION_URL, 'utf8')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('force row level security')
    expect(sql).toContain('from public, anon, authenticated, service_role')
    expect(sql).toContain('to service_role')
    expect(sql).toContain('grant insert (run_id, qa_namespace, source_sha, deployment_id, reservation_proof_sha256)')
    expect(sql).toContain('grant update (state)')
    expect(sql).toContain('new.cleaned_at := clock_timestamp()')
    expect(sql).toContain("state in ('reserved', 'cleaned')")
    expect(sql).toContain('guard_seb_staging_qa_run_reservation_update')
    expect(sql).not.toMatch(/grant\s+all/i)
    expect(sql).not.toMatch(/grant\s+delete/i)
    expect(sql).not.toMatch(/create\s+policy/i)
  })

  it('applies in Postgres and enforces browser denial, limited service grants, and tombstones', async () => {
    const db = new PGlite()
    const migration = readFileSync(MIGRATION_URL, 'utf8')
    try {
      await db.exec(`
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      `)
      await db.exec(migration)

      const catalog = await db.query(`
        SELECT
          class.relrowsecurity AS rls,
          class.relforcerowsecurity AS force_rls,
          (SELECT COUNT(*)::integer FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'seb_staging_qa_run_reservations') AS policy_count,
          has_table_privilege('anon', class.oid, 'SELECT') AS anon_select,
          has_table_privilege('authenticated', class.oid, 'SELECT') AS authenticated_select,
          has_table_privilege('service_role', class.oid, 'SELECT') AS service_select,
          has_table_privilege('service_role', class.oid, 'INSERT') AS service_table_insert,
          has_table_privilege('service_role', class.oid, 'DELETE') AS service_delete,
          has_column_privilege(
            'service_role', class.oid, 'run_id', 'INSERT'
          ) AS service_run_id_insert,
          has_column_privilege(
            'service_role', class.oid, 'state', 'INSERT'
          ) AS service_state_insert,
          has_column_privilege(
            'service_role', class.oid, 'state', 'UPDATE'
          ) AS service_state_update,
          has_column_privilege(
            'service_role', class.oid, 'cleaned_at', 'UPDATE'
          ) AS service_cleaned_at_update,
          has_column_privilege(
            'service_role', class.oid, 'source_sha', 'UPDATE'
          ) AS service_source_update
        FROM pg_class class
        JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
        WHERE namespace.nspname = 'public'
          AND class.relname = 'seb_staging_qa_run_reservations'
      `)
      expect(catalog.rows).toEqual([{
        rls: true,
        force_rls: true,
        policy_count: 0,
        anon_select: false,
        authenticated_select: false,
        service_select: true,
        service_table_insert: false,
        service_delete: false,
        service_run_id_insert: true,
        service_state_insert: false,
        service_state_update: true,
        service_cleaned_at_update: false,
        service_source_update: false,
      }])

      await db.exec('SET ROLE authenticated')
      await expect(db.query('SELECT * FROM public.seb_staging_qa_run_reservations'))
        .rejects.toThrow()
      await db.exec('RESET ROLE')

      const runId = 'seb-s5-postgres-contract'
      await db.exec('SET ROLE service_role')
      await expect(db.query(
        `INSERT INTO public.seb_staging_qa_run_reservations
          (run_id, qa_namespace, source_sha, deployment_id, reservation_proof_sha256, state, cleaned_at)
         VALUES ($1, $2, $3, $4, $5, 'cleaned', CURRENT_TIMESTAMP)`,
        [
          'seb-s5-invalid-initial-state',
          'qa:seb-s5-invalid-initial-state',
          SOURCE_REVISION,
          DEPLOYMENT_ID,
          'e'.repeat(64),
        ],
      )).rejects.toThrow()
      await db.query(
        `INSERT INTO public.seb_staging_qa_run_reservations
          (run_id, qa_namespace, source_sha, deployment_id, reservation_proof_sha256)
         VALUES ($1, $2, $3, $4, $5)`,
        [runId, `qa:${runId}`, SOURCE_REVISION, DEPLOYMENT_ID, 'd'.repeat(64)],
      )
      await db.query(
        `UPDATE public.seb_staging_qa_run_reservations
         SET state = 'cleaned'
         WHERE run_id = $1`,
        [runId],
      )
      await expect(db.query(
        `UPDATE public.seb_staging_qa_run_reservations
         SET state = 'reserved'
         WHERE run_id = $1`,
        [runId],
      )).rejects.toThrow()
      await expect(db.query(
        'DELETE FROM public.seb_staging_qa_run_reservations WHERE run_id = $1',
        [runId],
      )).rejects.toThrow()
      await expect(db.query(
        `INSERT INTO public.seb_staging_qa_run_reservations
          (run_id, qa_namespace, source_sha, deployment_id, reservation_proof_sha256)
         VALUES ($1, $2, $3, $4, $5)`,
        [runId, `qa:${runId}`, SOURCE_REVISION, DEPLOYMENT_ID, 'f'.repeat(64)],
      )).rejects.toThrow()
      await db.exec('RESET ROLE')

      const tombstone = await db.query(
        `SELECT run_id, state, cleaned_at IS NOT NULL AS has_cleaned_at
         FROM public.seb_staging_qa_run_reservations
         WHERE run_id = $1`,
        [runId],
      )
      expect(tombstone.rows).toEqual([{
        run_id: runId,
        state: 'cleaned',
        has_cleaned_at: true,
      }])
    } finally {
      try {
        await db.exec('RESET ROLE')
      } catch {
        // The database may already be closing after a setup failure.
      }
      await db.close()
    }
  }, 60_000)
})
