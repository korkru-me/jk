#!/usr/bin/env node
/**
 * Opt-in Staging PostgreSQL mechanics proof, NOT a native/public-RPC/RLS proof.
 * Default invocation is offline: no credentials, driver, or network are read.
 * Live invocation uses the authenticated linked CLI. No DB password or new
 * driver is needed. No public fixtures,
 * release registrations, migrations or roles are
 * created. The exact committed function body is rebound to private scratch
 * tables, exercised on four simultaneous independent backends, then the owned schema is removed.
 */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { open, readFile, mkdtemp, unlink, rmdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseEnvFile } from './check-seb-readiness-core.mjs'

export const STAGING_PROJECT_REF = 'dyuxkrzeveknqgtuzpbh'
const MIGRATION_URL = new URL('../supabase/migrations/20261009142610_atomic_seb_exam_start.sql', import.meta.url)
const TYPES = 'uuid,uuid,text,integer,timestamptz,timestamptz,text,text,uuid,timestamptz,jsonb,jsonb,uuid[]'
const TABLES = Object.freeze(['organizations', 'users', 'assignments', 'questions', 'question_shares',
  'education_research_measurements', 'assignment_seb_config_revisions', 'assignment_seb_config_releases',
  'assignment_classrooms', 'classroom_students', 'classroom_group_members', 'assignment_extensions',
  'submissions', 'submission_answers'])
const SCHEMA_PATTERN = /^seb_waiting_concurrency_[a-f0-9]{32}$/
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const PRIVATE_SCOPE = 'scratch-function-mechanics-only'
const VERSION = '2026-01-01T00:00:00.123456Z'
const IDS = Object.freeze({ org: '10000000-0000-4000-8000-000000000001',
  owner: '20000000-0000-4000-8000-000000000001', student: '20000000-0000-4000-8000-000000000002',
  assignment: '30000000-0000-4000-8000-000000000001', room: '40000000-0000-4000-8000-000000000001',
  q1: '60000000-0000-4000-8000-000000000001', q2: '60000000-0000-4000-8000-000000000002' })
const RELEASE = 'scratch-only-not-a-native-release'
const sleep = ms => new Promise(done => setTimeout(done, ms))
const execFileAsync = promisify(execFile)
const sha256 = value => createHash('sha256').update(value).digest('hex')

export class WaitingPostgresProofError extends Error {
  constructor(code) { super(code); this.name = 'WaitingPostgresProofError'; this.code = code }
}
function fail(code) { throw new WaitingPostgresProofError(code) }
function requireCondition(condition, code) { if (!condition) fail(code) }
export function safeProofError(error) {
  // Never pass through driver messages, stack, query text, detail or credentials.
  return error instanceof WaitingPostgresProofError ? error.code : 'POSTGRES_PROOF_FAILED'
}

export function parseProofArgs(args) {
  const result = { apply: false, help: false, transport: 'linked', envFile: undefined, reportFile: undefined }
  const seen = new Set()
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    requireCondition(!seen.has(flag), 'INVALID_ARGUMENTS'); seen.add(flag)
    if (flag === '--apply') result.apply = true
    else if (flag === '--help') result.help = true
    else if (['--report-file', '--env-file', '--transport'].includes(flag)) {
      const value = args[++i]
      requireCondition(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), 'INVALID_ARGUMENTS')
      const key = { '--report-file': 'reportFile', '--env-file': 'envFile', '--transport': 'transport' }[flag]
      result[key] = value
    } else fail('INVALID_ARGUMENTS')
  }
  requireCondition(!result.help || args.length === 1, 'INVALID_ARGUMENTS')
  requireCondition(result.transport === 'linked', 'INVALID_ARGUMENTS')
  requireCondition(!result.apply || (result.envFile && result.reportFile), 'PRIVATE_FILES_REQUIRED')
  const inputs = [result.envFile].filter(Boolean).map(path => resolve(path))
  requireCondition(!result.reportFile || !inputs.includes(resolve(result.reportFile)), 'PRIVATE_FILE_COLLISION')
  return result
}

export function offlineProofPlan() {
  return Object.freeze({ status: 'offline-plan', projectRef: STAGING_PROJECT_REF, proofScope: PRIVATE_SCOPE,
    liveExecuted: false, credentialsRead: false, preferredTransport: 'authenticated Supabase CLI linked SQL',
    newDriverRequired: false, databasePasswordRequired: false, concurrentBackendCount: 4,
    requiredAuthority: 'Staging-only CREATE/DROP of one generated owned scratch schema',
    transactionBoundary: 'each Management API SQL request is a complete implicit transaction',
    prohibited: ['transaction pool :6543', 'public fixture writes', 'public RPC execution',
      'release registration', 'native keys/artifacts', 'migration/grader/RLS/role changes'],
    nativeProof: 'not-run', publicRpcIntegration: 'not-run', publicRlsProof: 'not-run' })
}

