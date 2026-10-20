// Synthetic browser-fixture harness for this one isolated Staging project.
// This script never sends reminders: the operator clicks the real teacher UI.
// Project keys/session tokens stay in memory; only synthetic fixture account
// credentials and exact run-owned IDs go into the private mode-0600 manifest.
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createStagingFetch } from './verify-assignment-deadline-staging.mjs'

export { createStagingFetch }
const PROJECT = 'dyuxkrzeveknqgtuzpbh'
const DATABASE_URL = `https://${PROJECT}.supabase.co`
const SITE = 'https://staging.korkru.com'
const KIND = 'assignment-reminders-staging'
const LABELS = ['owner', 'never-started', 'in-progress', 'submitted', 'graded']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SUBMISSION_COLUMNS = 'id,assignment_id,student_id,status,total_score,max_score,attempt_number,answer_revision,started_at,submitted_at,closed_at'
const ANSWER_COLUMNS = 'id,submission_id,question_id,score,max_score,is_correct,answer_score,answer_max_score,work_score,work_max_score,answer_reviewed_at,work_reviewed_at,score_edited_by,score_edited_at'
class VerificationError extends Error {}
const check = (condition, label) => { if (!condition) throw new VerificationError(label) }
const safeCode = error => /^[A-Z0-9]{3,10}$/.test(error?.code ?? '') ? error.code : 'request_failed'
const must = (result, label) => { if (result.error) throw new VerificationError(`${label}: ${safeCode(result.error)}`); return result.data }
const same = (left, right, label) => check(JSON.stringify(left) === JSON.stringify(right), label)
const log = (status, name, counts = {}) => console.log(JSON.stringify({ status, check: name, ...counts }))
const option = (argv, name) => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)

export function buildReminderAssignmentSchedule(now, bandId) {
  const dueAt = new Date(now + 86_400_000).toISOString()
  return {
    start_at: new Date(now - 3_600_000).toISOString(),
    due_at: dueAt,
    end_at: new Date(now + 172_800_000).toISOString(),
    late_bands: [{ id: bandId, starts_at: dueAt, label: 'ส่งช้า', color: 'amber' }],
  }
}

export function assertStagingEnvironment(env, argv) {
  check(argv.includes('--execute') && argv.includes('--confirm=assignment-reminders-staging-synthetic'), 'Exact synthetic execution confirmation required')
  check(env.EXAM_QA_ENVIRONMENT === 'staging' && env.KORKRU_DEPLOYMENT_ENV === 'staging' && env.VERCEL_ENV === 'preview', 'Staging-only deployment flags required')
  check(env.NEXT_PUBLIC_SITE_URL === SITE && env.NEXT_PUBLIC_SUPABASE_URL === DATABASE_URL, 'Unexpected Staging project or origin')
  for (const [name, role, prefix] of [['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon', 'sb_publishable_'], ['SUPABASE_SERVICE_ROLE_KEY', 'service_role', 'sb_secret_']]) {
    const key = env[name] ?? ''
    if (key.startsWith(prefix) && /^[A-Za-z0-9_-]{20,}$/.test(key.slice(prefix.length))) continue
    let claims
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')) } catch { throw new VerificationError(`Staging ${role} key required`) }
    check(claims.ref === PROJECT && claims.role === role, `Staging ${role} key project/role mismatch`)
  }
}

export function parseRunMode(argv) {
  const modes = [argv.includes('--create-fixture'), argv.includes('--verify-notifications'), option(argv, 'cleanup-fixture') !== undefined]
  check(modes.filter(Boolean).length === 1, 'Choose exactly one fixture create, notification verification or cleanup mode')
  const mode = modes[0] ? 'create' : modes[1] ? 'verify' : 'cleanup'
  check(!argv.includes('--keep-fixture') || mode === 'create', 'Keep-fixture applies only to fixture creation')
  check(mode !== 'verify' || option(argv, 'fixture-file'), 'Notification verification requires the exact private fixture file')
  const count = option(argv, 'expected-read-count')
  check(count === undefined || (mode === 'verify' && /^(0|1|2)$/.test(count)), 'Expected read count must be 0, 1 or 2 in verification mode')
  return { mode, expectedReadCount: count === undefined ? null : Number(count) }
}

