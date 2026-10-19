// Hosted integration checks for this one isolated Staging project only.
// Credentials come from process.env; never persist project keys or sessions.
//
// node scripts/verify-assignment-deadline-staging.mjs --execute \
//   --confirm=assignment-deadline-staging-synthetic [--keep-fixture] \
//   [--fixture-file=/private/tmp/korkru-assignment-deadline-staging-<run>.json]
// Later: the same flags plus --cleanup-fixture=<private manifest>.
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const PROJECT = 'dyuxkrzeveknqgtuzpbh'
const DATABASE_URL = `https://${PROJECT}.supabase.co`
const SITE = 'https://staging.korkru.com'
const MIGRATIONS = '20261019154815,20261019162413'
const KIND = 'assignment-deadline-staging'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LABELS = ['owner', 'foreign', 'student-a', 'student-b']
class VerificationError extends Error {}
const check = (condition, label) => { if (!condition) throw new VerificationError(label) }
const safeCode = error => /^[A-Z0-9]{3,10}$/.test(error?.code ?? '') ? error.code : 'request_failed'
const must = (result, label) => { if (result.error) throw new VerificationError(`${label}: ${safeCode(result.error)}`); return result.data }
const same = (a, b, label) => check(JSON.stringify(a) === JSON.stringify(b), label)
const log = (status, name, counts = {}) => console.log(JSON.stringify({ status, check: name, ...counts }))
const option = (argv, name) => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)))
const equalTime = (a, b) => a === null || b === null ? a === b : Date.parse(a) === Date.parse(b)

export function expectDenial(result, label, expectedCode = '42501') {
  if (result.error?.code === expectedCode) return
  if (!result.error) throw new VerificationError(`${label}: request unexpectedly succeeded`)
  // A failed transport proves neither authorization denial nor an accepted
  // write. Do not echo SDK messages, which can contain request details.
  if (/^(AbortError|TimeoutError)\b/.test(result.error.message ?? '')) {
    throw new VerificationError(`${label}: request aborted or timed out; denial not confirmed`)
  }
  throw new VerificationError(`${label}: expected denial ${expectedCode}, received ${safeCode(result.error)}`)
}

export function createStagingFetch({ fetchImpl = globalThis.fetch, timeoutMs = 30_000, trace } = {}) {
  return async (input, init) => {
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : null
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    check(url.origin === DATABASE_URL && url.protocol === 'https:' && !url.username && !url.password, 'Refusing non-Staging network target')
    const rawMethod = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const method = ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'].includes(rawMethod) ? rawMethod : 'OTHER'
    const pathKind = url.pathname === '/rest/v1/rpc/extend_assignment_deadline' ? 'deadline RPC'
      : url.pathname.startsWith('/rest/v1/rpc/') ? 'database RPC'
        : url.pathname.startsWith('/rest/v1/') ? 'database table'
          : url.pathname.startsWith('/auth/v1/admin/') ? 'Auth administration'
            : url.pathname === '/auth/v1/token' ? 'Auth session'
              : url.pathname === '/auth/v1/user' ? 'Auth identity' : 'Staging endpoint'
    // Keep the timeout signal attached to the returned response as well: native
    // fetch aborts a stalled body read after headers arrive. Never retry a POST.
    const signal = AbortSignal.any([
      AbortSignal.timeout(timeoutMs),
      ...[request?.signal, init?.signal].filter(Boolean),
    ])
    trace?.('START', { method, pathKind })
    try {
      const response = await fetchImpl(input, { ...init, redirect: 'error', signal })
      trace?.('DONE', { method, pathKind, outcome: 'headers_received', httpStatus: response.status })
      return response
    } catch (error) {
      trace?.('DONE', { method, pathKind, outcome: signal.aborted ? 'aborted' : 'failed' })
      throw error
    }
  }
}

export function assertStagingEnvironment(env, argv) {
  check(argv.includes('--execute') && argv.includes('--confirm=assignment-deadline-staging-synthetic'), 'Exact synthetic execution confirmation required')
  check(env.EXAM_QA_ENVIRONMENT === 'staging' && env.KORKRU_DEPLOYMENT_ENV === 'staging' && env.VERCEL_ENV === 'preview', 'Staging-only deployment flags required')
  check(env.NEXT_PUBLIC_SITE_URL === SITE && env.NEXT_PUBLIC_SUPABASE_URL === DATABASE_URL, 'Unexpected Staging project or origin')
  check(env.ASSIGNMENT_DEADLINE_QA_MIGRATIONS_APPLIED === MIGRATIONS, 'Confirm both exact Staging migration versions before running')
  for (const [name, role, opaquePrefix] of [
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon', 'sb_publishable_'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'service_role', 'sb_secret_'],
  ]) {
    const key = env[name] ?? ''
    if (key.startsWith(opaquePrefix) && /^[A-Za-z0-9_-]{20,}$/.test(key.slice(opaquePrefix.length))) continue
    let claims
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')) } catch { throw new VerificationError(`Staging ${role} key required`) }
    check(claims.ref === PROJECT && claims.role === role, `Staging ${role} key project/role mismatch`)
  }
}

