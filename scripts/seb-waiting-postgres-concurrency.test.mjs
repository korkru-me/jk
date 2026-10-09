import { afterEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, stat, mkdtemp, unlink, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  STAGING_PROJECT_REF, WaitingPostgresProofError, assertProofEnvironment, blockerPathsReachControl,
  buildScratchSql, createLinkedCliQuery, extractAtomicFunction, linkedErrorSqlState, main,
  managementHolderSql, managementStartSql, offlineProofPlan, parseLinkedQueryOutput, parseProofArgs,
  runWaitingManagementProof, safeProofError,
  reserveProofJournal, appendProofJournalRecord,
} from './seb-waiting-postgres-concurrency.mjs'

const migration = await readFile(new URL('../supabase/migrations/20261009142610_atomic_seb_exam_start.sql', import.meta.url), 'utf8')
const atomic = extractAtomicFunction(migration)
const runId = 'aa000000-0000-4000-8000-000000000001'
const schema = `seb_waiting_concurrency_${runId.replaceAll('-', '')}`
const sentinel = 'private-password-SENTINEL-do-not-print'
const environment = {
  KORKRU_DEPLOYMENT_ENV: 'staging', EXAM_QA_ENVIRONMENT: 'staging', VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SITE_URL: 'https://korkru-seb-uat.vercel.app',
  NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
  SEB_UAT_ISOLATED_PROJECT: 'true', NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'korkru-seb-uat.vercel.app',
  EXAM_QA_DATA_POLICY: 'synthetic-only', EXAM_QA_COPY_PRODUCTION_DATA: 'false', EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
  SEB_EXAM_WAITING_ENABLED: 'false',
}
const privateHandle = () => ({ truncate: vi.fn(async () => {}), writeFile: vi.fn(async () => {}),
  sync: vi.fn(async () => {}), close: vi.fn(async () => {}) })
const databases = []
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.close())) })

describe('offline PostgreSQL proof boundaries', () => {
  it('defaults to a no-read/no-network plan even when private paths are provided', async () => {
    const emit = vi.fn(), readEnvironment = vi.fn(), readConnectionFile = vi.fn(), query = vi.fn(), loadPg = vi.fn(), reserveReportFile = vi.fn()
    const result = await main(['--env-file', '/private/operator.env', '--report-file', '/private/report.json'],
      { emit, readEnvironment, readConnectionFile, query, loadPg, reserveReportFile })
    expect(result).toEqual(offlineProofPlan())
    expect(result.liveExecuted).toBe(false)
    for (const fn of [readEnvironment, readConnectionFile, query, loadPg, reserveReportFile]) expect(fn).not.toHaveBeenCalled()
    expect(JSON.stringify(emit.mock.calls)).not.toContain(sentinel)
  })
  it.each([
    ['--apply'], ['--apply', '--report-file', 'a'], ['--transport', 'pool'], ['--apply', '--apply'],
    ['--db-url', sentinel], ['--help', '--apply'], ['--connection-file', 'a'],
    ['--apply', '--env-file', 'a', '--report-file', 'a'], ['--env-file'],
  ])('rejects unsafe/ambiguous arguments %#', args => expect(() => parseProofArgs(args)).toThrow(WaitingPostgresProofError))
  it('accepts linked mode without a DB password and needs no new driver', () => {
    expect(parseProofArgs(['--apply', '--env-file', 'a', '--report-file', 'b']).transport).toBe('linked')
    expect(parseProofArgs(['--apply', '--transport', 'linked', '--env-file', 'a', '--report-file', 'b']).transport).toBe('linked')
    expect(() => parseProofArgs(['--transport', 'direct'])).toThrow('INVALID_ARGUMENTS')
    expect(offlineProofPlan().newDriverRequired).toBe(false)
    expect(offlineProofPlan().databasePasswordRequired).toBe(false)
  })
  it('reserves the report before private reads or any cloud request', async () => {
    const order = [], handle = privateHandle(), emit = vi.fn(), query = vi.fn()
    await expect(main(['--apply', '--env-file', '/private/operator.env', '--report-file', '/private/new.json'], {
      emit, query, reserveReportFile: async () => { order.push('reserve'); return handle },
      readEnvironment: async () => { order.push('environment'); throw new Error(sentinel) },
    })).rejects.toMatchObject({ code: 'POSTGRES_PROOF_FAILED' })
    expect(order).toEqual(['reserve', 'environment']); expect(query).not.toHaveBeenCalled()
    expect(handle.writeFile).toHaveBeenCalled(); expect(handle.close).toHaveBeenCalled()
    expect(handle.truncate).not.toHaveBeenCalled()
    expect(JSON.stringify(emit.mock.calls)).not.toContain(sentinel)
  })
  it('existing report denial happens before any private read or cloud request', async () => {
    const readEnvironment = vi.fn(), query = vi.fn()
    await expect(main(['--apply', '--env-file', 'a', '--report-file', 'b'], {
      reserveReportFile: async () => { throw new WaitingPostgresProofError('REPORT_RESERVATION_FAILED') }, readEnvironment, query,
    })).rejects.toMatchObject({ code: 'REPORT_RESERVATION_FAILED' })
    expect(readEnvironment).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled()
  })
  it.each(Object.keys(environment).filter(key => key !== 'SEB_EXAM_WAITING_ENABLED'))('fails closed for missing exact label %s', key => {
    expect(() => assertProofEnvironment({ ...environment, [key]: sentinel })).toThrow('STAGING_UAT_ENVIRONMENT_REQUIRED')
  })
  it('does not activate or depend on W7 native/waiting keys or flags', () => {
    expect(assertProofEnvironment(environment)).toBe(true)
    expect(offlineProofPlan().nativeProof).toBe('not-run')
  })
  it('redacts unknown driver errors, stack, details and SQL', () => {
    expect(safeProofError(Object.assign(new Error(sentinel), { code: '23514', detail: sentinel, query: sentinel }))).toBe('POSTGRES_PROOF_FAILED')
  })
})

