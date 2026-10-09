import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Composed server journey, NOT a rendered browser/native/live-DB attestation.
 * Only Next request context/cache and external Auth/DB/Storage boundaries are
 * mocked. No cloud client, enrollment, email, native app, or fixture is used.
 * The fake RPC models a committed receipt; SQL locking is tested separately.
 */
type Row = Record<string, unknown>
type DbResult = { data: unknown; error: { code: string; message: string } | null }
type StoredCookie = { name: string; value: string; options?: Row }
const m = vi.hoisted(() => ({
  client: vi.fn(), admin: vi.fn(), ssr: vi.fn(), revalidate: vi.fn(),
  jar: new Map<string, StoredCookie>(), headers: new Headers(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: async () => m.headers,
  cookies: async () => ({
    get: (name: string) => m.jar.get(name),
    getAll: (name?: string) => [...m.jar.values()].filter(cookie => name === undefined || cookie.name === name),
    set: (name: string, value: string, options?: Row) => { m.jar.set(name, { name, value, options }) },
    delete: (name: string) => { m.jar.delete(name) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/supabase/server', () => ({ createClient: m.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }))
vi.mock('@supabase/ssr', () => ({ createServerClient: m.ssr }))

import { proxy } from '../proxy'
import { GET as entryGET } from '@/app/exam/[assignmentId]/r/[revision]/entry/route'
import { POST as apiPOST } from '@/app/exam/[assignmentId]/r/[revision]/api/route'
import { GET as completionGET } from '@/app/exam/[assignmentId]/r/[revision]/completion/route'
import { GET as resourceGET } from '@/app/exam/[assignmentId]/r/[revision]/resource/route'
import { readSebExamContext, getSebExamCsrfToken } from '@/lib/seb-exam-context.server'
import { authorizeWaitingObject, readWaitingExamData } from '@/lib/seb-waiting.server'
import { getExamTakingData } from '@/lib/exam-taking'
import { createSebRequestHash } from '@/lib/seb'
import { sebSessionCookieName } from '@/lib/seb-session'
import { SEB_EXAM_CONTEXT_COOKIE_NAME } from '@/lib/seb-exam-context-core'
import { SEB_EXAM_TRUSTED_PATHNAME_HEADER } from '@/lib/seb-exam-transport-policy'
import { WAITING_SEB_RELEASE_PROFILE_ID } from '@/lib/seb-waiting-release-policy'
import {
  createWaitingSebArtifactPolicy,
  materializeWaitingSebInitialArtifact,
  materializeWaitingSebTerminalArtifact,
} from '../scripts/seb-waiting-artifact-core.mjs'

const ASSIGNMENT = '30000000-0000-4000-8000-000000000003'
const USER = '20000000-0000-4000-8000-000000000002'
const OTHER_USER = '20000000-0000-4000-8000-000000000009'
const OWNER = '20000000-0000-4000-8000-000000000001'
const ORG = '10000000-0000-4000-8000-000000000001'
const CLASSROOM = '40000000-0000-4000-8000-000000000001'
const QUESTION = '60000000-0000-4000-8000-000000000001'
const SUBMISSION = '70000000-0000-4000-8000-000000000001'
const ANSWER = '80000000-0000-4000-8000-000000000001'
const ORIGIN = 'https://korkru-seb-uat.vercel.app'
// The real deployment parser requires the provider hostname shape. All access
// is intercepted at the client boundary; global fetch is fail-loud as well.
const STORAGE = 'https://synthetic-journey.supabase.co'
const BASE = `/exam/${ASSIGNMENT}/r/3`
const NOW = Date.parse('2026-10-09T03:00:00.000Z')
const VERSION = '2026-10-08T03:00:00.123456+00:00'
const CONFIG_KEY = 'c'.repeat(64) // Local hash input only; never enrolled or sent to a cloud.
const BROWSER_KEY = 'd'.repeat(64)
const QUIT_HASH = 'b'.repeat(64)
const IMAGE = `${STORAGE}/storage/v1/object/public/question-images/${OWNER}/question.png`
const SOLUTION = `${STORAGE}/storage/v1/object/public/question-images/${OWNER}/solution.png`
const nativePolicy = createWaitingSebArtifactPolicy({ origin: ORIGIN, assignmentId: ASSIGNMENT, revision: 3 })
const seed = Buffer.from(`<?xml version="1.0" encoding="utf-8"?><plist version="1.0"><dict>
<key>hashedAdminPassword</key><string>${'e'.repeat(64)}</string>
<key>hashedQuitPassword</key><string>${'a'.repeat(64)}</string>
</dict></plist>`)
const initial = materializeWaitingSebInitialArtifact(seed, nativePolicy, QUIT_HASH, {
  randomBytes: (size: number) => Buffer.alloc(size, 9), hashedAdminPassword: 'f'.repeat(64),
})
const terminal = materializeWaitingSebTerminalArtifact(initial, nativePolicy, { expectedQuitHash: QUIT_HASH })
function ref(bytes: Buffer) {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return { sha256, sizeBytes: bytes.length, path: `assignments/${ASSIGNMENT}/r3/${sha256}.seb` }
}
const initialRef = ref(initial)
const terminalRef = ref(terminal)
const RELEASE_ID = `asr-${ASSIGNMENT.replaceAll('-', '')}-r3-${initialRef.sha256.slice(0, 16)}`
const params = () => ({ params: Promise.resolve({ assignmentId: ASSIGNMENT, revision: '3' }) })

let db: Record<string, Row[]>
let authenticated: Row | null
let failSave: boolean
let failCommit: boolean
let failDownload: boolean
let reads: { table: string; fields: string }[]
let writes: { table: string; patch: Row }[]
let downloads: { bucket: string; path: string }[]
let rpcs: string[]
let refreshes: number
let network: ReturnType<typeof vi.fn>

function fields(value: string): string[] {
  const parts: string[] = []
  let depth = 0; let start = 0
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1
    if (value[index] === ')') depth -= 1
    if (value[index] === ',' && depth === 0) { parts.push(value.slice(start, index).trim()); start = index + 1 }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}
function relation(table: string, row: Row, name: string): Row | null {
  if (name === 'assignments') return db.assignments.find(item => item.id === row.assignment_id) ?? null
  if (name === 'submissions') return db.submissions.find(item => item.id === row.submission_id) ?? null
  if (name === 'questions') return db.questions.find(item => item.id === row.question_id) ?? null
  if (name === 'users' && table === 'submissions') return db.users.find(item => item.id === row.student_id) ?? null
  throw new Error(`Unmodeled local relation: ${table}.${name}`)
}
function project(table: string, row: Row, selection: string): Row {
  const result: Row = {}
  for (const field of fields(selection)) {
    if (field === '*') { Object.assign(result, row); continue }
    const open = field.indexOf('(')
    if (open < 0) { if (field in row) result[field] = row[field]; continue }
    const name = field.slice(0, open).split('!')[0]
    const joined = relation(table, row, name)
    result[name] = joined ? project(name, joined, field.slice(open + 1, -1)) : null
  }
  return structuredClone(result)
}

/** Small fail-loud external backend fake. Real selection/filters/embedded
 * owner relations are honored so the composed guards cannot pass on blanket
 * canned responses. It is NOT PostgREST, SQL transactions, or RLS emulation. */
function query(table: string) {
  if (!Object.hasOwn(db, table)) throw new Error(`Unmodeled local table: ${table}`)
  let selection = '*'
  let patch: Row | null = null
  let count: number | null = null
  let offset = 0
  let ordering: { key: string; ascending: boolean } | null = null
  const filters: ((row: Row) => boolean)[] = []
  function execute(single = false): DbResult {
    let rows = db[table].filter(row => filters.every(filter => filter(row)))
    if (patch) {
      writes.push({ table, patch: structuredClone(patch) })
      if (table === 'submission_answers' && Object.hasOwn(patch, 'student_answer') && failSave) {
        failSave = false; return { data: null, error: { code: 'TEST_TRANSIENT', message: 'synthetic save failure' } }
      }
      if (table === 'submissions' && patch.status === 'submitted' && failCommit) {
        failCommit = false; return { data: null, error: { code: 'TEST_TRANSIENT', message: 'synthetic commit failure' } }
      }
      for (const row of rows) Object.assign(row, patch)
    } else reads.push({ table, fields: selection })
    if (ordering) {
      const { key, ascending } = ordering
      rows = [...rows].sort((a, b) => {
        const left = String(a[key] ?? ''); const right = String(b[key] ?? '')
        return left.localeCompare(right, undefined, { numeric: true }) * (ascending ? 1 : -1)
      })
    }
    rows = rows.slice(offset, count === null ? undefined : offset + count)
    const projected = rows.map(row => project(table, row, selection))
    return { data: single ? projected[0] ?? null : projected, error: null }
  }
  const builder = {
    select(value: string) { selection = value; return builder },
    eq(key: string, value: unknown) { filters.push(row => row[key] === value); return builder },
    is(key: string, value: unknown) { filters.push(row => (row[key] ?? null) === value); return builder },
    in(key: string, values: readonly unknown[]) { filters.push(row => values.includes(row[key])); return builder },
    order(key: string, options: { ascending?: boolean } = {}) { ordering = { key, ascending: options.ascending !== false }; return builder },
    limit(value: number) { count = value; return builder },
    range(from: number, to: number) { offset = from; count = to - from + 1; return builder },
    update(value: Row) { patch = value; return builder },
    insert() { throw new Error('Unexpected non-atomic insertion in local waiting journey') },
    maybeSingle: async () => execute(true),
    single: async () => execute(true),
    then<T>(resolve: (result: DbResult) => T | PromiseLike<T>, reject?: (error: unknown) => unknown) {
      return Promise.resolve().then(() => execute()).then(resolve, reject)
    },
  }
  return builder
}

async function rpc(name: string, args: Row) {
  rpcs.push(name)
  if (name === 'record_exam_seb_checkin') return { data: null, error: null }
  if (name !== 'start_seb_submission_atomic') throw new Error(`Unmodeled local RPC: ${name}`)
  const existing = db.submissions.find(row => row.assignment_id === args.p_assignment_id && row.student_id === args.p_student_id)
  let row = existing
  if (!row) {
    row = { id: SUBMISSION, assignment_id: ASSIGNMENT, student_id: USER, org_id: ORG,
      status: 'in_progress', started_at: new Date().toISOString(), submitted_at: null, attempt_number: 1,
      exam_access_mode: 'seb', seb_config_revision: 3, total_score: null,
      max_score: 1, current_streak: 0, best_streak: 0, streak_reached: false }
    db.submissions.push(row)
    const snapshots = args.p_fresh_answers as Row[]
    for (const snapshot of snapshots) db.submission_answers.push({ ...structuredClone(snapshot),
      id: ANSWER, submission_id: SUBMISSION, org_id: ORG, carried_over: false, student_answer: null,
      score: null, is_correct: null, check_count: 0, work_images: [], math_input_modes: {} })
  }
  return { data: [{ submission_id: row.id, started_at: row.started_at, submission_status: row.status,
    attempt_number: row.attempt_number, seb_config_revision: row.seb_config_revision, created: !existing }], error: null }
}

function request(path: string, options: { origin?: string; method?: string; body?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers({ cookie: [...m.jar.values()].map(cookie => `${cookie.name}=${cookie.value}`).join(';'), ...options.headers })
  return new NextRequest(`${options.origin ?? ORIGIN}${path}`, { method: options.method ?? 'GET', headers, body: options.body })
}
/** Execute real Proxy first; use its sanitized forwarded headers as Next's
 * request context for the real handler. Cookie I/O is the framework seam. */
async function dispatch(req: NextRequest, handler: (req: NextRequest, ctx: ReturnType<typeof params>) => Promise<Response>) {
  const gated = await proxy(req)
  if (!gated.headers.has('x-middleware-next')) return gated
  m.headers = new Headers(req.headers)
  m.headers.delete(SEB_EXAM_TRUSTED_PATHNAME_HEADER)
  const trusted = gated.headers.get(`x-middleware-request-${SEB_EXAM_TRUSTED_PATHNAME_HEADER}`)
  if (trusted) m.headers.set(SEB_EXAM_TRUSTED_PATHNAME_HEADER, trusted)
  return handler(req, params())
}
async function api(operation: string, args: unknown[] = [], options: { origin?: string; path?: string; headers?: Record<string, string> } = {}) {
  const context = await readSebExamContext()
  const csrf = context.status === 'valid' ? getSebExamCsrfToken(context.claims) : ''
  return dispatch(request(options.path ?? `${BASE}/api`, { origin: options.origin, method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-korkru-seb-csrf': csrf ?? '', ...options.headers },
    body: JSON.stringify({ operation, args }) }), apiPOST)
}
async function enterAndLogin() {
  const entered = await dispatch(request(`${BASE}/entry`), entryGET)
  expect(entered.status).toBe(307)
  expect(entered.headers.get('location')).toBe(`${ORIGIN}${BASE}/login`)
  const pending = await readSebExamContext()
  expect(pending.status).toBe('valid')
  if (pending.status === 'valid') expect(pending.claims.userId).toBeNull()
  const logged = await api('login', [{ email: 'student@journey.invalid', password: 'test-only-password' }])
  expect(await logged.json()).toEqual({ result: { success: true, href: `${BASE}/waiting` } })
  const bound = await readSebExamContext()
  expect(bound.status).toBe('valid')
  if (bound.status === 'valid') expect(bound.claims.userId).toBe(USER)
}
async function verifyFixtureNativeCheck() {
  const waiting = await readWaitingExamData({ assignmentId: ASSIGNMENT, revision: '3' })
  expect(waiting.ok).toBe(true)
  if (!waiting.ok || !waiting.challenge) throw new Error('Local waiting fixture unavailable')
  const requestUrl = `${ORIGIN}${BASE}/system-check?sebChallenge=${encodeURIComponent(waiting.challenge)}`
  // These inputs substitute native JS/hash output, not proof of any SEB binary.
  const checked = await api('verify', [{ challenge: waiting.challenge, requestUrl,
    configKeyHash: createSebRequestHash(requestUrl, CONFIG_KEY), browserExamKeyHash: createSebRequestHash(requestUrl, BROWSER_KEY),
    version: 'SEB_Windows_3.10.2.920' }])
  expect(await checked.json()).toMatchObject({ result: { success: true } })
  expect(m.jar.has(sebSessionCookieName(ASSIGNMENT))).toBe(true)
  expect(db.submissions).toHaveLength(0)
}
async function startFixture() {
  await enterAndLogin(); await verifyFixtureNativeCheck()
  const waiting = await readWaitingExamData({ assignmentId: ASSIGNMENT, revision: '3' })
  if (!waiting.ok || !waiting.startIntent) throw new Error('Local start intent unavailable')
  expect(await (await api('start', [waiting.startIntent])).json()).toEqual({ result: { success: true, href: `${BASE}/take` } })
  return waiting.startIntent
}

beforeEach(() => {
  vi.clearAllMocks(); m.jar.clear(); m.headers = new Headers()
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW)
  const env: Record<string, string> = {
    NODE_ENV: 'test', SEB_SESSION_SECRET: 'synthetic-local-journey-hmac-secret-never-enrolled',
    SEB_EXAM_WAITING_ENABLED: 'true', SEB_EXAM_WAITING_RELEASES: JSON.stringify([{
      assignmentId: ASSIGNMENT, revision: 3, releaseId: RELEASE_ID, origin: ORIGIN,
      profileId: WAITING_SEB_RELEASE_PROFILE_ID, initial: initialRef, terminal: terminalRef,
    }]),
    SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS: 'true', KORKRU_DEPLOYMENT_ENV: 'staging', EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'production', SEB_UAT_ISOLATED_PROJECT: 'true', NEXT_PUBLIC_SITE_URL: ORIGIN,
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'korkru-seb-uat.vercel.app', EXAM_QA_PRODUCTION_SITE_URL: 'https://korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: STORAGE, EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://synthetic-production.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-never-used', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-never-used',
  }
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  network = vi.fn(async () => { throw new Error('Network forbidden in local waiting journey') })
  vi.stubGlobal('fetch', network)
  authenticated = null; failSave = false; failCommit = false; failDownload = false
  reads = []; writes = []; downloads = []; rpcs = []; refreshes = 0
  db = {
    users: [{ id: USER, email: 'student@journey.invalid', full_name: 'นักเรียนสังเคราะห์', role: 'student', status: 'active', survey_role: 'student' }],
    assignments: [{ id: ASSIGNMENT, org_id: ORG, created_by: OWNER, classroom_id: CLASSROOM,
      title: 'Synthetic waiting journey', status: 'published', type: 'exam', mode: 'online', secure_browser_mode: 'seb_required',
      android_exam_mode: 'blocked', access_code: null, completion_rule: 'fixed', duration_minutes: 30, start_at: null, end_at: null,
      max_attempts: 1, passing_type: null, passing_value: null, display_max_score: null, retry_scope: 'all', question_ids: [QUESTION],
      question_points: null, random_question_count: null, shared_random_seed: null, shuffle_questions: false, shuffle_options: false,
      require_work_image: false, updated_at: VERSION, show_sections: false, sections: null,
      proctoring_enabled: false, fullscreen_required: false, block_clipboard: false, exam_watermark_enabled: false,
      questions_per_page: 1, instant_check: false, instant_check_answer_key: false, calculator_enabled: true, scratchpad_enabled: true }],
    questions: [{ id: QUESTION, org_id: ORG, created_by: OWNER, visibility: 'private', title: 'Synthetic MCQ',
      question_type: 'mcq', question_text: 'Select A', variables: [], logic_rules: [], extra_data: null, answer_parts: null,
      mcq_options: [{ text: 'A', is_correct: true }, { text: 'B', is_correct: false }], image_urls: [IMAGE],
      solution_text: 'SYNTHETIC_PRIVATE_SOLUTION', solution_image_urls: [SOLUTION], answer_tolerance: 0, answer_unit: null, updated_at: VERSION }],
    assignment_classrooms: [{ assignment_id: ASSIGNMENT, classroom_id: CLASSROOM, group_ids: null }],
    classroom_students: [{ student_id: USER, classroom_id: CLASSROOM }],
    assignment_seb_config_revisions: [{ assignment_id: ASSIGNMENT, revision: 3, org_id: ORG, owner_id: OWNER, hashed_quit_password: QUIT_HASH }],
    assignment_seb_config_releases: [{ assignment_id: ASSIGNMENT, revision: 3, org_id: ORG, owner_id: OWNER,
      release_id: RELEASE_ID, artifact_storage_path: initialRef.path, artifact_sha256: initialRef.sha256,
      artifact_size_bytes: initialRef.sizeBytes, config_key: CONFIG_KEY,
      browser_exam_keys: [{ platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: BROWSER_KEY }],
      security_mode: 'test_plaintext', created_at: '2026-10-09T01:00:00.000Z' }],
    submissions: [], submission_answers: [], assignment_extensions: [], question_shares: [], education_research_measurements: [],
    student_work_artifacts: [], exam_proctor_connections: [], exam_proctor_sessions: [],
  }
  const auth = {
    getUser: async () => ({ data: { user: authenticated }, error: null }),
    getSession: async () => { refreshes += 1; return { data: { session: authenticated ? { user: authenticated } : null }, error: null } },
    signInWithPassword: async (input: Row) => {
      authenticated = input.email === 'student@journey.invalid' && input.password === 'test-only-password'
        ? { id: USER, email: 'student@journey.invalid', user_metadata: {} } : null
      return { data: { user: authenticated }, error: authenticated ? null : { code: 'invalid_credentials' } }
    },
  }
  m.client.mockResolvedValue({ auth }); m.ssr.mockReturnValue({ auth })
  m.admin.mockReturnValue({ from: query, rpc, storage: { from: (bucket: string) => ({
    download: async (path: string) => {
      downloads.push({ bucket, path })
      const bytes = bucket === 'assignment-seb-configs' && path === initialRef.path ? initial
        : bucket === 'assignment-seb-configs' && path === terminalRef.path ? terminal
          : bucket === 'question-images' && path === `${OWNER}/question.png` ? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]) : null
      return { data: bytes && !failDownload ? new Blob([new Uint8Array(bytes)]) : null, error: null }
    },
    createSignedUrl: () => { throw new Error('Unexpected signed config URL in local waiting journey') },
  }) } })
})
afterEach(() => {
  try { expect(network).not.toHaveBeenCalled() } finally {
    vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals()
  }
})

describe('real composed waiting-room server journey with offline external boundaries', () => {
  it('logs in, waits without questions/timer, explicitly starts, retries autosave, resumes the same timer, commits submit, then releases frozen exit bytes', async () => {
    await enterAndLogin()
    const noTimer = await readWaitingExamData({ assignmentId: ASSIGNMENT, revision: '3' })
    expect(noTimer.ok).toBe(true)
    if (!noTimer.ok) return
    expect(noTimer.view).toMatchObject({ phase: 'ready', verified: false, canStart: false, canResume: false })
    expect(db.submissions).toHaveLength(0); expect(db.submission_answers).toHaveLength(0); expect(writes).toEqual([])
    expect(reads.some(read => ['questions', 'submission_answers'].includes(read.table))).toBe(false)
    expect(JSON.stringify(noTimer)).not.toMatch(/SYNTHETIC_PRIVATE_SOLUTION|MCQ:0|config_key|browser_exam_keys/)
    expect((await dispatch(request(`${BASE}/completion`), completionGET)).status).toBe(403)
    expect(downloads).toEqual([])

    await verifyFixtureNativeCheck()
    vi.setSystemTime(NOW + 60_000)
    const ready = await readWaitingExamData({ assignmentId: ASSIGNMENT, revision: '3' })
    if (!ready.ok || !ready.startIntent) throw new Error('Local ready fixture unavailable')
    expect(ready.view.canStart).toBe(true)
    expect(db.submissions).toHaveLength(0)
    expect(await (await api('start', [ready.startIntent])).json()).toEqual({ result: { success: true, href: `${BASE}/take` } })
    expect(db.submissions).toHaveLength(1); expect(db.submission_answers).toHaveLength(1)
    const started = db.submissions[0].started_at
    expect(started).toBe(new Date(NOW + 60_000).toISOString())
    const frozen = structuredClone(db.submission_answers[0].random_values)
    expect(db.submission_answers[0].correct_answer).toBe('MCQ:0')
    const safe = await getExamTakingData(SUBMISSION)
    expect(safe?.answers).toHaveLength(1)
    expect(JSON.stringify(safe)).not.toMatch(/SYNTHETIC_PRIVATE_SOLUTION|MCQ:0|is_correct|solution_image_urls/)

    failSave = true
    expect(await (await api('saveAnswer', [ANSWER, '0'])).json()).toMatchObject({ result: { error: 'synthetic save failure' } })
    expect(db.submission_answers[0].student_answer).toBeNull()
    expect(await (await api('saveAnswer', [ANSWER, '0'])).json()).toEqual({ result: { success: true } })
    vi.setSystemTime(NOW + 5 * 60_000)
    const resumed = await api('resume')
    expect(await resumed.json()).toEqual({ result: { success: true, href: `${BASE}/take` } })
    expect(db.submissions).toHaveLength(1); expect(db.submissions[0].started_at).toBe(started)
    expect(db.submission_answers).toHaveLength(1); expect(db.submission_answers[0].random_values).toEqual(frozen)
    expect((await getExamTakingData(SUBMISSION))?.answers[0].student_answer).toBe('0')

    failCommit = true
    const failed = await api('submitSubmission', [SUBMISSION])
    expect(await failed.json()).toMatchObject({ result: { error: expect.any(String) } })
    expect(db.submissions[0].status).toBe('in_progress')
    const noExit = await dispatch(request(`${BASE}/completion`), completionGET)
    expect(noExit.status).toBe(403); expect(noExit.headers.get('content-type')).toContain('text/plain')
    expect(noExit.headers.has('content-disposition')).toBe(false); expect(downloads).toEqual([])
    expect(await (await api('submitSubmission', [SUBMISSION])).json()).toMatchObject({ result: { success: true } })
    expect(db.submissions[0].status).toBe('submitted'); expect(db.submissions[0].submitted_at).toBeTruthy()
    const gradeWrites = writes.length
    expect(await (await api('submitSubmission', [SUBMISSION])).json()).toEqual({ result: { success: true } })
    expect(writes).toHaveLength(gradeWrites) // Lost-response retry reads committed receipt, never regrades.
    expect((await api('saveAnswer', [ANSWER, '1'])).status).toBe(403)
    const exit = await dispatch(request(`${BASE}/completion`), completionGET)
    expect(exit.status).toBe(200); expect(exit.headers.get('content-type')).toBe('application/seb')
    expect(exit.headers.get('cache-control')).toContain('no-store')
    expect(Buffer.from(await exit.arrayBuffer())).toEqual(terminal)
    expect(m.jar.has(sebSessionCookieName(ASSIGNMENT))).toBe(false)
    expect(downloads).toEqual([{ bucket: 'assignment-seb-configs', path: initialRef.path }, { bucket: 'assignment-seb-configs', path: terminalRef.path }])
    expect(rpcs.filter(name => name === 'start_seb_submission_atomic')).toHaveLength(1)
    expect(m.jar.get(SEB_EXAM_CONTEXT_COOKIE_NAME)?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
    expect(m.jar.get(SEB_EXAM_CONTEXT_COOKIE_NAME)?.options).not.toHaveProperty('domain')
  })

  it('reconciles repeated explicit start and then a lost response after committed submission without another generation', async () => {
    const intent = await startFixture()
    const started = db.submissions[0].started_at
    expect(await (await api('start', [intent])).json()).toEqual({ result: { success: true, href: `${BASE}/take` } })
    expect(db.submissions).toHaveLength(1); expect(db.submission_answers).toHaveLength(1)
    expect(db.submissions[0].started_at).toBe(started)
    expect(await (await api('submitSubmission', [SUBMISSION])).json()).toMatchObject({ result: { success: true } })
    expect(await (await api('start', [intent])).json()).toEqual({ result: { success: true, href: `${BASE}/submitted` } })
    expect(db.submissions).toHaveLength(1); expect(db.submission_answers).toHaveLength(1)
  })

  it('keeps completion HTTP-only when private artifact verification/download fails after submit', async () => {
    await startFixture(); await api('submitSubmission', [SUBMISSION])
    failDownload = true
    const response = await dispatch(request(`${BASE}/completion`), completionGET)
    expect(response.status).toBe(503); expect(response.headers.get('content-type')).toContain('text/plain')
    expect(response.headers.has('content-disposition')).toBe(false)
    expect(m.jar.has(sebSessionCookieName(ASSIGNMENT))).toBe(true)
  })

  it('blocks expired edits/resources, then explicitly finalizes the same receipt through resume without resetting its timer', async () => {
    await startFixture()
    const started = db.submissions[0].started_at
    vi.setSystemTime(NOW + 31 * 60_000)
    const data = await readWaitingExamData({ assignmentId: ASSIGNMENT, revision: '3' })
    expect(data.ok).toBe(true)
    if (!data.ok) return
    expect(data.view).toMatchObject({ phase: 'active', canResume: true, needsFinalization: true, canStart: false })
    expect((await api('saveAnswer', [ANSWER, '0'])).status).toBe(403)
    expect((await dispatch(request(`${BASE}/resource?src=${encodeURIComponent(IMAGE)}`), resourceGET)).status).toBe(403)
    expect(downloads).toEqual([])
    expect(await (await api('resume')).json()).toEqual({ result: { success: true, href: `${BASE}/submitted` } })
    expect(db.submissions).toHaveLength(1); expect(db.submission_answers).toHaveLength(1)
    expect(db.submissions[0]).toMatchObject({ started_at: started, status: 'submitted' })
    expect(rpcs.filter(name => name === 'start_seb_submission_atomic')).toHaveLength(1)
  })
})

describe('separate composed host/origin/context/CSRF/resource negative journeys', () => {
  it('wrong native hash input cannot mint verification, record check-in, read questions or create an attempt', async () => {
    await enterAndLogin()
    const data = await readWaitingExamData({ assignmentId: ASSIGNMENT, revision: '3' })
    if (!data.ok || !data.challenge) throw new Error('Local waiting fixture unavailable')
    const requestUrl = `${ORIGIN}${BASE}/system-check?sebChallenge=${encodeURIComponent(data.challenge)}`
    expect(await (await api('verify', [{ challenge: data.challenge, requestUrl,
      configKeyHash: '0'.repeat(64), browserExamKeyHash: createSebRequestHash(requestUrl, BROWSER_KEY),
      version: 'SEB_Windows_3.10.2.920' }])).json()).toMatchObject({ result: { error: expect.any(String) } })
    expect(m.jar.has(sebSessionCookieName(ASSIGNMENT))).toBe(false)
    expect(rpcs).toEqual([]); expect(db.submissions).toHaveLength(0)
    expect(reads.some(read => ['questions', 'submission_answers'].includes(read.table))).toBe(false)
  })

  it('wrong entry host cannot mint context; wrong API host/origin cannot allocate', async () => {
    expect((await dispatch(request(`${BASE}/entry`, { origin: 'https://other.invalid' }), entryGET)).status).toBe(404)
    expect(m.jar.size).toBe(0)
    await enterAndLogin(); await verifyFixtureNativeCheck()
    const data = await readWaitingExamData({ assignmentId: ASSIGNMENT, revision: '3' })
    if (!data.ok || !data.startIntent) throw new Error('Local waiting fixture unavailable')
    expect((await api('start', [data.startIntent], { origin: 'https://other.invalid' })).status).toBe(403)
    expect((await api('start', [data.startIntent], { headers: { origin: 'https://other.invalid' } })).status).toBe(403)
    expect(db.submissions).toHaveLength(0)
  })

  it('invalid/duplicate/expired context and cross-scope entry fail before Auth refresh', async () => {
    await enterAndLogin()
    const valid = m.jar.get(SEB_EXAM_CONTEXT_COOKIE_NAME)!.value
    const prior = refreshes
    const markers = [`${SEB_EXAM_CONTEXT_COOKIE_NAME}=tampered`, `${SEB_EXAM_CONTEXT_COOKIE_NAME}=${valid}; ${SEB_EXAM_CONTEXT_COOKIE_NAME}=${valid}`]
    for (const cookie of markers) expect((await dispatch(request(`${BASE}/waiting`, { headers: { cookie } }), entryGET)).status).toBe(403)
    expect((await dispatch(request(BASE.replace('/r/3', '/r/4') + '/entry'), entryGET)).status).toBe(403)
    vi.setSystemTime(NOW + 12 * 60 * 60_000)
    expect((await dispatch(request(`${BASE}/waiting`), entryGET)).status).toBe(403)
    expect(refreshes).toBe(prior); expect(db.submissions).toHaveLength(0)
  })

  it('wrong CSRF, query spoofing, Next-Action, progressive POST and unrelated JSON operations do not start or read questions', async () => {
    await enterAndLogin(); await verifyFixtureNativeCheck()
    const data = await readWaitingExamData({ assignmentId: ASSIGNMENT, revision: '3' })
    if (!data.ok || !data.startIntent) throw new Error('Local waiting fixture unavailable')
    expect((await api('start', [data.startIntent], { headers: { 'x-korkru-seb-csrf': 'wrong' } })).status).toBe(403)
    expect((await api('start', [data.startIntent], { path: `${BASE}/api?completion_rule=fixed` })).status).toBe(403)
    expect((await api('start', [data.startIntent], { headers: { 'next-action': 'guessed-action' } })).status).toBe(403)
    expect((await dispatch(request(`${BASE}/waiting`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'start=1' }), apiPOST)).status).toBe(405)
    expect((await api('getSolutions', [QUESTION])).status).toBe(400)
    expect(db.submissions).toHaveLength(0)
    expect(reads.some(read => ['questions', 'submission_answers'].includes(read.table))).toBe(false)
    expect(rpcs.filter(name => name === 'start_seb_submission_atomic')).toHaveLength(0)
  })

  it('pre-start resource, arbitrary fetch URL, solution asset and extra query are denied; exact current question asset succeeds', async () => {
    await enterAndLogin()
    expect((await dispatch(request(`${BASE}/resource?src=${encodeURIComponent(IMAGE)}`), resourceGET)).status).toBe(403)
    expect(downloads).toEqual([])
    // Reuse bound login; a second entry in the same scope does not replace it.
    await verifyFixtureNativeCheck()
    const data = await readWaitingExamData({ assignmentId: ASSIGNMENT, revision: '3' })
    if (!data.ok || !data.startIntent) throw new Error('Local waiting fixture unavailable')
    await api('start', [data.startIntent])
    for (const src of ['https://other.invalid/private.png', SOLUTION]) {
      expect((await dispatch(request(`${BASE}/resource?src=${encodeURIComponent(src)}`), resourceGET)).status).toBe(403)
    }
    expect((await dispatch(request(`${BASE}/resource?src=${encodeURIComponent(IMAGE)}&profile=fixed`), resourceGET)).status).toBe(403)
    expect(downloads).toEqual([])
    const allowed = await dispatch(request(`${BASE}/resource?src=${encodeURIComponent(IMAGE)}`), resourceGET)
    expect(allowed.status).toBe(200); expect(allowed.headers.get('content-type')).toBe('image/png')
    expect(downloads).toEqual([{ bucket: 'question-images', path: `${OWNER}/question.png` }])
  })

  it('changed authenticated account cannot reuse the bound context or mutate another answer', async () => {
    await startFixture()
    authenticated = { id: OTHER_USER, email: 'other@journey.invalid', user_metadata: {} }
    const before = writes.length
    expect((await api('saveAnswer', [ANSWER, '1'])).status).toBe(403)
    expect((await api('resume')).status).toBe(403)
    expect(writes).toHaveLength(before); expect(db.submissions).toHaveLength(1)
  })

  it('unsupported streak cannot be revived by start/resume/resource, allowExpired or query/body profile claims', async () => {
    await enterAndLogin(); await verifyFixtureNativeCheck()
    const data = await readWaitingExamData({ assignmentId: ASSIGNMENT, revision: '3' })
    if (!data.ok || !data.startIntent) throw new Error('Local waiting fixture unavailable')
    db.assignments[0].completion_rule = 'streak'
    expect(await readWaitingExamData({ assignmentId: ASSIGNMENT, revision: '3' })).toMatchObject({ ok: false, reason: 'unsupported', message: expect.stringContaining('ยังไม่รองรับ') })
    expect((await api('start', [data.startIntent])).status).toBe(403)
    expect((await api('resume')).status).toBe(403)
    expect((await api('drawNextStreakQuestion', [SUBMISSION])).status).toBe(403)
    expect((await api('start', [data.startIntent], { path: `${BASE}/api?completion_rule=fixed&profileId=legacy` })).status).toBe(403)
    const context = await readSebExamContext()
    if (context.status !== 'valid') throw new Error('Local bound context unavailable')
    const forged = request(`${BASE}/api`, { method: 'POST', headers: { origin: ORIGIN,
      'content-type': 'application/json', 'x-korkru-seb-csrf': getSebExamCsrfToken(context.claims) ?? '' },
    body: JSON.stringify({ operation: 'start', args: [data.startIntent], profileId: 'legacy', completion_rule: 'fixed' }) })
    expect((await dispatch(forged, apiPOST)).status).toBe(400)
    expect((await dispatch(request(`${BASE}/resource?src=${encodeURIComponent(IMAGE)}`), resourceGET)).status).toBe(403)
    expect(await authorizeWaitingObject(context.claims, 'submission', SUBMISSION, { allowExpired: true })).toBeNull()
    expect(db.submissions).toHaveLength(0); expect(db.submission_answers).toHaveLength(0)
    expect(reads.some(read => read.table === 'questions')).toBe(false)
  })
})