export function privateFixturePath(raw) {
  check(typeof raw === 'string' && isAbsolute(raw), 'Fixture path must be absolute')
  const path = resolve(raw)
  check(realpathSync(dirname(path)) === '/private/tmp', 'Fixture must stay directly in the private temporary directory')
  check(/^korkru-assignment-reminders-staging-[A-Za-z0-9-]+\.json$/.test(basename(path)), 'Unexpected private fixture filename')
  return path
}

export function validateFixtureManifest(state) {
  check(state && state.version === 1 && state.kind === KIND && state.projectRef === PROJECT && state.target === SITE && UUID.test(state.run), 'Unexpected fixture target')
  check(state.prefix === `Reminder QA ${state.run}`, 'Unexpected fixture run prefix')
  check(Array.isArray(state.accounts) && state.accounts.length <= 5, 'Invalid fixture account bounds')
  check(new Set(state.accounts.map(row => row.id)).size === state.accounts.length
    && new Set(state.accounts.map(row => row.label)).size === state.accounts.length, 'Duplicate fixture account identity')
  for (const row of state.accounts) {
    check(UUID.test(row.id) && LABELS.includes(row.label) && row.role === (row.label === 'owner' ? 'teacher' : 'student')
      && row.email === `reminder-qa-${state.run}-${row.label}@qa.staging.korkru.com`
      && typeof row.password === 'string' && row.password.length >= 16
      && Array.isArray(row.orgIds) && row.orgIds.length <= 1 && row.orgIds.every(id => UUID.test(id))
      && typeof row.membershipVerified === 'boolean' && (!row.membershipVerified || row.orgIds.length === 1), 'Invalid synthetic fixture account provenance')
  }
  for (const name of ['classroomId', 'assignmentId', 'questionId']) check(state[name] === null || UUID.test(state[name]), 'Invalid fixture resource ID')
  check(Array.isArray(state.submissions) && state.submissions.length <= 3, 'Invalid fixture attempt bounds')
  check(new Set(state.submissions.map(row => row.id)).size === state.submissions.length
    && new Set(state.submissions.map(row => row.answerId)).size === state.submissions.length
    && new Set(state.submissions.map(row => row.studentId)).size === state.submissions.length, 'Duplicate fixture attempt identity')
  for (const row of state.submissions) check(UUID.test(row.id) && UUID.test(row.answerId)
    && ['in-progress', 'submitted', 'graded'].includes(row.label)
    && state.accounts.some(account => account.id === row.studentId && account.label === row.label && account.role === 'student'), 'Invalid fixture attempt provenance')
  check(![state.classroomId, state.assignmentId, state.questionId].some(Boolean)
    || state.accounts.some(row => row.label === 'owner'), 'Fixture resource owner unavailable')
  return state
}