export function assertProofEnvironment(environment) {
  for (const [key, value] of Object.entries({ KORKRU_DEPLOYMENT_ENV: 'staging', EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview', NEXT_PUBLIC_SITE_URL: 'https://korkru-seb-uat.vercel.app',
    NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
    SEB_UAT_ISOLATED_PROJECT: 'true', NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'korkru-seb-uat.vercel.app',
    EXAM_QA_DATA_POLICY: 'synthetic-only', EXAM_QA_COPY_PRODUCTION_DATA: 'false', EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true' })) {
    requireCondition(environment?.[key] === value, 'STAGING_UAT_ENVIRONMENT_REQUIRED')
  }
  // Deliberately no CK/BEK/native release or SEB_EXAM_WAITING_ENABLED=true gate.
  // A scratch database mechanics experiment must not activate the W7 feature.
  return true
}

async function readProofEnvironment(path) {
  let handle
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const metadata = await handle.stat()
    requireCondition(metadata.isFile() && (metadata.mode & 0o077) === 0 && metadata.size > 0
      && metadata.size <= 131072 && (typeof process.getuid !== 'function' || metadata.uid === process.getuid()),
    'PRIVATE_ENVIRONMENT_FILE_REQUIRED')
    const parsed = parseEnvFile(await handle.readFile({ encoding: 'utf8' }), {})
    requireCondition(parsed.warnings.length === 0, 'PRIVATE_ENVIRONMENT_FILE_REQUIRED')
    assertProofEnvironment(parsed.values)
    return parsed.values
  } catch (error) {
    if (error instanceof WaitingPostgresProofError) throw error
    fail('PRIVATE_ENVIRONMENT_FILE_REQUIRED')
  } finally { await handle?.close() }
}


export function extractAtomicFunction(migration) {
  requireCondition(typeof migration === 'string' && migration.length < 100000, 'UNEXPECTED_ATOMIC_MIGRATION')
  const matches = [...migration.matchAll(/CREATE FUNCTION public\.start_seb_submission_atomic\(([\s\S]*?)\nAS \$\$([\s\S]*?)\n\$\$;/g)]
  requireCondition(matches.length === 1, 'UNEXPECTED_ATOMIC_MIGRATION')
  const [sql, declaration, body] = matches[0]
  requireCondition(declaration.includes("LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''")
    && !/CREATE OR REPLACE|ALTER TABLE|CREATE POLICY|DROP FUNCTION/i.test(migration), 'UNEXPECTED_ATOMIC_MIGRATION')
  const references = [...sql.matchAll(/public\.([a-z_]+)/g)].map(match => match[1])
  requireCondition(references.every(name => name === 'start_seb_submission_atomic' || TABLES.includes(name)),
    'UNEXPECTED_ATOMIC_MIGRATION')
  requireCondition(!/\b(?:auth|storage|extensions)\./i.test(sql), 'UNEXPECTED_ATOMIC_MIGRATION')
  return { sql, body: body.trim(), migrationSha256: sha256(migration), bodySha256: sha256(body.trim()) }
}

function schemaIdentifier(schema) {
  requireCondition(SCHEMA_PATTERN.test(schema), 'INVALID_SCRATCH_SCHEMA')
  return `"${schema}"`
}

export function buildScratchSql({ schema, runId, atomic }) {
  const s = schemaIdentifier(schema)
  requireCondition(UUID_PATTERN.test(runId) && atomic && /^[a-f0-9]{64}$/.test(atomic.migrationSha256), 'INVALID_SCRATCH_IDENTITY')
  const marker = `korkru-seb-waiting-concurrency:${runId}:${atomic.migrationSha256}`
  const rebound = atomic.sql.replaceAll('public.', `${s}.`)
  requireCondition(!rebound.includes('public.'), 'UNEXPECTED_ATOMIC_MIGRATION')
  // Deliberately explicit minimal tables: LIKE public INCLUDING DEFAULTS can
  // retain public sequences/functions; cloning triggers/data would cross scope.
  // These fixtures prove transaction mechanics, not deployed table/RLS parity.
  const sql = `CREATE SCHEMA ${s};
REVOKE ALL ON SCHEMA ${s} FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON SCHEMA ${s} IS '${marker}';
CREATE TABLE ${s}.organizations(id uuid PRIMARY KEY);
CREATE TABLE ${s}.users(id uuid PRIMARY KEY, status text NOT NULL);
CREATE TABLE ${s}.assignments(id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES ${s}.organizations,
 created_by uuid NOT NULL REFERENCES ${s}.users, status text NOT NULL DEFAULT 'published',
 mode text NOT NULL DEFAULT 'online', type text NOT NULL DEFAULT 'exam', secure_browser_mode text NOT NULL DEFAULT 'seb_required',
 start_at timestamptz, end_at timestamptz, duration_minutes integer, question_ids uuid[] NOT NULL,
 updated_at timestamptz NOT NULL, completion_rule text NOT NULL DEFAULT 'fixed', retry_scope text NOT NULL DEFAULT 'all',
 max_attempts integer, passing_type text, passing_value numeric, display_max_score numeric,
 random_question_count integer, streak_target integer);
CREATE TABLE ${s}.questions(id uuid PRIMARY KEY, created_by uuid NOT NULL, org_id uuid NOT NULL,
 visibility text NOT NULL DEFAULT 'private', is_research_snapshot boolean NOT NULL DEFAULT false,
 research_snapshot_project_id uuid, updated_at timestamptz NOT NULL, question_type text NOT NULL DEFAULT 'mcq');
CREATE TABLE ${s}.question_shares(question_id uuid NOT NULL REFERENCES ${s}.questions, org_id uuid NOT NULL);
CREATE TABLE ${s}.education_research_measurements(assignment_id uuid UNIQUE, project_id uuid, snapshot_question_ids uuid[]);
CREATE TABLE ${s}.assignment_seb_config_revisions(assignment_id uuid NOT NULL REFERENCES ${s}.assignments, revision integer NOT NULL);
CREATE TABLE ${s}.assignment_seb_config_releases(assignment_id uuid NOT NULL REFERENCES ${s}.assignments,
 revision integer NOT NULL, release_id text UNIQUE NOT NULL, org_id uuid NOT NULL, owner_id uuid NOT NULL);
CREATE TABLE ${s}.assignment_classrooms(assignment_id uuid NOT NULL REFERENCES ${s}.assignments, classroom_id uuid NOT NULL, group_ids uuid[]);
CREATE TABLE ${s}.classroom_students(classroom_id uuid NOT NULL, student_id uuid NOT NULL REFERENCES ${s}.users,
 PRIMARY KEY(classroom_id,student_id));
CREATE TABLE ${s}.classroom_group_members(classroom_id uuid NOT NULL, student_id uuid NOT NULL, group_id uuid NOT NULL);
CREATE TABLE ${s}.assignment_extensions(assignment_id uuid NOT NULL, student_id uuid NOT NULL, extended_end_at timestamptz,
 UNIQUE(assignment_id,student_id));
CREATE TABLE ${s}.submissions(id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES ${s}.organizations, assignment_id uuid NOT NULL REFERENCES ${s}.assignments,
 student_id uuid NOT NULL REFERENCES ${s}.users, started_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL,
 max_score numeric NOT NULL, total_score numeric, attempt_number integer NOT NULL, exam_access_mode text NOT NULL,
 secure_browser_verified_at timestamptz, secure_browser_platform text, secure_browser_version text,
 seb_config_revision integer, streak_reached boolean NOT NULL DEFAULT false, UNIQUE(assignment_id,student_id,attempt_number));
CREATE TABLE ${s}.submission_answers(id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES ${s}.organizations, submission_id uuid NOT NULL REFERENCES ${s}.submissions ON DELETE CASCADE,
 question_id uuid NOT NULL REFERENCES ${s}.questions, random_values jsonb NOT NULL DEFAULT '{}',
 correct_answer text NOT NULL CHECK(correct_answer <> 'rollback-sentinel'), student_answer text, is_correct boolean,
 score numeric NOT NULL DEFAULT 0, max_score numeric NOT NULL, teacher_feedback text, order_index integer NOT NULL DEFAULT 0,
 option_order jsonb, work_images jsonb NOT NULL DEFAULT '[]', math_input_modes jsonb NOT NULL DEFAULT '{}',
 score_edited_by uuid REFERENCES ${s}.users, score_edited_at timestamptz, carried_over boolean NOT NULL DEFAULT false,
 check_count integer NOT NULL DEFAULT 0);
${rebound}
REVOKE ALL ON FUNCTION ${s}.start_seb_submission_atomic(${TYPES}) FROM PUBLIC, anon, authenticated, service_role;`
  requireCondition(!/\b(?:CREATE ROLE|ALTER ROLE|CREATE POLICY|ALTER TABLE|TRUNCATE|public\.|auth\.|storage\.)/i.test(sql),
    'SCRATCH_SCOPE_VIOLATION')
  return { sql, marker }
}

export function blockerPathsReachControl(rows, contenders, controlPid) {
  if (rows.length !== contenders.length || new Set(rows.map(row => row.pid)).size !== contenders.length) return false
  const byPid = new Map(rows.map(row => [row.pid, row]))
  function reaches(pid, seen = new Set()) {
    if (pid === controlPid) return true
    if (seen.has(pid)) return false
    seen.add(pid)
    const row = byPid.get(pid)
    return row?.state === 'active' && row.wait_event_type === 'Lock'
      && Array.isArray(row.blockers) && row.blockers.some(blocker => reaches(blocker, new Set(seen)))
  }
  return contenders.every(pid => reaches(pid))
}

function freshAnswers() {
  return [IDS.q1, IDS.q2].map((question_id, order_index) => ({ question_id, order_index,
    random_values: { x: 2 }, correct_answer: `MCQ:${order_index}`, max_score: 1, option_order: [1, 0] }))
}
function startParameters(options = {}) {
  const now = Date.now()
  return [IDS.assignment, IDS.student, RELEASE, 1, new Date(now - 1000).toISOString(),
    new Date(now + 3600000).toISOString(), 'windows', 'scratch-server-input-not-native-evidence',
    options.predecessor ?? null, options.assignmentVersion ?? VERSION,
    JSON.stringify(options.versions ?? [IDS.q1, IDS.q2].map(question_id => ({ question_id, updated_at: VERSION }))),
    JSON.stringify(options.fresh ?? freshAnswers()), options.carried ?? []]
}
function expectCounts(value, submissions, answers) {
  requireCondition(value?.counts?.submissions === submissions && value?.counts?.answers === answers, 'PARTIAL_OR_DUPLICATE_START')
}
function expectSameReceipt(left, right) {
  requireCondition(left.submission_id === right.submission_id && left.started_at === right.started_at
    && left.attempt_number === right.attempt_number && left.seb_config_revision === right.seb_config_revision,
  'RECEIPT_OR_TIMER_CHANGED')
}

function literal(value) {
  requireCondition(typeof value === 'string' && !value.includes('\0') && value.length < 100000, 'INVALID_PROOF_SQL_VALUE')
  return `'${value.replaceAll("'", "''")}'`
}

export function managementStartSql(schema, tag, options = {}) {
  const s = schemaIdentifier(schema), parameters = startParameters(options)
  requireCondition(typeof tag === 'string' && /^[a-z0-9:-]{1,60}$/.test(tag), 'INVALID_PROOF_TAG')
  const types = TYPES.split(',')
  const argumentsSql = parameters.map((value, index) => {
    if (index === 0) return 'context.assignment_id'
    if (value === null) return `NULL::${types[index]}`
    if (Array.isArray(value)) return `ARRAY[${value.map(literal).join(',')}]::uuid[]`
    return `${literal(String(value))}::${types[index]}`
  }).join(',')
  // The function's first argument depends on context, so local settings happen
  // before the function scan. One statement is one complete implicit transaction.
  return `WITH context AS MATERIALIZED (SELECT ${literal(parameters[0])}::uuid AS assignment_id,
    set_config('application_name',${literal(tag)},true),set_config('statement_timeout','25000',true),
    set_config('lock_timeout','22000',true)), receipt AS MATERIALIZED (
    SELECT started.* FROM context CROSS JOIN LATERAL ${s}.start_seb_submission_atomic(${argumentsSql}) started)
    SELECT pg_backend_pid() AS pid,row_to_json(receipt) AS receipt FROM receipt`
}

export function managementHolderSql(schema, tag) {
  const s = schemaIdentifier(schema)
  requireCondition(typeof tag === 'string' && /^[a-z0-9:-]{1,60}$/.test(tag), 'INVALID_PROOF_TAG')
  // application_name becomes observable only AFTER the exact row is locked.
  // No transaction/session is carried from one Management API request to another.
  return `WITH held AS MATERIALIZED (SELECT id FROM ${s}.assignments WHERE id=${literal(IDS.assignment)}::uuid FOR UPDATE),
    ready AS MATERIALIZED (SELECT set_config('application_name',${literal(tag)},true) AS tag,
      set_config('statement_timeout','25000',true) FROM held),
    slept AS MATERIALIZED (SELECT pg_sleep(15) FROM ready)
    SELECT pg_backend_pid() AS pid FROM slept`
}

function fixtureSeedSql(schema) {
  const s = schemaIdentifier(schema), uuid = value => `${literal(value)}::uuid`
  return `BEGIN;
    INSERT INTO ${s}.organizations VALUES(${uuid(IDS.org)});
    INSERT INTO ${s}.users VALUES(${uuid(IDS.owner)},'active'),(${uuid(IDS.student)},'active');
    INSERT INTO ${s}.assignments(id,org_id,created_by,question_ids,updated_at,max_attempts,duration_minutes)
      VALUES(${uuid(IDS.assignment)},${uuid(IDS.org)},${uuid(IDS.owner)},ARRAY[${uuid(IDS.q1)},${uuid(IDS.q2)}],${literal(VERSION)}::timestamptz,4,60);
    INSERT INTO ${s}.questions(id,created_by,org_id,updated_at)
      VALUES(${uuid(IDS.q1)},${uuid(IDS.owner)},${uuid(IDS.org)},${literal(VERSION)}::timestamptz),
        (${uuid(IDS.q2)},${uuid(IDS.owner)},${uuid(IDS.org)},${literal(VERSION)}::timestamptz);
    INSERT INTO ${s}.assignment_seb_config_revisions VALUES(${uuid(IDS.assignment)},1);
    INSERT INTO ${s}.assignment_seb_config_releases VALUES(${uuid(IDS.assignment)},1,${literal(RELEASE)},${uuid(IDS.org)},${uuid(IDS.owner)});
    INSERT INTO ${s}.assignment_classrooms VALUES(${uuid(IDS.assignment)},${uuid(IDS.room)},NULL);
    INSERT INTO ${s}.classroom_students VALUES(${uuid(IDS.room)},${uuid(IDS.student)});
    COMMIT; SELECT true AS seeded`
}

export function parseLinkedQueryOutput(stdout) {
  let value
  try { value = JSON.parse(stdout) } catch { fail('LINKED_QUERY_RESPONSE_INVALID') }
  requireCondition(value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.rows)
    && value.rows.length <= 1000 && value.rows.every(row => row && typeof row === 'object' && !Array.isArray(row)),
  'LINKED_QUERY_RESPONSE_INVALID')
  return value.rows // Never expose boundary, warning, stderr, or arbitrary output.
}

export function linkedErrorSqlState(stderr) {
  if (typeof stderr !== 'string' || stderr.length > 512000) return null
  const plain = stderr.replace(/\u001b\[[0-9;]*m/g, '')
  const match = plain.match(/unexpected status 400:\s*(\{[^\r\n]+\})/)
  if (!match) return null
  let payload
  try { payload = JSON.parse(match[1]) } catch { return null }
  return typeof payload?.message === 'string' && /^Failed to run sql query: ERROR:\s+23514:/.test(payload.message) ? '23514' : null
}

/** Private query files carry synthetic SQL, never credentials. */
export function createLinkedCliQuery({ workdir = fileURLToPath(new URL('../', import.meta.url)),
  execute = execFileAsync, readLinkedRef = () => readFile(join(workdir, 'supabase/.temp/project-ref'), 'utf8') } = {}) {
  return async sql => {
    requireCondition(typeof sql === 'string' && sql.length > 0 && sql.length <= 100000, 'INVALID_PROOF_SQL_VALUE')
    requireCondition((await readLinkedRef()).trim() === STAGING_PROJECT_REF, 'LINKED_STAGING_PROJECT_REQUIRED')
    let directory, path, handle
    try {
      directory = await mkdtemp(join(tmpdir(), 'korkru-seb-postgres-query-'))
      path = join(directory, 'query.sql')
      handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      await handle.writeFile(sql); await handle.sync(); await handle.close(); handle = undefined
      const { stdout } = await execute('supabase', ['db', 'query', '--linked', '--project-ref', STAGING_PROJECT_REF,
        '--output', 'json', '--workdir', workdir, '--file', path], {
        cwd: workdir, timeout: 30000, maxBuffer: 512000,
        env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: 'true', DO_NOT_TRACK: '1' },
      })
      return parseLinkedQueryOutput(stdout)
    } catch (error) {
      if (error instanceof WaitingPostgresProofError) throw error
      // Capture SQLSTATE only, not messages/queries/details from the CLI.
      if (linkedErrorSqlState(error?.stderr) === '23514') {
        const classified = new WaitingPostgresProofError('SNAPSHOT_CONSTRAINT_FAILURE'); classified.pgCode = '23514'; throw classified
      }
      fail('LINKED_QUERY_FAILED')
    } finally {
      await handle?.close()
      // Exact files created by this call only. No recursive deletion/globs.
      if (path) await unlink(path).catch(() => {})
      if (directory) await rmdir(directory).catch(() => {})
    }
  }
}

async function concurrentManagementStart({ query, schema, runId, round, options, waitTimeoutMs, poll }) {
  const prefix = `swp:${runId.replaceAll('-', '')}:${round}`
  const tags = [`${prefix}:h`, `${prefix}:c1`, `${prefix}:c2`]
  const holder = query(managementHolderSql(schema, tags[0])).then(value => ({ value }), error => ({ error }))
  const pending = []
  const watch = () => query(`SELECT pid,state,wait_event_type,pg_blocking_pids(pid) AS blockers,application_name,
    pg_backend_pid() AS observer_pid FROM pg_catalog.pg_stat_activity
    WHERE application_name=ANY(ARRAY[${tags.map(literal).join(',')}])`)
  let evidence
  try {
    const readyDeadline = Date.now() + waitTimeoutMs
    let holderPid
    do {
      const row = (await watch()).find(row => row.application_name === tags[0])
      // Timeout is sufficient: this exact tagged holder has one pg_sleep call.
      if (row?.state === 'active' && row.wait_event_type === 'Timeout') holderPid = row.pid
      if (holderPid) break
      await poll(50)
    } while (Date.now() < readyDeadline)
    requireCondition(Number.isInteger(holderPid), 'MANAGEMENT_HOLDER_NOT_OBSERVED')
    for (let index = 1; index < tags.length; index++) {
      pending.push(query(managementStartSql(schema, tags[index], options)).then(value => ({ value }), error => ({ error })))
    }
    const waitDeadline = Date.now() + waitTimeoutMs
    do {
      const rows = await watch()
      const contenders = tags.slice(1).map(tag => rows.find(row => row.application_name === tag))
      const pids = contenders.map(row => row?.pid)
      const currentHolder = rows.find(row => row.application_name === tags[0])
      if (currentHolder?.pid === holderPid && pids.every(Number.isInteger) && new Set(pids).size === 2
        && blockerPathsReachControl(contenders, pids, holderPid)) {
        const observerPid = contenders[0].observer_pid
        requireCondition(Number.isInteger(observerPid) && contenders.every(row => row.observer_pid === observerPid)
          && new Set([holderPid, ...pids, observerPid]).size === 4, 'DEDICATED_BACKENDS_REQUIRED')
        evidence = { holderPid, contenderPids: pids, observerPid, lockWaits: contenders.map(({ pid, state, wait_event_type, blockers }) =>
          ({ pid, state, wait_event_type, blockers })) }
        break
      }
      await poll(50)
    } while (Date.now() < waitDeadline)
    requireCondition(evidence, 'INDEPENDENT_LOCK_WAIT_NOT_OBSERVED')
    const [held, ...outcomes] = await Promise.all([holder, ...pending])
    if (held.error || outcomes.some(outcome => outcome.error)) throw held.error ?? outcomes.find(outcome => outcome.error).error
    requireCondition(held.value?.length === 1 && held.value[0].pid === evidence.holderPid, 'BACKEND_SESSION_CHANGED')
    const starts = outcomes.map(outcome => outcome.value)
    requireCondition(starts.every((rows, index) => rows.length === 1 && rows[0].pid === evidence.contenderPids[index]
      && rows[0].receipt), 'BACKEND_SESSION_CHANGED')
    const receipts = starts.map(rows => rows[0].receipt)
    expectSameReceipt(receipts[0], receipts[1])
    requireCondition(receipts.filter(receipt => receipt.created === true).length === 1
      && receipts.filter(receipt => receipt.created === false).length === 1, 'DUPLICATE_START_ALLOCATION')
    return { receipt: receipts[0], evidence }
  } finally { await Promise.allSettled([holder, ...pending]) }
}

export async function runWaitingManagementProof({ query, migration, schema, runId, waitTimeoutMs = 5000,
  poll = sleep, onIdentity = async () => {} }) {
  const atomic = extractAtomicFunction(migration), scratch = buildScratchSql({ schema, runId, atomic })
  requireCondition(typeof query === 'function' && waitTimeoutMs >= 100 && waitTimeoutMs <= 5000, 'INVALID_PROOF_OPTIONS')
  const s = schemaIdentifier(schema)
  let failure, result, cleanup = 'not-created', ddlAttempted = false
  try {
    const live = (await query(`SELECT p.prosrc,p.prosecdef,p.proconfig,l.lanname,current_user AS role,
      current_setting('server_version_num')::integer AS version FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure(${literal(`public.start_seb_submission_atomic(${TYPES})`)})`))[0]
    requireCondition(live?.prosrc?.trim() === atomic.body && live.prosecdef === true && live.lanname === 'plpgsql'
      && JSON.stringify(live.proconfig) === JSON.stringify(['search_path=""']) && live.role === 'postgres' && live.version >= 170000,
    'DEPLOYED_ATOMIC_FUNCTION_MISMATCH')
    await onIdentity({ schema, runId, migrationSha256: atomic.migrationSha256, bodySha256: atomic.bodySha256 })
    ddlAttempted = true // A lost CREATE response must still reconcile exact owned schema.
    await query(`BEGIN; ${scratch.sql} COMMIT; SELECT true AS created`)
    cleanup = 'required'
    const regprocedure = `${schema}.start_seb_submission_atomic(${TYPES})`
    const permissions = (await query(`SELECT has_schema_privilege('anon',${literal(schema)},'USAGE')
      OR has_schema_privilege('authenticated',${literal(schema)},'USAGE') OR has_schema_privilege('service_role',${literal(schema)},'USAGE') AS schema_exposed,
      has_function_privilege('anon',${literal(regprocedure)},'EXECUTE') OR has_function_privilege('authenticated',${literal(regprocedure)},'EXECUTE')
      OR has_function_privilege('service_role',${literal(regprocedure)},'EXECUTE') AS function_exposed`))[0]
    requireCondition(permissions?.schema_exposed === false && permissions.function_exposed === false, 'SCRATCH_EXPOSED')
    await query(fixtureSeedSql(schema))
    const state = async () => {
      const rows = await query(`SELECT (SELECT count(*)::integer FROM ${s}.submissions) AS submissions,
        (SELECT count(*)::integer FROM ${s}.submission_answers) AS answers,
        (SELECT coalesce(jsonb_agg(to_jsonb(sa) ORDER BY sa.submission_id,sa.order_index),'[]'::jsonb) FROM ${s}.submission_answers sa) AS snapshots`)
      requireCondition(rows.length === 1, 'INVALID_SCRATCH_SNAPSHOT')
      return { counts: { submissions: rows[0].submissions, answers: rows[0].answers }, answers: rows[0].snapshots }
    }
    let callNumber = 0
    const start = async options => {
      const rows = await query(managementStartSql(schema, `swp:${runId.replaceAll('-', '')}:r${++callNumber}`, options))
      requireCondition(rows.length === 1 && rows[0].receipt && Number.isInteger(rows[0].pid), 'INVALID_START_RECEIPT')
      return rows[0].receipt
    }
    const common = { query, schema, runId, waitTimeoutMs, poll }
    const first = await concurrentManagementStart({ ...common, round: 1 })
    const frozenFirst = await state(); expectCounts(frozenFirst, 1, 2)
    const replay = await start({ assignmentVersion: '2000-01-01T00:00:00Z', versions: [],
      fresh: freshAnswers().map(answer => ({ ...answer, correct_answer: 'different', random_values: { x: 999 } })) })
    expectSameReceipt(first.receipt, replay); requireCondition(replay.created === false, 'REPLAY_CREATED_ATTEMPT')
    requireCondition(JSON.stringify(await state()) === JSON.stringify(frozenFirst), 'REPLAY_CHANGED_SNAPSHOTS')
    await query(`UPDATE ${s}.submissions SET status='submitted',total_score=0 WHERE id=${literal(first.receipt.submission_id)}::uuid; SELECT true AS updated`)
    const second = await concurrentManagementStart({ ...common, round: 2, options: { predecessor: first.receipt.submission_id } })
    requireCondition(second.receipt.attempt_number === 2, 'WRONG_START_GENERATION'); expectCounts(await state(), 2, 4)
    await query(`UPDATE ${s}.submissions SET status='submitted',total_score=0 WHERE id=${literal(second.receipt.submission_id)}::uuid; SELECT true AS updated`)
    const firstDone = await start({ versions: [], fresh: [] }), secondDone = await start({ predecessor: first.receipt.submission_id, versions: [], fresh: [] })
    expectSameReceipt(first.receipt, firstDone); expectSameReceipt(second.receipt, secondDone)
    requireCondition(!firstDone.created && !secondDone.created && firstDone.submission_status === 'submitted'
      && secondDone.submission_status === 'submitted', 'COMPLETED_REPLAY_CREATED_GENERATION')
    expectCounts(await state(), 2, 4)
    const failing = freshAnswers(); failing[1].correct_answer = 'rollback-sentinel'
    let rolledBack = false
    try { await start({ predecessor: second.receipt.submission_id, fresh: failing }) }
    catch (error) { if (error?.pgCode === '23514') rolledBack = true; else throw error }
    requireCondition(rolledBack, 'SNAPSHOT_FAILURE_NOT_OBSERVED'); expectCounts(await state(), 2, 4)
    const third = await start({ predecessor: second.receipt.submission_id })
    requireCondition(third.created && third.attempt_number === 3, 'ROLLBACK_CONSUMED_GENERATION'); expectCounts(await state(), 3, 6)
    await query(`UPDATE ${s}.submissions SET status='graded',total_score=1 WHERE id=${literal(third.submission_id)}::uuid;
      UPDATE ${s}.submission_answers SET is_correct=(question_id=${literal(IDS.q1)}::uuid),
      score=CASE WHEN question_id=${literal(IDS.q1)}::uuid THEN 1 ELSE 0 END,student_answer='synthetic',teacher_feedback='synthetic-feedback',
      work_images='["synthetic-reference"]',math_input_modes='{"0":"math"}',score_edited_by=${literal(IDS.owner)}::uuid,
      score_edited_at=${literal(VERSION)}::timestamptz WHERE submission_id=${literal(third.submission_id)}::uuid;
      UPDATE ${s}.assignments SET retry_scope='wrong_only' WHERE id=${literal(IDS.assignment)}::uuid; SELECT true AS updated`)
    const carriedBefore = (await query(`SELECT row_to_json(sa) AS answer FROM ${s}.submission_answers sa
      WHERE submission_id=${literal(third.submission_id)}::uuid AND question_id=${literal(IDS.q1)}::uuid`))[0]?.answer
    requireCondition(carriedBefore, 'CARRIED_SNAPSHOT_MISSING')
    const fourth = await concurrentManagementStart({ ...common, round: 3, options: { predecessor: third.submission_id,
      fresh: [freshAnswers()[1]], carried: [carriedBefore.id] } })
    const carriedAfter = (await query(`SELECT row_to_json(sa) AS answer FROM ${s}.submission_answers sa
      WHERE submission_id=${literal(fourth.receipt.submission_id)}::uuid AND question_id=${literal(IDS.q1)}::uuid`))[0]?.answer
    const ignored = new Set(['id', 'submission_id', 'carried_over'])
    requireCondition(carriedAfter?.carried_over === true && fourth.receipt.attempt_number === 4
      && Object.keys(carriedBefore).filter(key => !ignored.has(key)).every(key =>
        JSON.stringify(carriedBefore[key]) === JSON.stringify(carriedAfter[key])), 'CARRIED_METADATA_CHANGED')
    expectCounts(await state(), 4, 8)
    result = { status: 'passed', transport: 'linked-management-api', projectRef: STAGING_PROJECT_REF, proofScope: PRIVATE_SCOPE,
      runId, schema, migrationSha256: atomic.migrationSha256, bodySha256: atomic.bodySha256,
      concurrencyEvidence: [first.evidence, second.evidence, fourth.evidence],
      assertions: ['independent-backends-observed-waiting-on-exact-assignment', 'one-allocation-per-generation',
        'immutable-time-and-answer-snapshot-replay', 'completed-generation-replay-no-new-attempt',
        'snapshot-failure-rolls-back-header-and-answers', 'rollback-does-not-consume-generation', 'wrong-only-carry-preserves-metadata'],
      liveExecuted: true, publicRpcExecuted: false, publicFixturesWritten: false,
      nativeProof: 'not-run', publicRpcIntegration: 'not-run', publicRlsProof: 'not-run' }
  } catch (error) { failure = error }
  finally {
    if (ddlAttempted) try {
      const rows = await query(`SELECT n.nspowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user) AS owned,
        pg_catalog.obj_description(n.oid,'pg_namespace') AS marker FROM pg_catalog.pg_namespace n WHERE n.nspname=${literal(schema)}`)
      if (rows.length) {
        requireCondition(rows.length === 1 && rows[0].owned === true && rows[0].marker === scratch.marker, 'SCRATCH_CLEANUP_OWNERSHIP_MISMATCH')
        await query(`DROP SCHEMA ${s} CASCADE; SELECT true AS removed`)
        requireCondition((await query(`SELECT count(*)::integer AS remaining FROM pg_catalog.pg_namespace WHERE nspname=${literal(schema)}`))[0]?.remaining === 0,
          'SCRATCH_CLEANUP_NOT_CONFIRMED')
        cleanup = 'removed'
      } else cleanup = 'absent'
    } catch { cleanup = 'reconciliation-required' }
  }
  if (failure || cleanup === 'reconciliation-required') {
    const error = new WaitingPostgresProofError(cleanup === 'reconciliation-required' ? 'RECONCILIATION_REQUIRED' : safeProofError(failure))
    error.report = { status: 'failed', code: error.code, runId, schema, cleanup, transport: 'linked-management-api', proofScope: PRIVATE_SCOPE,
      liveExecuted: true, nativeProof: 'not-run', publicRpcIntegration: 'not-run', publicRlsProof: 'not-run' }
    throw error
  }
  return { ...result, cleanup }
}

async function reserveReportFile(path) {
  try { return await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600) }
  catch { fail('REPORT_RESERVATION_FAILED') }
}
async function writeReport(handle, report) {
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
  await handle.truncate(0); await handle.write(bytes, 0, bytes.length, 0); await handle.sync()
}
export async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseProofArgs(args)
  const emit = dependencies.emit ?? (value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`))
  if (options.help) {
    emit({ usage: 'node scripts/seb-waiting-postgres-concurrency.mjs [--apply --transport linked --env-file /private/operator.env --report-file /private/new-proof.json]',
      default: 'offline-plan; private environment is not read and report is not created', warning: 'Requires separately authorized scratch DDL. Not W7/native/public-RPC proof.' })
    return offlineProofPlan()
  }
  if (!options.apply) { const plan = offlineProofPlan(); emit(plan); return plan }
  const runId = randomUUID(), schema = `seb_waiting_concurrency_${runId.replaceAll('-', '')}`
  const reserve = dependencies.reserveReportFile ?? reserveReportFile
  const handle = await reserve(options.reportFile) // before credentials, connect or DDL
  let report = { status: 'reserved', runId, schema, projectRef: STAGING_PROJECT_REF, proofScope: PRIVATE_SCOPE, liveExecuted: false }
  try {
    await writeReport(handle, report)
    const environment = await (dependencies.readEnvironment ?? readProofEnvironment)(options.envFile)
    assertProofEnvironment(environment)
    const migration = await (dependencies.readMigration ?? (() => readFile(MIGRATION_URL, 'utf8')))()
    const onIdentity = async identity => { report = { ...report, ...identity, status: 'running', liveExecuted: true }; await writeReport(handle, report) }
    report = await runWaitingManagementProof({ query: dependencies.query ?? createLinkedCliQuery(), migration, schema, runId, onIdentity })
    await writeReport(handle, report); emit(report); return report
  } catch (error) {
    report = error instanceof WaitingPostgresProofError && error.report
      ? error.report : { ...report, status: 'failed', code: safeProofError(error) }
    try { await writeReport(handle, report) }
    catch { report = { status: 'failed', code: 'RECONCILIATION_REQUIRED', runId, schema,
      cleanup: report.cleanup ?? 'unknown', proofScope: PRIVATE_SCOPE, liveExecuted: report.liveExecuted } }
    emit(report)
    throw new WaitingPostgresProofError(report.code)
  } finally { await handle.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${safeProofError(error)}\n`); process.exitCode = 1 })
}