describe('durable private NDJSON journal (offline file/mock I/O only)', () => {
  it('reserves wx0600 append mode and preserves complete identity records after a partial later write', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'korkru-seb-journal-test-'))
    const path = join(directory, 'new-proof.ndjson')
    const handle = await reserveProofJournal(path)
    const first = { status: 'reserved', runId, schema }, second = { status: 'running', runId, schema }
    try {
      expect((await stat(path)).mode & 0o777).toBe(0o600)
      await appendProofJournalRecord(handle, first)
      await expect(reserveProofJournal(path)).rejects.toMatchObject({ code: 'REPORT_RESERVATION_FAILED' })
      await appendProofJournalRecord(handle, second)
      // Simulate a later append that writes only a prefix and then fails.
      // Never use positional writes: pwrite semantics differ across platforms.
      const partial = Buffer.from('{"status":"incomplete')
      await expect(appendProofJournalRecord({
        writeFile: async () => { await handle.writeFile(partial); throw new Error(sentinel) },
        sync: async () => handle.sync(),
      }, { status: 'failed', runId, schema })).rejects.toThrow(sentinel)
      const lines = (await readFile(path, 'utf8')).split('\n')
      expect(JSON.parse(lines[0])).toEqual(first)
      expect(JSON.parse(lines[1])).toEqual(second)
      expect(lines[2]).toBe(partial.toString())
    } finally { await handle.close(); await unlink(path); await rmdir(directory) }
  })
  it.each([2, 3])('later journal failure at write %s preserves previously fsynced run identity and redacted JSON stdout', async failAt => {
    const durable = [], emit = vi.fn(), handle = privateHandle()
    let writes = 0
    handle.writeFile.mockImplementation(async bytes => {
      if (++writes >= failAt) throw new Error(sentinel)
      durable.push(String(bytes))
    })
    const query = vi.fn(async sql => {
      if (sql.includes('SELECT p.prosrc')) return [{ prosrc: atomic.body, prosecdef: true,
        proconfig: ['search_path=""'], lanname: 'plpgsql', role: 'postgres', version: 170006 }]
      if (sql.includes('CREATE SCHEMA')) throw new Error(sentinel)
      return [] // No live SQL; exact schema is absent in this simulated failure.
    })
    await expect(main(['--apply', '--env-file', '/private/operator.env', '--report-file', '/private/new.ndjson'], {
      emit, query, reserveReportFile: async () => handle, readEnvironment: async () => environment, readMigration: async () => migration,
    })).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' })
    expect(durable).toHaveLength(failAt - 1)
    const records = durable.map(line => JSON.parse(line.trim()))
    expect(records[0]).toMatchObject({ status: 'reserved', projectRef: STAGING_PROJECT_REF })
    expect(records[0].runId).toMatch(/^[a-f0-9-]{36}$/)
    expect(records[0].schema).toBe(`seb_waiting_concurrency_${records[0].runId.replaceAll('-', '')}`)
    if (failAt === 3) expect(records[1]).toMatchObject({ status: 'running', runId: records[0].runId, schema: records[0].schema })
    else expect(query.mock.calls.some(([sql]) => sql.includes('CREATE SCHEMA'))).toBe(false)
    expect(handle.sync).toHaveBeenCalledTimes(failAt - 1)
    expect(handle.truncate).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledTimes(1)
    const finalJson = JSON.stringify(emit.mock.calls[0][0])
    expect(JSON.parse(finalJson)).toMatchObject({ status: 'failed', code: 'RECONCILIATION_REQUIRED',
      runId: records[0].runId, schema: records[0].schema })
    expect(finalJson).not.toContain(sentinel)
    expect(handle.close).toHaveBeenCalled()
  })
  it('help explains the journal format while stdout stays a JSON result', async () => {
    const emit = vi.fn()
    await main(['--help'], { emit })
    expect(emit.mock.calls[0][0].reportFileFormat).toContain('NDJSON')
    expect(emit.mock.calls[0][0].reportFileFormat).toContain('stdout is one JSON result')
  })
})