export function privateFixturePath(raw) {
  check(typeof raw === 'string' && isAbsolute(raw), 'Fixture path must be absolute')
  const path = resolve(raw)
  check(realpathSync(dirname(path)) === '/private/tmp', 'Fixture must stay directly in the private temporary directory')
  check(/^korkru-assignment-deadline-staging-[A-Za-z0-9-]+\.json$/.test(basename(path)), 'Unexpected private fixture filename')
  return path
}

export function validateFixtureManifest(state) {
  check(state && state.version === 1 && state.kind === KIND && state.projectRef === PROJECT && state.target === SITE && UUID.test(state.run), 'Unexpected cleanup fixture target')
  check(state.prefix === `Deadline QA ${state.run}`, 'Unexpected cleanup fixture run prefix')
  check(Array.isArray(state.accounts) && state.accounts.length <= 4, 'Invalid cleanup fixture accounts')
  check(new Set(state.accounts.map(row => row.id)).size === state.accounts.length
    && new Set(state.accounts.map(row => row.label)).size === state.accounts.length, 'Duplicate cleanup account identity')
  for (const account of state.accounts) {
    check(UUID.test(account.id) && LABELS.includes(account.label)
      && account.role === (account.label.startsWith('student-') ? 'student' : 'teacher')
      && account.email === `deadline-qa-${state.run}-${account.label}@qa.staging.korkru.com`
      && typeof account.password === 'string' && account.password.length >= 16
      && Array.isArray(account.orgIds) && account.orgIds.length <= 1 && account.orgIds.every(value => UUID.test(value)), 'Invalid synthetic cleanup account provenance')
  }
  for (const [name, maximum] of [['classrooms', 3], ['assignments', 2], ['questionIds', 1], ['submissionIds', 2], ['answerIds', 2], ['extensionIds', 3]]) {
    check(Array.isArray(state[name]) && state[name].length <= maximum, 'Invalid cleanup fixture resource bounds')
    const ids = name === 'classrooms' || name === 'assignments' ? state[name].map(row => row.id) : state[name]
    check(ids.every(value => UUID.test(value)) && new Set(ids).size === ids.length, 'Invalid cleanup fixture resource IDs')
  }
  const teachers = new Set(state.accounts.filter(row => row.role === 'teacher').map(row => row.id))
  check([...state.classrooms, ...state.assignments].every(row => teachers.has(row.ownerId) && typeof row.label === 'string'), 'Invalid cleanup fixture resource owners')
  for (const name of ['assignmentId', 'foreignAssignmentId']) check(state[name] === null || UUID.test(state[name]), 'Invalid cleanup fixture assignment ID')
  check(state.assignmentId === null || state.assignments.some(row => row.id === state.assignmentId && row.label === 'shared'), 'Cleanup shared assignment mismatch')
  check(state.foreignAssignmentId === null || state.assignments.some(row => row.id === state.foreignAssignmentId && row.label === 'foreign'), 'Cleanup foreign assignment mismatch')
  return state
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--help')) {
    console.log('Staging only: --execute --confirm=assignment-deadline-staging-synthetic [--check-config|--keep-fixture|--cleanup-fixture=<private manifest>] [--trace-requests]')
    console.log(`Requires exact Staging deployment/site/project flags, Staging anon/service keys in process.env, and ASSIGNMENT_DEADLINE_QA_MIGRATIONS_APPLIED=${MIGRATIONS}. --check-config performs no requests or writes.`)
    return 0
  }
  try { assertStagingEnvironment(env, argv) } catch (error) {
    log('FAIL', 'local Staging configuration fence', { message: error instanceof VerificationError ? error.message : 'Staging configuration invalid' })
    return 1
  }
  if (argv.includes('--check-config')) { log('PASS', 'local Staging configuration fence; no network or mutations'); return 0 }

  const cleanupPath = option(argv, 'cleanup-fixture')
  const keep = argv.includes('--keep-fixture')
  const run = randomUUID()
  let fixturePath
  try { fixturePath = privateFixturePath(cleanupPath ?? option(argv, 'fixture-file') ?? `/private/tmp/korkru-assignment-deadline-staging-${run}.json`) } catch {
    log('FAIL', 'private fixture path validation'); return 1
  }
  const fetchStaging = createStagingFetch({ trace: argv.includes('--trace-requests')
    ? (status, metadata) => log(status, 'Staging request', metadata) : undefined })
  const options = { global: { fetch: fetchStaging }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  const admin = createClient(DATABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
  const browserClient = () => createClient(DATABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options)
  const anonymous = browserClient()
  const clients = new Map()
  let state = {
    version: 1, kind: KIND, projectRef: PROJECT, target: SITE, run, prefix: `Deadline QA ${run}`,
    accounts: [], classrooms: [], assignments: [], assignmentId: null, foreignAssignmentId: null,
    questionIds: [], submissionIds: [], answerIds: [], extensionIds: [],
  }
  let trustedFixture = false, verified = false, keepApproved = false, stage = 'read-only Staging preflight'
  const phase = async (label, work) => {
    const previous = stage
    stage = label; log('START', label)
    const result = await work()
    log('DONE', label); stage = previous
    return result
  }
  const persist = () => {
    if (cleanupPath) return
    const temporary = `${fixturePath}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' })
    renameSync(temporary, fixturePath)
    chmodSync(fixturePath, 0o600)
  }
  const readAssignment = async (assignmentId = state.assignmentId, client = admin, label = 'Read exact synthetic assignment') => must(await client.from('assignments')
    .select('*').eq('id', assignmentId).single(), label)
  const call = (client, row, endAt, expected = row) => client.rpc('extend_assignment_deadline', {
    p_assignment_id: row.id, p_end_at: endAt, p_expected_end_at: expected.end_at, p_expected_updated_at: expected.updated_at,
  })
  const snapshot = async () => {
    const [assignment, foreign, extensions, submissions, answers] = await Promise.all([
      readAssignment(state.assignmentId, admin, 'Read shared synthetic assignment snapshot'),
      readAssignment(state.foreignAssignmentId, admin, 'Read foreign synthetic assignment snapshot'),
      admin.from('assignment_extensions').select('*').in('assignment_id', [state.assignmentId, state.foreignAssignmentId]).order('id'),
      admin.from('submissions').select('*').in('id', state.submissionIds).eq('assignment_id', state.assignmentId).order('id'),
      admin.from('submission_answers').select('*').in('id', state.answerIds).order('id'),
    ])
    return { assignment, foreign, extensions: must(extensions, 'Read synthetic extensions'), submissions: must(submissions, 'Read synthetic attempts'), answers: must(answers, 'Read synthetic answers') }
  }
  async function account(role, label) {
    const email = `deadline-qa-${state.run}-${label}@qa.staging.korkru.com`
    const password = `Qa1!${randomUUID()}Aa9`
    const result = must(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { full_name: `${state.prefix} ${label}`, qa_run: state.run, qa_kind: KIND } }), 'Create synthetic account')
    check(result.user?.id && UUID.test(result.user.id), 'Synthetic account ID unavailable')
    const record = { id: result.user.id, role, label, email, password, orgIds: [], membershipVerified: false }
    state.accounts.push(record); persist()
    const memberships = must(await admin.from('organization_members').select('org_id,org_role').eq('user_id', record.id), 'Read synthetic organization')
    check(memberships.length === 1 && memberships[0].org_role === 'owner', 'Unexpected synthetic organization ownership')
    record.orgIds = memberships.map(row => row.org_id); record.membershipVerified = true; persist()
    const updated = must(await admin.from('users').update({ role, status: 'active', full_name: `${state.prefix} ${label}`,
      survey_role: role, instructor_type: role === 'teacher' ? 'teacher' : null }).eq('id', record.id).select('id'), 'Configure synthetic profile')
    check(updated.length === 1, 'Synthetic profile update count')
    const client = browserClient()
    const login = must(await client.auth.signInWithPassword({ email, password }), 'Authenticate synthetic account')
    check(login.user?.id === record.id && login.session?.access_token, 'Synthetic authenticated identity mismatch')
    clients.set(record.id, client)
    return record
  }
  async function setup() {
    check(!existsSync(fixturePath), 'Refusing to replace existing fixture manifest')
    persist(); trustedFixture = true
    const owner = await account('teacher', 'owner'), foreign = await account('teacher', 'foreign')
    const students = [await account('student', 'student-a'), await account('student', 'student-b')]
    for (const [label, actor] of [['room-a', owner], ['room-b', owner], ['foreign', foreign]]) {
      const row = { id: randomUUID(), ownerId: actor.id, label }; state.classrooms.push(row); persist()
      must(await admin.from('classrooms').insert({ id: row.id, teacher_id: actor.id, org_id: actor.orgIds[0],
        name: `${state.prefix} ${label}`, description: 'Synthetic Staging deadline integration only',
        class_code: randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase(), status: 'active', classroom_type: 'subject' }), 'Create synthetic classroom')
    }
    const sharedRooms = state.classrooms.filter(row => row.ownerId === owner.id)
    must(await admin.from('classroom_students').insert(students.map((student, index) => ({ classroom_id: sharedRooms[index].id, student_id: student.id }))), 'Create two-room synthetic roster')
    const questionId = randomUUID(); state.questionIds.push(questionId); persist()
    must(await admin.from('questions').insert({ id: questionId, created_by: owner.id, org_id: owner.orgIds[0], visibility: 'private',
      // Use an automatic answer component for non-zero score preservation.
      // Essay/file-upload triggers deliberately reset unreviewed scores to zero.
      title: `${state.prefix} question`, question_text: '<p>คำถามสังเคราะห์สำหรับทดสอบขยายเวลา</p>', question_type: 'written', variables: [],
      logic_rules: [], answer_formula: '1', answer_tolerance: 0.01, extra_data: {}, requires_work_image: false, team_edit_allowed: true }), 'Create synthetic question')
    const base = Math.floor(Date.now() / 60_000) * 60_000
    const at = hours => new Date(base + hours * 3_600_000).toISOString()
    state.schedule = { startAt: at(-1), dueAt: at(2), lateAt: at(3), oldEndAt: at(4), legacyEndAt: at(5), newEndAt: at(6), longerEndAt: at(8) }; persist()
    for (const [label, actor, classroom] of [['shared', owner, sharedRooms[0]], ['foreign', foreign, state.classrooms.find(row => row.label === 'foreign')]]) {
      const row = { id: randomUUID(), ownerId: actor.id, label }; state.assignments.push(row)
      state[label === 'shared' ? 'assignmentId' : 'foreignAssignmentId'] = row.id; persist()
      const bands = [
        { id: randomUUID(), starts_at: state.schedule.dueAt, label: 'ส่งช้า', color: 'amber' },
        { id: randomUUID(), starts_at: state.schedule.lateAt, label: 'ส่งช้าระดับสอง', color: 'orange' },
      ]
      must(await admin.from('assignments').insert({ id: row.id, classroom_id: classroom.id, created_by: actor.id, org_id: actor.orgIds[0],
        title: `${state.prefix} ${label}`, type: 'exercise', mode: 'online', status: 'published',
        question_ids: label === 'shared' ? [questionId] : [], question_points: label === 'shared' ? { [questionId]: 1 } : {},
        start_at: state.schedule.startAt, due_at: state.schedule.dueAt, late_bands: bands, end_at: state.schedule.oldEndAt,
        duration_minutes: 120, max_attempts: 3, shuffle_questions: false, shuffle_options: false,
        fullscreen_required: false, proctoring_enabled: false, secure_browser_mode: 'browser', android_exam_mode: 'blocked',
        show_results: 'never', show_solutions: false }), 'Create synthetic finite assignment')
      must(await admin.from('assignment_classrooms').insert((label === 'shared' ? sharedRooms : [classroom])
        .map(room => ({ assignment_id: row.id, classroom_id: room.id }))), 'Attach synthetic assignment rooms')
    }
    const extensionRows = [
      { id: randomUUID(), assignment_id: state.assignmentId, student_id: students[0].id, extended_end_at: state.schedule.legacyEndAt,
        extended_due_at: null, note: 'Synthetic legacy on-time boundary', granted_by: owner.id },
      { id: randomUUID(), assignment_id: state.assignmentId, student_id: students[1].id, extended_end_at: state.schedule.longerEndAt,
        extended_due_at: state.schedule.dueAt, note: 'Synthetic longer extension', granted_by: owner.id },
      { id: randomUUID(), assignment_id: state.foreignAssignmentId, student_id: students[1].id, extended_end_at: state.schedule.legacyEndAt,
        extended_due_at: null, note: 'Synthetic foreign untouched extension', granted_by: foreign.id },
    ]
    state.extensionIds.push(...extensionRows.map(row => row.id)); persist()
    must(await admin.from('assignment_extensions').insert(extensionRows), 'Create synthetic legacy personal overrides')
    for (const [index, student] of students.entries()) {
      const submissionId = randomUUID(); state.submissionIds.push(submissionId); persist()
      must(await admin.from('submissions').insert({ id: submissionId, org_id: owner.orgIds[0], assignment_id: state.assignmentId,
        student_id: student.id, status: 'in_progress', attempt_number: 1, started_at: new Date().toISOString(), max_score: 1, total_score: index === 0 ? 0 : 0.2 }), 'Create synthetic attempt')
      const answerId = randomUUID(); state.answerIds.push(answerId); persist()
      must(await admin.from('submission_answers').insert({ id: answerId, org_id: owner.orgIds[0], submission_id: submissionId,
        question_id: questionId, student_answer: '1', correct_answer: '1', random_values: {}, work_images: [],
        score: index === 0 ? 0.4 : 0.2, max_score: 1, is_correct: null, order_index: 0 }), 'Create synthetic answer')
      if (index === 0) {
        const current = must(await admin.from('submissions').select('answer_revision').eq('id', submissionId).single(), 'Read synthetic attempt revision')
        must(await admin.rpc('claim_submission_close', { p_submission_id: submissionId, p_student_id: student.id, p_expired_only: false, p_expected_revision: current.answer_revision }), 'Close synthetic completed attempt')
        must(await admin.rpc('commit_submission_grade', { p_submission_id: submissionId, p_student_id: student.id,
          p_updates: [{ id: answerId, score: 0.4, is_correct: null }], p_missing_work_evidence: false }), 'Finalize synthetic completed attempt')
      }
    }
    state.classroomHrefs = sharedRooms.map(room => `${SITE}/classrooms/${room.id}?view=scores`)
    state.teacherHref = state.classroomHrefs[0]
    state.teacherAssignmentHref = `${SITE}/assignments/${state.assignmentId}/results`
    state.studentHrefs = state.submissionIds.map(id => `${SITE}/submissions/${id}`)
    persist()
    return { owner, foreign, students }
  }
  async function verify({ owner, foreign, students }) {
    const ownerClient = clients.get(owner.id), foreignClient = clients.get(foreign.id)
    const before = await snapshot()
    check(before.submissions.length === 2 && before.submissions.some(row => row.status === 'submitted' && Number(row.total_score) === 0.4)
      && before.submissions.some(row => row.status === 'in_progress' && Number(row.total_score) === 0.2), 'Synthetic known-score attempt fixture mismatch')
    const result = must(await call(ownerClient, before.assignment, state.schedule.newEndAt), 'Extend whole synthetic assignment')
    check(result && typeof result === 'object' && !Array.isArray(result), 'Deadline RPC did not return a JSON receipt')
    same(Object.keys(result).sort(), ['end_at', 'id', 'updated_at'], 'Deadline JSON receipt has unexpected fields')
    check(result.id === state.assignmentId && equalTime(result.end_at, state.schedule.newEndAt)
      && Number.isFinite(Date.parse(result.updated_at)) && !equalTime(result.updated_at, before.assignment.updated_at), 'Deadline JSON receipt revision/time mismatch')
    const after = await snapshot()
    same(omit(after.assignment, ['end_at', 'updated_at']), omit(before.assignment, ['end_at', 'updated_at']), 'Extension changed due dates, late bands, duration, attempts or other assignment settings')
    same(after.foreign, before.foreign, 'Extension changed foreign assignment')
    same(after.submissions, before.submissions, 'Extension changed grades, timers, progress or completed attempts')
    same(after.answers, before.answers, 'Extension changed answers or scores')
    check(equalTime(after.assignment.end_at, state.schedule.newEndAt), 'Global close did not change')
    const legacy = after.extensions.find(row => row.id === state.extensionIds[0])
    const oldLegacy = before.extensions.find(row => row.id === state.extensionIds[0])
    check(equalTime(legacy.extended_end_at, state.schedule.newEndAt) && equalTime(legacy.extended_due_at, oldLegacy.extended_end_at), 'Legacy close/on-time boundary was not preserved')
    same(omit(legacy, ['extended_end_at', 'extended_due_at']), omit(oldLegacy, ['extended_end_at', 'extended_due_at']), 'Legacy extension metadata changed')
    for (const id of state.extensionIds.slice(1)) same(after.extensions.find(row => row.id === id), before.extensions.find(row => row.id === id), 'Longer or foreign personal extension changed')
    const ownerRow = await readAssignment(state.assignmentId, ownerClient, 'Read authenticated synthetic owner deadline')
    check(equalTime(ownerRow.end_at, state.schedule.newEndAt) && equalTime(ownerRow.due_at, state.schedule.dueAt), 'Owner session did not observe the shared deadline')
    const sharedRooms = state.classrooms.filter(row => row.ownerId === owner.id)
    const links = must(await admin.from('assignment_classrooms').select('assignment_id,classroom_id')
      .eq('assignment_id', state.assignmentId).order('classroom_id'), 'Read exact synthetic shared classroom links')
    same(links.map(row => row.classroom_id).sort(), sharedRooms.map(row => row.id).sort(), 'Shared assignment classroom links differ from fixture')
    for (const [index, student] of students.entries()) {
      const client = clients.get(student.id), classroomId = sharedRooms[index].id
      const identity = must(await client.auth.getUser(), 'Verify authenticated synthetic learner identity')
      check(identity.user?.id === student.id, 'Synthetic learner session identity differs from roster')
      const profile = must(await client.from('users').select('id,role,status').eq('id', student.id).single(), 'Read synthetic learner own profile')
      check(profile.id === student.id && profile.role === 'student' && profile.status === 'active', 'Synthetic learner profile is not an active student')
      const roster = must(await client.from('classroom_students').select('classroom_id,student_id')
        .eq('classroom_id', classroomId).eq('student_id', student.id), 'Read synthetic learner exact roster membership')
      check(roster.length === 1 && roster[0].student_id === student.id && roster[0].classroom_id === classroomId, 'Synthetic learner is not on the exact shared classroom roster')
      const room = must(await admin.from('classrooms').select('id,status').eq('id', classroomId).single(), 'Read synthetic active classroom')
      check(room.status === 'active', 'Synthetic shared classroom is not active')
      const ownLinks = must(await client.from('assignment_classrooms').select('assignment_id,classroom_id')
        .eq('assignment_id', state.assignmentId).eq('classroom_id', classroomId), 'Read synthetic learner exact assignment link')
      check(ownLinks.length === 1 && ownLinks[0].assignment_id === state.assignmentId, 'Synthetic learner assignment link unavailable')
      // Direct student assignment SELECT is intentionally denied: legacy rows
      // contain access_code. The application uses an authorized server DTO.
      const rawRead = await client.from('assignments').select('id').eq('id', state.assignmentId)
      check(rawRead.error?.code === '42501' || (!rawRead.error && rawRead.data?.length === 0), 'Student gained direct assignment-table access')
      const safeRow = must(await admin.from('assignments').select('id,end_at,due_at').eq('id', ownLinks[0].assignment_id).single(), 'Read safe deadline projection for exact learner classroom link')
      check(safeRow.id === state.assignmentId && equalTime(safeRow.end_at, state.schedule.newEndAt)
        && equalTime(safeRow.due_at, state.schedule.dueAt), 'Linked classroom safe deadline projection differs')
    }
    log('PASS', 'whole-assignment JSON receipt, two-room learner scope, safe table denial, legacy boundaries and unchanged grades/timers', { linkedClassrooms: 2, syntheticStudents: 2 })

    await phase('stale CAS rejection and persisted-state verification', async () => {
      expectDenial(await call(ownerClient, before.assignment, new Date(Date.parse(state.schedule.newEndAt) + 3_600_000).toISOString()), 'Stale deadline save denial', 'PT409')
      same(await snapshot(), after, 'Stale deadline save changed persisted state')
    })
    await phase('forbidden actor RPC denials and persisted-state verification', async () => {
      for (const actor of [foreign, ...students]) expectDenial(await call(clients.get(actor.id), after.assignment, state.schedule.longerEndAt), 'Unrelated teacher or student deadline denial')
      expectDenial(await call(ownerClient, before.foreign, state.schedule.newEndAt), 'Foreign assignment deadline denial')
      same(await snapshot(), after, 'Denied actor changed persisted state')
    })
    log('PASS', 'stale CAS rollback and exact teacher/student cross-assignment permission matrix')

    for (const endAt of [after.assignment.end_at, '2000-01-01T00:00:00Z', 'infinity', null]) {
      expectDenial(await call(ownerClient, after.assignment, endAt), 'Invalid deadline denial', '22023')
    }
    const invalidFormat = await call(ownerClient, after.assignment, 'not-a-date')
    check(['22007', '22008'].includes(invalidFormat.error?.code), 'Invalid timestamp format accepted')
    same(await snapshot(), after, 'Invalid deadline changed persisted state')
    must(await admin.from('assignments').update({ end_at: null, due_at: null, late_bands: [] }).eq('id', state.foreignAssignmentId).eq('created_by', foreign.id), 'Configure synthetic unlimited assignment')
    let foreignRow = await readAssignment(state.foreignAssignmentId)
    expectDenial(await call(foreignClient, foreignRow, state.schedule.newEndAt), 'Unlimited assignment deadline denial', '22023')
    must(await admin.from('assignments').update({ end_at: state.schedule.oldEndAt, status: 'closed' }).eq('id', state.foreignAssignmentId).eq('created_by', foreign.id), 'Configure synthetic closed assignment')
    foreignRow = await readAssignment(state.foreignAssignmentId)
    expectDenial(await call(foreignClient, foreignRow, state.schedule.newEndAt), 'Closed assignment deadline denial', '22023')
    check((await readAssignment(state.foreignAssignmentId)).status === 'closed', 'Rejected closed assignment changed publication status')
    must(await admin.from('assignments').update({ status: 'published', due_at: before.foreign.due_at, late_bands: before.foreign.late_bands })
      .eq('id', state.foreignAssignmentId).eq('created_by', foreign.id), 'Restore synthetic foreign assignment')
    log('PASS', 'invalid timestamp, unlimited schedule and closed assignment rejections')

    const delayedEnd = new Date(Date.parse(state.schedule.legacyEndAt) + 30 * 60_000).toISOString()
    const delayed = must(await ownerClient.from('assignment_extensions').update({ extended_end_at: delayedEnd, extended_due_at: null })
      .eq('id', state.extensionIds[0]).eq('assignment_id', state.assignmentId).select('*').single(), 'Write delayed synthetic legacy client extension')
    check(equalTime(delayed.extended_end_at, state.schedule.newEndAt) && equalTime(delayed.extended_due_at, delayedEnd), 'Delayed legacy client shortened global close or lost its due meaning')
    const final = await snapshot()
    same(final.assignment, after.assignment, 'Legacy write changed global assignment settings')
    same(final.submissions, before.submissions, 'Legacy write changed scores or attempt timers')
    same(final.answers, before.answers, 'Legacy write changed synthetic answers')
    state.verifiedEndAt = final.assignment.end_at; state.verifiedUpdatedAt = final.assignment.updated_at; persist()
    log('PASS', 'delayed legacy personal write floor and preserved completed/in-progress attempts')
  }
  async function validateOwnedRows() {
    const accountIds = new Set(state.accounts.map(row => row.id))
    for (const account of state.accounts) {
      const lookup = await admin.auth.admin.getUserById(account.id)
      check(!lookup.error || lookup.error.status === 404, 'Cleanup synthetic Auth lookup failed')
      if (lookup.data.user) check(lookup.data.user.user_metadata?.qa_run === state.run
        && lookup.data.user.user_metadata?.qa_kind === KIND && lookup.data.user.email === account.email, 'Cleanup synthetic Auth provenance mismatch')
    }
    for (const record of state.assignments) {
      const rows = must(await admin.from('assignments').select('id,created_by,title,org_id').eq('id', record.id), 'Cleanup assignment ownership lookup')
      const actor = state.accounts.find(row => row.id === record.ownerId)
      check(rows.every(row => row.created_by === record.ownerId && row.title === `${state.prefix} ${record.label}` && actor.orgIds.includes(row.org_id)), 'Cleanup assignment provenance mismatch')
      const attempts = must(await admin.from('submissions').select('id,student_id').eq('assignment_id', record.id), 'Cleanup synthetic attempt ownership lookup')
      check(attempts.every(row => state.submissionIds.includes(row.id) && accountIds.has(row.student_id)), 'Cleanup refuses unexpected learner data')
    }
    for (const record of state.classrooms) {
      const rows = must(await admin.from('classrooms').select('id,teacher_id,name,org_id').eq('id', record.id), 'Cleanup classroom ownership lookup')
      const actor = state.accounts.find(row => row.id === record.ownerId)
      check(rows.every(row => row.teacher_id === record.ownerId && row.name === `${state.prefix} ${record.label}` && actor.orgIds.includes(row.org_id)), 'Cleanup classroom provenance mismatch')
      const roster = must(await admin.from('classroom_students').select('student_id').eq('classroom_id', record.id), 'Cleanup classroom roster lookup')
      check(roster.every(row => accountIds.has(row.student_id)), 'Cleanup refuses unexpected classroom members')
    }
    const owner = state.accounts.find(row => row.label === 'owner')
    for (const id of state.questionIds) {
      const rows = must(await admin.from('questions').select('id,created_by,title,org_id').eq('id', id), 'Cleanup question ownership lookup')
      check(rows.every(row => row.created_by === owner?.id && row.title === `${state.prefix} question` && owner.orgIds.includes(row.org_id)), 'Cleanup question provenance mismatch')
    }
  }
  async function cleanup() {
    if (!trustedFixture) return true
    try { validateFixtureManifest(state); await validateOwnedRows() } catch { return false }
    // Revoke every synthetic login before deleting any run-owned data.
    try {
      for (const account of state.accounts) {
        const lookup = await admin.auth.admin.getUserById(account.id)
        if (!lookup.data.user) continue
        const client = clients.get(account.id) ?? browserClient()
        const login = must(await client.auth.signInWithPassword({ email: account.email, password: account.password }), 'Authenticate exact synthetic cleanup account')
        check(login.user?.id === account.id && login.session?.access_token, 'Cleanup synthetic authenticated identity mismatch')
        must(await admin.auth.admin.signOut(login.session.access_token, 'global'), 'Revoke synthetic sessions')
        await client.auth.signOut().catch(() => undefined)
      }
    } catch { return false }
    let clean = true
    const attempt = async work => { try { await work() } catch { clean = false } }
    for (const row of state.assignments) await attempt(async () => {
      must(await admin.from('assignments').delete().eq('id', row.id).eq('created_by', row.ownerId).eq('title', `${state.prefix} ${row.label}`), 'Cleanup owned assignment')
    })
    const owner = state.accounts.find(row => row.label === 'owner')
    for (const id of state.questionIds) if (owner) await attempt(async () => {
      must(await admin.from('questions').delete().eq('id', id).eq('created_by', owner.id).eq('title', `${state.prefix} question`), 'Cleanup owned question')
    })
    for (const row of state.classrooms) await attempt(async () => {
      must(await admin.from('classrooms').delete().eq('id', row.id).eq('teacher_id', row.ownerId).eq('name', `${state.prefix} ${row.label}`), 'Cleanup owned classroom')
    })
    // If a data deletion failed, retain all Auth owners and the recovery file.
    if (!clean) return false
    for (const account of [...state.accounts].reverse()) await attempt(async () => {
      check(account.membershipVerified, 'Cleanup synthetic organization was not verified')
      for (const orgId of account.orgIds) {
        const members = must(await admin.from('organization_members').select('user_id,org_role').eq('org_id', orgId), 'Cleanup synthetic organization members')
        if (members.length === 0) {
          const rows = must(await admin.from('organizations').select('id').eq('id', orgId), 'Cleanup existing synthetic organization')
          if (rows.length === 0) continue
        }
        check(members.length === 1 && members[0].user_id === account.id && members[0].org_role === 'owner', 'Cleanup refuses shared organization')
        for (const table of ['classrooms', 'assignments', 'questions']) {
          const remaining = must(await admin.from(table).select('id').eq('org_id', orgId).limit(1), 'Cleanup synthetic organization remaining resources')
          check(remaining.length === 0, 'Cleanup refuses organization containing unowned resources')
        }
        must(await admin.from('organizations').delete().eq('id', orgId), 'Cleanup synthetic personal organization')
      }
      const lookup = await admin.auth.admin.getUserById(account.id)
      check(!lookup.error || lookup.error.status === 404, 'Cleanup synthetic Auth lookup failed')
      if (lookup.data.user) {
        check(lookup.data.user.user_metadata?.qa_run === state.run && lookup.data.user.user_metadata?.qa_kind === KIND, 'Cleanup synthetic Auth ownership mismatch')
        must(await admin.auth.admin.deleteUser(account.id), 'Cleanup synthetic Auth account')
      }
    })
    if (clean && existsSync(fixturePath)) unlinkSync(fixturePath)
    return clean
  }

  try {
    if (cleanupPath) {
      const stat = lstatSync(fixturePath)
      check(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 && stat.size <= 128_000, 'Cleanup requires a private regular fixture file')
      state = validateFixtureManifest(JSON.parse(readFileSync(fixturePath, 'utf8')))
      trustedFixture = true
      verified = true
    } else {
      // Limit zero reads reveal only schema; both grant probes are denied before
      // fixture creation and reject a missing RPC as PGRST202 instead of passing.
      for (const [table, columns] of [
        ['assignments', 'id,due_at,late_bands,end_at,updated_at'],
        ['assignment_extensions', 'id,assignment_id,extended_end_at,extended_due_at'],
        ['submissions', 'id,answer_revision,closed_at,close_reason'],
      ]) must(await admin.from(table).select(columns).limit(0), 'Required Staging migration schema unavailable')
      const probe = { id: randomUUID(), end_at: null, updated_at: new Date().toISOString() }
      for (const client of [anonymous, admin]) expectDenial(await call(client, probe, new Date(Date.now() + 3_600_000).toISOString()), 'Authenticated-only deadline RPC preflight')
      log('PASS', 'read-only Staging schema and exact RPC permission preflight')
      stage = 'synthetic fixture setup'
      const fixture = await setup()
      stage = 'assignment deadline integration checks'
      await verify(fixture)
      verified = true; keepApproved = keep
    }
    log('PASS', cleanupPath ? 'cleanup fixture validation' : 'complete isolated Staging assignment deadline gate', { syntheticTeachers: 2, syntheticStudents: 2 })
  } catch (error) {
    log('FAIL', stage, { message: error instanceof VerificationError ? error.message : 'Unexpected Staging verification failure' })
  } finally {
    if (verified && keepApproved) {
      log('DEFERRED_FOR_BROWSER', 'private mode-0600 fixture retained', { fixturePath, syntheticAccounts: state.accounts.length })
      return 0
    }
    const clean = await cleanup()
    log(clean ? 'PASS' : 'FAIL', 'exact owned fixture cleanup', { syntheticAccounts: state.accounts.length })
    if (!clean) log('CLEANUP_REQUIRED', 'private fixture retained for exact retry', { fixturePath })
    return verified && clean ? 0 : 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main()