export function verifyReminderRows(state, rows, expectedReadCount = null) {
  validateFixtureManifest(state)
  check(state.accounts.length === 5 && state.classroomId && state.assignmentId, 'Complete synthetic fixture required')
  const owner = state.accounts.find(row => row.label === 'owner')
  const expected = state.accounts.filter(row => ['never-started', 'in-progress'].includes(row.label)).map(row => row.id).sort()
  check(Array.isArray(rows) && rows.length === 2 && new Set(rows.map(row => row.id)).size === 2, 'Expected exactly two owned assignment reminders')
  same(rows.map(row => row.recipient_id).sort(), expected, 'Reminder recipients differ from unsubmitted synthetic learners')
  for (const row of rows) check(UUID.test(row.id) && row.type === 'assignment_reminder' && row.actor_id === owner.id
    && row.org_id === owner.orgIds[0] && row.related_assignment_id === state.assignmentId && row.related_classroom_id === state.classroomId
    && row.link === `/assignments/${state.assignmentId}/take`
    && typeof row.title === 'string' && row.title.length > 0 && typeof row.body === 'string' && row.body.length > 0
    && typeof row.is_read === 'boolean', 'Reminder content or ownership contract mismatch')
  const read = rows.filter(row => row.is_read).length
  if (expectedReadCount !== null) check(read === expectedReadCount, 'Reminder read count differs from expected acknowledgement state')
  return { reminders: rows.length, recipients: expected.length, read, unread: rows.length - read }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--help')) {
    console.log('Staging only: --execute --confirm=assignment-reminders-staging-synthetic --create-fixture [--keep-fixture] --fixture-file=/private/tmp/korkru-assignment-reminders-staging-<run>.json')
    console.log('Later: same safety flags plus --verify-notifications --fixture-file=<manifest> [--expected-read-count=0|1|2], or --cleanup-fixture=<manifest>. --check-config performs no requests. --trace-requests logs sanitized request classifications only.')
    return 0
  }
  let mode, expectedReadCount
  try {
    assertStagingEnvironment(env, argv)
    if (argv.includes('--check-config')) { log('PASS', 'local Staging configuration fence; no network or mutations'); return 0 }
    ;({ mode, expectedReadCount } = parseRunMode(argv))
  } catch (error) {
    log('FAIL', 'local Staging configuration fence', { message: error instanceof VerificationError ? error.message : 'Staging configuration invalid' }); return 1
  }
  const run = randomUUID()
  let fixturePath
  try { fixturePath = privateFixturePath(option(argv, 'cleanup-fixture') ?? option(argv, 'fixture-file') ?? `/private/tmp/korkru-assignment-reminders-staging-${run}.json`) } catch {
    log('FAIL', 'private fixture path validation'); return 1
  }
  const fetchStaging = createStagingFetch({ trace: argv.includes('--trace-requests') ? (status, metadata) => log(status, 'Staging request', metadata) : undefined })
  const options = { global: { fetch: fetchStaging }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  const admin = createClient(DATABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
  const browserClient = () => createClient(DATABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options)
  let state = { version: 1, kind: KIND, projectRef: PROJECT, target: SITE, run, prefix: `Reminder QA ${run}`,
    accounts: [], classroomId: null, assignmentId: null, questionId: null, submissions: [], baseline: null }
  let trusted = false, success = false, stage = 'read-only Staging preflight'
  const persist = () => {
    const temporary = `${fixturePath}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' })
    renameSync(temporary, fixturePath); chmodSync(fixturePath, 0o600)
  }
  const snapshot = async () => {
    const [submissions, answers] = await Promise.all([
      admin.from('submissions').select(SUBMISSION_COLUMNS).eq('assignment_id', state.assignmentId).order('id'),
      admin.from('submission_answers').select(ANSWER_COLUMNS).in('submission_id', state.submissions.map(row => row.id)).order('id'),
    ])
    return { submissions: must(submissions, 'Read exact synthetic attempt metadata'), answers: must(answers, 'Read exact synthetic score metadata') }
  }
  async function account(label) {
    const role = label === 'owner' ? 'teacher' : 'student'
    const email = `reminder-qa-${state.run}-${label}@qa.staging.korkru.com`, password = `Qa1!${randomUUID()}Aa9`
    const result = must(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { full_name: `${state.prefix} ${label}`, qa_run: state.run, qa_kind: KIND } }), 'Create synthetic account')
    check(result.user?.id && UUID.test(result.user.id), 'Synthetic account ID unavailable')
    const record = { id: result.user.id, role, label, email, password, orgIds: [], membershipVerified: false }
    state.accounts.push(record); persist()
    const members = must(await admin.from('organization_members').select('org_id,org_role').eq('user_id', record.id), 'Read synthetic personal organization')
    check(members.length === 1 && members[0].org_role === 'owner', 'Unexpected synthetic organization ownership')
    record.orgIds = members.map(row => row.org_id); record.membershipVerified = true; persist()
    const updated = must(await admin.from('users').update({ role, status: 'active', full_name: `${state.prefix} ${label}`,
      survey_role: role, instructor_type: role === 'teacher' ? 'teacher' : null }).eq('id', record.id).select('id'), 'Configure synthetic profile')
    check(updated.length === 1, 'Synthetic profile update count')
    return record
  }
  async function setup() {
    check(!existsSync(fixturePath), 'Refusing to replace existing fixture manifest')
    persist(); trusted = true
    for (const label of LABELS) await account(label)
    const owner = state.accounts.find(row => row.label === 'owner')
    state.classroomId = randomUUID(); persist()
    must(await admin.from('classrooms').insert({ id: state.classroomId, teacher_id: owner.id, org_id: owner.orgIds[0],
      name: `${state.prefix} classroom`, description: 'Synthetic Staging reminder verification only',
      class_code: randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase(), status: 'active', classroom_type: 'subject' }), 'Create synthetic classroom')
    must(await admin.from('classroom_students').insert(state.accounts.filter(row => row.role === 'student')
      .map(row => ({ classroom_id: state.classroomId, student_id: row.id }))), 'Create synthetic four-student roster')
    state.questionId = randomUUID(); persist()
    must(await admin.from('questions').insert({ id: state.questionId, created_by: owner.id, org_id: owner.orgIds[0], visibility: 'private',
      title: `${state.prefix} question`, question_text: '<p>คำถามสังเคราะห์สำหรับทดสอบการเตือนส่งงาน</p>', question_type: 'written',
      variables: [], logic_rules: [], answer_formula: '1', answer_tolerance: 0.01, extra_data: {}, requires_work_image: true, team_edit_allowed: true }), 'Create synthetic automatic question')
    state.assignmentId = randomUUID(); persist()
    const schedule = buildReminderAssignmentSchedule(Date.now(), randomUUID())
    must(await admin.from('assignments').insert({ id: state.assignmentId, classroom_id: state.classroomId, created_by: owner.id, org_id: owner.orgIds[0],
      title: `${state.prefix} exercise`, type: 'exercise', mode: 'online', status: 'published', question_ids: [state.questionId], question_points: { [state.questionId]: 2 },
      ...schedule,
      require_work_image: true, duration_minutes: null, max_attempts: 3, score_strategy: 'best', shuffle_questions: false, shuffle_options: false,
      fullscreen_required: false, proctoring_enabled: false, secure_browser_mode: 'browser', android_exam_mode: 'blocked', show_results: 'never', show_solutions: false }), 'Create synthetic published exercise')
    must(await admin.from('assignment_classrooms').insert({ assignment_id: state.assignmentId, classroom_id: state.classroomId }), 'Attach synthetic exercise')
    must(await admin.rpc('configure_assignment_question_grading_parts', { p_actor_id: owner.id, p_assignment_id: state.assignmentId,
      p_question_id: state.questionId, p_answer_max_score: 1, p_work_max_score: 1, p_expected_updated_at: null }), 'Configure synthetic split-score fixture')
    for (const label of ['in-progress', 'submitted', 'graded']) {
      const student = state.accounts.find(row => row.label === label)
      const record = { id: randomUUID(), answerId: randomUUID(), studentId: student.id, label }
      state.submissions.push(record); persist()
      must(await admin.from('submissions').insert({ id: record.id, org_id: owner.orgIds[0], assignment_id: state.assignmentId,
        student_id: student.id, status: 'in_progress', attempt_number: 1, started_at: new Date().toISOString(), max_score: 2,
        total_score: label === 'in-progress' ? 0.2 : 0 }), 'Create synthetic active attempt')
      const rawScore = label === 'submitted' ? 1.2 : label === 'graded' ? 1.6 : 0.4
      must(await admin.from('submission_answers').insert({ id: record.answerId, org_id: owner.orgIds[0], submission_id: record.id,
        question_id: state.questionId, student_answer: '1', correct_answer: '1', random_values: {}, work_images: [],
        score: rawScore, max_score: 2, is_correct: true, order_index: 0 }), 'Create synthetic answer')
      if (label === 'in-progress') continue
      const current = must(await admin.from('submissions').select('answer_revision').eq('id', record.id).single(), 'Read synthetic answer revision')
      must(await admin.rpc('claim_submission_close', { p_submission_id: record.id, p_student_id: student.id,
        p_expired_only: false, p_expected_revision: current.answer_revision }), 'Close synthetic completed attempt')
      must(await admin.rpc('commit_submission_grade', { p_submission_id: record.id, p_student_id: student.id,
        p_updates: [{ id: record.answerId, score: rawScore, is_correct: true }], p_missing_work_evidence: true }), 'Finalize synthetic completed attempt')
      if (label === 'graded') {
        const answer = must(await admin.from('submission_answers').select('score_edited_at').eq('id', record.answerId).single(), 'Read exact synthetic grade revision')
        must(await admin.rpc('save_grading_review', { p_actor_id: owner.id, p_assignment_id: state.assignmentId, p_answer_id: record.answerId,
          p_expected_score_edited_at: answer.score_edited_at, p_answer_score: null, p_work_score: 0, p_update_answer: false, p_update_work: true }), 'Finish synthetic work review with explicit zero')
      }
    }
    state.baseline = await snapshot()
    const expected = { 'in-progress': ['in_progress', 0.2], submitted: ['submitted', 0.6], graded: ['graded', 0.8] }
    check(state.baseline.submissions.length === 3 && state.baseline.answers.length === 3, 'Synthetic attempt fixture count mismatch')
    for (const record of state.submissions) {
      const row = state.baseline.submissions.find(item => item.id === record.id)
      check(row?.status === expected[record.label][0] && Number(row.total_score) === expected[record.label][1]
        && Number(row.max_score) === 2, 'Synthetic completed/in-progress score or status mismatch')
    }
    const notifications = must(await admin.from('notifications').select('id').eq('related_assignment_id', state.assignmentId), 'Read empty synthetic reminder baseline')
    check(notifications.length === 0, 'Synthetic fixture already contains notifications')
    state.teacherHref = `${SITE}/classrooms/${state.classroomId}?view=scores`
    state.studentHref = `${SITE}/dashboard`
    state.studentAssignmentHref = `${SITE}/assignments/${state.assignmentId}/take`
    persist()
  }
  async function validateOwnedRows() {
    const owner = state.accounts.find(row => row.label === 'owner')
    const accountIds = new Set(state.accounts.map(row => row.id))
    for (const account of state.accounts) {
      const lookup = await admin.auth.admin.getUserById(account.id)
      check(!lookup.error || lookup.error.status === 404, 'Synthetic Auth provenance lookup failed')
      if (lookup.data.user) check(lookup.data.user.user_metadata?.qa_run === state.run && lookup.data.user.user_metadata?.qa_kind === KIND
        && lookup.data.user.email === account.email, 'Synthetic Auth provenance mismatch')
    }
    for (const [table, id, ownerColumn, titleColumn, suffix] of [
      ['assignments', state.assignmentId, 'created_by', 'title', 'exercise'],
      ['classrooms', state.classroomId, 'teacher_id', 'name', 'classroom'],
      ['questions', state.questionId, 'created_by', 'title', 'question'],
    ]) if (id) {
      const rows = must(await admin.from(table).select(`id,${ownerColumn},${titleColumn},org_id`).eq('id', id), 'Synthetic resource ownership lookup')
      check(rows.every(row => row[ownerColumn] === owner?.id && row[titleColumn] === `${state.prefix} ${suffix}`
        && owner.orgIds.includes(row.org_id)), 'Synthetic resource provenance mismatch')
    }
    if (state.classroomId) {
      const roster = must(await admin.from('classroom_students').select('student_id').eq('classroom_id', state.classroomId), 'Synthetic roster ownership lookup')
      check(roster.every(row => accountIds.has(row.student_id)), 'Refusing fixture with unexpected classroom members')
    }
    if (state.assignmentId) {
      const attempts = must(await admin.from('submissions').select('id,student_id').eq('assignment_id', state.assignmentId), 'Synthetic attempt ownership lookup')
      check(attempts.every(row => state.submissions.some(item => item.id === row.id && item.studentId === row.student_id)), 'Refusing fixture with unexpected learner attempts')
      const links = must(await admin.from('assignment_classrooms').select('classroom_id').eq('assignment_id', state.assignmentId), 'Synthetic assignment link lookup')
      check(links.every(row => row.classroom_id === state.classroomId), 'Refusing fixture with unexpected linked classrooms')
    }
  }
  async function cleanup() {
    if (!trusted) return true
    try {
      validateFixtureManifest(state)
      for (const account of state.accounts.filter(row => !row.membershipVerified)) {
        // Auth provisioning may have committed its personal organization even
        // when the following setup read failed. Recover only this exact run's
        // verified identity and exclusive owner receipt before any deletion.
        const lookup = must(await admin.auth.admin.getUserById(account.id), 'Read partial synthetic Auth provenance')
        check(lookup.user?.id === account.id && lookup.user.email === account.email
          && lookup.user.user_metadata?.qa_run === state.run && lookup.user.user_metadata?.qa_kind === KIND, 'Partial synthetic Auth provenance mismatch')
        const memberships = must(await admin.from('organization_members').select('org_id,org_role').eq('user_id', account.id).limit(2), 'Recover synthetic personal organization')
        check(memberships.length === 1 && UUID.test(memberships[0].org_id) && memberships[0].org_role === 'owner', 'Partial synthetic organization ownership mismatch')
        const orgId = memberships[0].org_id
        check(account.orgIds.length === 0 || account.orgIds[0] === orgId, 'Partial synthetic organization receipt changed')
        const members = must(await admin.from('organization_members').select('user_id,org_role').eq('org_id', orgId).limit(2), 'Verify partial organization exclusivity')
        check(members.length === 1 && members[0].user_id === account.id && members[0].org_role === 'owner', 'Refusing partial shared organization cleanup')
        account.orgIds = [orgId]; account.membershipVerified = true; persist()
      }
      await validateOwnedRows()
      // Revoke every synthetic login before deleting data or identities.
      for (const account of state.accounts) {
        const lookup = await admin.auth.admin.getUserById(account.id)
        check(!lookup.error || lookup.error.status === 404, 'Synthetic cleanup Auth lookup failed')
        if (!lookup.data.user) continue
        const client = browserClient()
        const login = must(await client.auth.signInWithPassword({ email: account.email, password: account.password }), 'Authenticate exact synthetic cleanup identity')
        check(login.user?.id === account.id && login.session?.access_token, 'Synthetic cleanup session identity mismatch')
        must(await admin.auth.admin.signOut(login.session.access_token, 'global'), 'Revoke synthetic sessions')
        await client.auth.signOut().catch(() => undefined)
      }
      const owner = state.accounts.find(row => row.label === 'owner')
      if (state.assignmentId) {
        // Only the exact owner and this run's recipients may have notifications.
        const rows = must(await admin.from('notifications').select('id,actor_id,recipient_id').eq('related_assignment_id', state.assignmentId), 'Synthetic notification cleanup scope')
        check(rows.every(row => row.actor_id === owner.id && state.accounts.some(account => account.id === row.recipient_id && account.role === 'student')), 'Refusing unexpected notification provenance')
        must(await admin.from('notifications').delete().eq('related_assignment_id', state.assignmentId).eq('actor_id', owner.id), 'Cleanup exact synthetic notifications')
        must(await admin.from('assignments').delete().eq('id', state.assignmentId).eq('created_by', owner.id).eq('title', `${state.prefix} exercise`), 'Cleanup exact synthetic assignment')
      }
      if (state.questionId) must(await admin.from('questions').delete().eq('id', state.questionId).eq('created_by', owner.id).eq('title', `${state.prefix} question`), 'Cleanup exact synthetic question')
      if (state.classroomId) must(await admin.from('classrooms').delete().eq('id', state.classroomId).eq('teacher_id', owner.id).eq('name', `${state.prefix} classroom`), 'Cleanup exact synthetic classroom')
      for (const account of [...state.accounts].reverse()) {
        check(account.membershipVerified, 'Synthetic personal organization was not verified')
        for (const orgId of account.orgIds) {
          const members = must(await admin.from('organization_members').select('user_id,org_role').eq('org_id', orgId), 'Synthetic personal organization membership lookup')
          if (members.length === 0) {
            const remaining = must(await admin.from('organizations').select('id').eq('id', orgId), 'Synthetic existing organization lookup')
            if (remaining.length === 0) continue
          }
          check(members.length === 1 && members[0].user_id === account.id && members[0].org_role === 'owner', 'Refusing shared organization cleanup')
          for (const table of ['classrooms', 'assignments', 'questions']) {
            const rows = must(await admin.from(table).select('id').eq('org_id', orgId).limit(1), 'Synthetic organization remaining resource check')
            check(rows.length === 0, 'Refusing organization containing unowned resources')
          }
          must(await admin.from('organizations').delete().eq('id', orgId), 'Cleanup exact synthetic personal organization')
        }
        const lookup = await admin.auth.admin.getUserById(account.id)
        check(!lookup.error || lookup.error.status === 404, 'Synthetic Auth deletion lookup failed')
        if (lookup.data.user) {
          check(lookup.data.user.user_metadata?.qa_run === state.run && lookup.data.user.user_metadata?.qa_kind === KIND, 'Synthetic Auth deletion provenance mismatch')
          must(await admin.auth.admin.deleteUser(account.id), 'Cleanup exact synthetic Auth account')
        }
      }
      if (existsSync(fixturePath)) unlinkSync(fixturePath)
      return true
    } catch { return false }
  }
  try {
    if (mode !== 'create') {
      const stat = lstatSync(fixturePath)
      check(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 && stat.uid === process.getuid?.() && stat.size <= 128_000, 'Fixture requires a private owned regular file')
      state = validateFixtureManifest(JSON.parse(readFileSync(fixturePath, 'utf8'))); trusted = true
      if (mode !== 'cleanup') await validateOwnedRows()
      if (mode === 'verify') {
        check(state.baseline, 'Fixture has no verified score baseline')
        same(await snapshot(), state.baseline, 'Reminder interaction changed synthetic scores, attempts, answers or timers')
        const notifications = must(await admin.from('notifications').select('id,org_id,recipient_id,actor_id,type,title,body,link,related_assignment_id,related_classroom_id,is_read')
          .eq('related_assignment_id', state.assignmentId).order('id'), 'Read exact synthetic reminder rows')
        log('PASS', 'exact reminder recipients, ownership, acknowledgement counts and unchanged scores', verifyReminderRows(state, notifications, expectedReadCount))
      }
    } else {
      for (const [table, columns] of [['notifications', 'id,type,is_read,related_assignment_id'], ['submissions', 'id,answer_revision,closed_at'],
        ['submission_answers', ANSWER_COLUMNS], ['assignment_question_grading_parts', 'assignment_id,question_id,work_share']]) {
        must(await admin.from(table).select(columns).limit(0), 'Required Staging schema preflight unavailable')
      }
      stage = 'synthetic fixture setup'; await setup()
      log('PASS', 'synthetic four-state fixture with preserved nonzero completed scores', { syntheticTeachers: 1, syntheticStudents: 4, completed: 2, inProgress: 1, neverStarted: 1 })
    }
    success = true
  } catch (error) {
    log('FAIL', stage, { message: error instanceof VerificationError ? error.message : 'Unexpected Staging verification failure' })
  }
  if (mode === 'verify') return success ? 0 : 1 // Read-only verification never cleans up or edits the fixture.
  if (success && mode === 'create' && argv.includes('--keep-fixture')) {
    log('DEFERRED_FOR_BROWSER', 'private mode-0600 fixture retained', { fixturePath, syntheticAccounts: state.accounts.length }); return 0
  }
  const clean = await cleanup()
  log(clean ? 'PASS' : 'FAIL', 'exact owned fixture cleanup', { syntheticAccounts: state.accounts.length })
  if (!clean) log('CLEANUP_REQUIRED', 'private fixture retained for exact retry', { fixturePath })
  return success && clean ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main()