describe('exact scratch SQL and lock evidence', () => {
  it('rebinds only the committed body, leaving public/grants/RLS/native registry alone', () => {
    const built = buildScratchSql({ schema, runId, atomic })
    expect(built.sql).toContain(atomic.sql.replaceAll('public.', `"${schema}".`))
    expect(built.sql).not.toMatch(/public\.|CREATE ROLE|ALTER ROLE|CREATE POLICY|ALTER TABLE|CREATE EXTENSION|TRUNCATE/)
    expect(built.sql).toContain('CHECK(correct_answer <> \'rollback-sentinel\')')
    expect(built.sql).toContain(`REVOKE ALL ON SCHEMA "${schema}" FROM PUBLIC, anon, authenticated, service_role`)
    expect(built.sql).not.toContain('student_work_artifacts')
  })
  it.each(['public', 'seb_waiting_concurrency_foo', `${schema}";DROP SCHEMA public CASCADE;--`])('denies ungenerated schema %s', bad => {
    expect(() => buildScratchSql({ schema: bad, runId, atomic })).toThrow('INVALID_SCRATCH_SCHEMA')
  })
  it('rejects extra schema/authority references and migration replacement', () => {
    expect(() => extractAtomicFunction(migration.replace('public.users', 'auth.users'))).toThrow('UNEXPECTED_ATOMIC_MIGRATION')
    expect(() => extractAtomicFunction(migration.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'))).toThrow('UNEXPECTED_ATOMIC_MIGRATION')
  })
  it('uses one implicit transaction per Management request, with the holder signal after the row lock', () => {
    const tag = `swp:${runId.replaceAll('-', '')}:1:h`, holder = managementHolderSql(schema, tag)
    expect(holder.indexOf('FOR UPDATE')).toBeLessThan(holder.indexOf("set_config('application_name'"))
    expect(holder).toContain('pg_sleep(15)'); expect(holder).not.toMatch(/BEGIN|COMMIT/)
    const start = managementStartSql(schema, `${tag}:c1`)
    expect(start).toContain('context.assignment_id'); expect(start).toContain('CROSS JOIN LATERAL')
    expect(start).toContain('pg_backend_pid()'); expect(start).not.toMatch(/BEGIN|COMMIT/)
  })
  it('requires both distinct active Lock waits with a path to the holder', () => {
    const rows = [{ pid: 2, state: 'active', wait_event_type: 'Lock', blockers: [1] },
      { pid: 3, state: 'active', wait_event_type: 'Lock', blockers: [2] }]
    expect(blockerPathsReachControl(rows, [2, 3], 1)).toBe(true)
    expect(blockerPathsReachControl([rows[0], { ...rows[1], blockers: [999] }], [2, 3], 1)).toBe(false)
    expect(blockerPathsReachControl([rows[0], { ...rows[1], state: 'idle' }], [2, 3], 1)).toBe(false)
    expect(blockerPathsReachControl([rows[0], rows[0]], [2, 3], 1)).toBe(false)
    expect(blockerPathsReachControl([{ ...rows[0], blockers: [3] }, rows[1]], [2, 3], 1)).toBe(false)
  })
})

describe('linked CLI transport (mock subprocess; no network)', () => {
  it('parses only rows and discards arbitrary boundary/warning metadata', () => {
    expect(parseLinkedQueryOutput(JSON.stringify({ rows: [{ pid: 1 }], boundary: sentinel, warning: sentinel }))).toEqual([{ pid: 1 }])
    expect(() => parseLinkedQueryOutput(`prefix ${sentinel}`)).toThrow('LINKED_QUERY_RESPONSE_INVALID')
    expect(() => parseLinkedQueryOutput(JSON.stringify({ rows: sentinel }))).toThrow('LINKED_QUERY_RESPONSE_INVALID')
  })
  it('classifies only anchored 23514, never returns arbitrary error messages', () => {
    const stderr = `Initialising login role...\n\u001b[31munexpected status 400: ${JSON.stringify({ message: 'Failed to run sql query: ERROR:  23514: synthetic constraint failure\n' })}\u001b[0m\nTry debug`
    expect(linkedErrorSqlState(stderr)).toBe('23514')
    expect(linkedErrorSqlState(stderr.replace('23514', '22012'))).toBeNull()
    expect(linkedErrorSqlState(`ERROR: 23514: ${sentinel}`)).toBeNull()
  })
  it('checks linked ref before subprocess/file creation, and does not accept arbitrary targets', async () => {
    const execute = vi.fn(), query = createLinkedCliQuery({ execute, readLinkedRef: async () => 'wrong' })
    await expect(query('SELECT 1')).rejects.toMatchObject({ code: 'LINKED_STAGING_PROJECT_REQUIRED' })
    expect(execute).not.toHaveBeenCalled()
  })
  it('uses wx0600 SQL files, explicit Staging ref, bounded execution, no SQL argv and exact cleanup', async () => {
    let path
    const execute = vi.fn(async (_binary, args, options) => {
      path = args[args.indexOf('--file') + 1]
      expect((await stat(path)).mode & 0o777).toBe(0o600)
      expect(await readFile(path, 'utf8')).toBe('SELECT 1')
      expect(args).toContain(STAGING_PROJECT_REF); expect(args).not.toContain('SELECT 1')
      expect(args).not.toContain('--debug'); expect(options.timeout).toBe(30000)
      return { stdout: JSON.stringify({ rows: [{ value: 1 }], warning: sentinel }), stderr: sentinel }
    })
    const query = createLinkedCliQuery({ execute, readLinkedRef: async () => STAGING_PROJECT_REF })
    expect(await query('SELECT 1')).toEqual([{ value: 1 }])
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('rejects malformed response and cleans only its own query file on failure', async () => {
    let path
    const execute = vi.fn(async (_binary, args) => { path = args[args.indexOf('--file') + 1]; return { stdout: sentinel } })
    await expect(createLinkedCliQuery({ execute, readLinkedRef: async () => STAGING_PROJECT_REF })('SELECT 1'))
      .rejects.toMatchObject({ code: 'LINKED_QUERY_RESPONSE_INVALID' })
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

/** This tests SQL/parser/orchestration contracts on one serialized embedded
 * database with MOCK lock evidence. It is explicitly NOT independent-PG proof. */
async function embeddedHarness({ drift = false, cleanupMismatch = false, pidMismatch = false } = {}) {
  const db = new PGlite(); databases.push(db)
  await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;')
  const calls = [], rounds = new Map()
  async function execute(sql) { return (await db.exec(sql)).at(-1)?.rows ?? [] }
  const query = async sql => {
    calls.push(sql)
    if (sql.includes('SELECT p.prosrc')) return [{ prosrc: drift ? 'changed' : atomic.body, prosecdef: true,
      proconfig: ['search_path=""'], lanname: 'plpgsql', role: 'postgres', version: 170006 }]
    if (sql.includes('pg_catalog.pg_stat_activity')) {
      const round = [...rounds.values()].find(value => !value.completed)
      if (!round) return []
      const holderRow = { pid: round.holderPid, state: 'active', wait_event_type: 'Timeout', blockers: [],
        application_name: round.holderTag, observer_pid: round.holderPid + 3 }
      if (round.contenders.length !== 2) return [holderRow]
      const waits = round.contenders.map((item, index) => ({ pid: round.holderPid + index + 1,
        state: 'active', wait_event_type: 'Lock', blockers: [index ? round.holderPid + 1 : round.holderPid],
        application_name: item.tag, observer_pid: round.holderPid + 3 }))
      if (!round.flushing) {
        round.flushing = true
        queueMicrotask(async () => {
          for (let index = 0; index < round.contenders.length; index++) {
            const item = round.contenders[index]
            try { const rows = await execute(item.sql); rows[0].pid = round.holderPid + index + 1 + (pidMismatch ? 100 : 0); item.done(rows) }
            catch (error) { item.reject(error) }
          }
          round.completed = true; round.done([{ pid: round.holderPid }])
        })
      }
      return [holderRow, ...waits]
    }
    if (sql.includes('WITH held AS MATERIALIZED')) {
      const tag = sql.match(/set_config\('application_name','([^']+)'/)[1]
      const round = { holderTag: tag, holderPid: 100 + rounds.size * 10, contenders: [], completed: false }
      rounds.set(tag, round)
      return new Promise(done => { round.done = done })
    }
    if (sql.includes('WITH context AS MATERIALIZED')) {
      const tag = sql.match(/set_config\('application_name','([^']+)'/)[1]
      if (/:c[12]$/.test(tag)) {
        const round = [...rounds.values()].find(value => !value.completed)
        return new Promise((done, reject) => { round.contenders.push({ tag, sql, done, reject }) })
      }
      try { const rows = await execute(sql); rows[0].pid = 999; return rows }
      catch (error) {
        if (error.code === '23514') { const classified = new WaitingPostgresProofError('SNAPSHOT_CONSTRAINT_FAILURE'); classified.pgCode = '23514'; throw classified }
        throw error
      }
    }
    if (cleanupMismatch && sql.includes("obj_description(n.oid,'pg_namespace')")) return [{ owned: true, marker: 'not-our-marker' }]
    return execute(sql)
  }
  return { query, db, calls }
}

describe('management runner offline SQL/orchestration regression, NOT independent-connection proof', () => {
  it('exercises exact SQL snapshots, predecessor receipts, rollback, carry, own cleanup and narrow proof labels', async () => {
    const harness = await embeddedHarness()
    const result = await runWaitingManagementProof({ ...harness, migration, schema, runId, poll: async () => {} })
    expect(result.status).toBe('passed'); expect(result.cleanup).toBe('removed')
    expect(result.concurrencyEvidence).toHaveLength(3)
    expect(result.proofScope).toBe('scratch-function-mechanics-only')
    expect(result.nativeProof).toBe('not-run'); expect(result.publicRpcExecuted).toBe(false)
    expect(result.publicRpcIntegration).toBe('not-run'); expect(result.publicRlsProof).toBe('not-run')
    expect(harness.calls.filter(sql => /DROP SCHEMA/.test(sql))).toEqual([`DROP SCHEMA "${schema}" CASCADE; SELECT true AS removed`])
    expect(harness.calls.some(sql => /INSERT INTO public\.|UPDATE public\.|FROM public\.start_seb_submission_atomic/.test(sql))).toBe(false)
    expect(JSON.stringify(result)).not.toContain('synthetic-feedback')
  }, 20000)
  it('deployed source drift refuses scratch creation', async () => {
    const harness = await embeddedHarness({ drift: true })
    await expect(runWaitingManagementProof({ ...harness, migration, schema, runId })).rejects.toMatchObject({ code: 'DEPLOYED_ATOMIC_FUNCTION_MISMATCH' })
    expect(harness.calls.some(sql => sql.includes('CREATE SCHEMA'))).toBe(false)
  })
  it('does not drop another owner/marker and reports reconciliation-required', async () => {
    const harness = await embeddedHarness({ pidMismatch: true, cleanupMismatch: true })
    await expect(runWaitingManagementProof({ ...harness, migration, schema, runId })).rejects.toMatchObject({
      code: 'RECONCILIATION_REQUIRED', report: { schema, cleanup: 'reconciliation-required' },
    })
    expect(harness.calls.some(sql => sql.includes('DROP SCHEMA'))).toBe(false)
  }, 20000)
  it('does not accept result PID different from observed blocked backend', async () => {
    const harness = await embeddedHarness({ pidMismatch: true })
    await expect(runWaitingManagementProof({ ...harness, migration, schema, runId, poll: async () => {} }))
      .rejects.toMatchObject({ code: 'BACKEND_SESSION_CHANGED', report: { cleanup: 'removed' } })
  }, 20000)
})
