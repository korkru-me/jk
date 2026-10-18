// Real integration gate for this exact, isolated Staging project only.
// Run after the three recorded migrations are applied. This creates synthetic
// accounts/rows and removes only this run's IDs, including after a failed check.
// Never prints credentials, sessions, response bodies, names, emails or answers.
//
// node scripts/verify-grading-staging.mjs --execute \
//   --confirm=grading-staging-synthetic [--env-file=/private/tmp/staging.env] \
//   [--keep-fixture] [--fixture-file=/private/tmp/grading-fixture.json]
// A kept fixture can later be removed with the same safety flags and
// --cleanup-fixture=/private/tmp/grading-fixture.json.
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { parseEnvFile } from './check-seb-readiness-core.mjs'

const PROJECT = 'dyuxkrzeveknqgtuzpbh'
const DATABASE_URL = `https://${PROJECT}.supabase.co`
const SITE = 'https://staging.korkru.com'
const MIGRATIONS = '20261018005611,20261018040444,20261018133739'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const argv = process.argv.slice(2)
const option = name => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const check = (condition, label) => { if (!condition) throw new Error(label) }
const safeCode = error => /^[A-Z0-9]{3,10}$/.test(error?.code ?? '') ? error.code : 'request_failed'
const must = (result, label) => { if (result.error) throw new Error(`${label}: ${safeCode(result.error)}`); return result.data }
const same = (left, right, label) => check(JSON.stringify(left) === JSON.stringify(right), label)
const log = (status, checkName, counts = {}) => console.log(JSON.stringify({ status, check: checkName, ...counts }))

function environment() {
  const envPath = option('env-file') ?? new URL('../.env.qa.local', import.meta.url)
  let values = {}
  if (existsSync(envPath)) {
    const parsed = parseEnvFile(readFileSync(envPath, 'utf8'), process.env)
    check(parsed.warnings.length === 0, 'Staging environment file parse failed')
    values = parsed.values
  } else check(!option('env-file'), 'Explicit Staging environment file unavailable')
  return { ...values, ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== '')) }
}

function assertStaging(env) {
  check(argv.includes('--execute') && argv.includes('--confirm=grading-staging-synthetic'), 'Exact synthetic execution confirmation required')
  check(env.EXAM_QA_ENVIRONMENT === 'staging' && env.KORKRU_DEPLOYMENT_ENV === 'staging' && env.VERCEL_ENV === 'preview', 'Staging-only deployment flags required')
  check(env.NEXT_PUBLIC_SITE_URL === SITE && env.NEXT_PUBLIC_SUPABASE_URL === DATABASE_URL, 'Unexpected Staging project or origin')
  check(env.GRADING_QA_MIGRATIONS_APPLIED === MIGRATIONS, 'Confirm all three Staging migration versions before running')
  for (const [name, role] of [['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon'], ['SUPABASE_SERVICE_ROLE_KEY', 'service_role']]) {
    // Current secret keys are opaque, not JWTs. They can only authenticate at
    // their own project: the hardcoded Staging-only client below must complete
    // read-only schema/RPC probes before creating accounts or fixture data.
    if (role === 'service_role' && /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(env[name] ?? '')) continue
    let claims
    try { claims = JSON.parse(Buffer.from(env[name].split('.')[1], 'base64url').toString('utf8')) } catch { throw new Error(`Staging ${role} JWT key required`) }
    check(claims.ref === PROJECT && claims.role === role, `Staging ${role} key project/role mismatch`)
  }
}

function privatePath(raw) {
  check(typeof raw === 'string' && isAbsolute(raw), 'Fixture path must be absolute')
  const path = resolve(raw)
  check(path.startsWith('/private/tmp/') || path.startsWith('/tmp/'), 'Fixture must stay in a private temporary directory')
  return path
}

if (argv.includes('--help')) {
  console.log('Staging only: --execute --confirm=grading-staging-synthetic --env-file=<existing ignored env> [--check-config|--keep-fixture|--cleanup-fixture=<private manifest>]')
  console.log('Requires Staging site/deployment flags, Staging anon JWT and service JWT/secret key, plus GRADING_QA_MIGRATIONS_APPLIED=20261018005611,20261018040444,20261018133739. --check-config never creates a client or makes a request; opaque secret keys authenticate in the read-only Staging preflight.')
  process.exit(0)
}
const env = environment()
assertStaging(env) // Before creating any client, network request, or fixture file.
if (argv.includes('--check-config')) { log('PASS', 'local Staging configuration fence; no network or mutations'); process.exit(0) }
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(DATABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
const browserClient = () => createClient(DATABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options)
const anonymous = browserClient()
const cleanupPath = option('cleanup-fixture')
const keep = argv.includes('--keep-fixture')
const run = randomUUID()
const fixturePath = privatePath(cleanupPath ?? option('fixture-file') ?? `/private/tmp/korkru-grading-staging-${run}.json`)
let state = { version: 1, projectRef: PROJECT, target: SITE, run, accounts: [], classroomId: null, assignmentId: null, questionIds: [], submissionIds: [], answerIds: [] }
const clients = new Map()
let verified = false
let keepApproved = false
let trustedFixture = false
let stage = 'preflight'

function saveFixture() {
  const temporary = `${fixturePath}.${randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' })
  renameSync(temporary, fixturePath)
  chmodSync(fixturePath, 0o600)
}
function persist() { if (!cleanupPath) saveFixture() }
function rpc(name, actorId, items, requestId = randomUUID(), client = admin) {
  return client.rpc(name, { p_actor_id: actorId, p_assignment_id: state.assignmentId, p_request_id: requestId, p_items: items })
}
async function readDrafts(actorId, client = admin) {
  return must(await client.rpc('read_grading_drafts', { p_actor_id: actorId, p_assignment_id: state.assignmentId }), 'Private draft read')
}
async function denial(result, label, code = '42501') { check(result.error?.code === code, label) }
async function snapshot() {
  const [answers, submissions, events, notifications, requests] = await Promise.all([
    admin.from('submission_answers').select('*').in('id', state.answerIds).order('id'),
    admin.from('submissions').select('*').in('id', state.submissionIds).eq('assignment_id', state.assignmentId).order('id'),
    admin.from('grading_review_events').select('*').eq('assignment_id', state.assignmentId).order('id'),
    admin.from('notifications').select('*').eq('related_assignment_id', state.assignmentId).order('id'),
    admin.from('grading_draft_requests').select('*').eq('assignment_id', state.assignmentId).order('request_id'),
  ])
  return { answers: must(answers, 'Read synthetic answers'), submissions: must(submissions, 'Read synthetic submissions'), events: must(events, 'Read synthetic audit'), notifications: must(notifications, 'Read synthetic notifications'), requests: must(requests, 'Read synthetic receipts') }
}
const publicState = ({ answers, submissions, events, notifications }) => ({ answers, submissions, events, notifications })
const draftItem = (answer, values, updatedAt = null) => ({ answerId: answer.id, expectedScoreEditedAt: answer.score_edited_at, expectedDraftUpdatedAt: updatedAt, ...values })

async function account(role, label) {
  const email = `grading-qa-${state.run}-${label}@qa.staging.korkru.com`
  const password = `Qa1!${randomUUID()}Aa9`
  const result = must(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Grading QA ${label}`, qa_run: state.run } }), 'Create synthetic account')
  check(result.user?.id && UUID.test(result.user.id), 'Synthetic account ID missing')
  const record = { id: result.user.id, role, label, email, password, orgIds: [], membershipVerified: false }
  state.accounts.push(record); persist()
  const memberships = must(await admin.from('organization_members').select('org_id,org_role').eq('user_id', record.id), 'Read synthetic organization')
  check(memberships.length === 1 && memberships[0].org_role === 'owner', 'Unexpected synthetic organization ownership')
  record.orgIds = memberships.map(row => row.org_id); record.membershipVerified = true; persist()
  const updated = must(await admin.from('users').update({ role, status: 'active', full_name: `Grading QA ${label}`, survey_role: role, instructor_type: role === 'teacher' ? 'teacher' : null }).eq('id', record.id).select('id'), 'Configure synthetic profile')
  check(updated.length === 1, 'Synthetic profile update count')
  const client = browserClient()
  const login = must(await client.auth.signInWithPassword({ email, password }), 'Authenticate synthetic account')
  check(login.user?.id === record.id && login.session?.access_token, 'Synthetic authenticated identity mismatch')
  clients.set(record.id, client); persist()
  return record
}

async function configure(questionId, answerMax, workMax) {
  must(await admin.rpc('configure_assignment_question_grading_parts', { p_actor_id: state.accounts[0].id, p_assignment_id: state.assignmentId, p_question_id: questionId, p_answer_max_score: answerMax, p_work_max_score: workMax, p_expected_updated_at: null }), 'Configure synthetic allocation')
}

async function setup() {
  check(!existsSync(fixturePath), 'Refusing to replace an existing fixture manifest')
  saveFixture()
  trustedFixture = true
  const owner = await account('teacher', 'owner')
  const peer = await account('teacher', 'peer')
  const students = [await account('student', 'student-a'), await account('student', 'student-b')]
  state.classroomId = randomUUID(); persist()
  must(await admin.from('classrooms').insert({ id: state.classroomId, teacher_id: owner.id, org_id: owner.orgIds[0], name: `Grading QA ${state.run}`, description: 'Synthetic Staging integration only', class_code: randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase(), status: 'active', classroom_type: 'subject' }), 'Create synthetic classroom')
  must(await admin.from('classroom_students').insert(students.map(student => ({ classroom_id: state.classroomId, student_id: student.id }))), 'Create synthetic roster')
  must(await admin.from('classroom_co_teachers').insert({ classroom_id: state.classroomId, user_id: peer.id, permission: 'manage', invited_by: owner.id }), 'Create synthetic manager')
  for (const type of ['written', 'essay']) {
    const id = randomUUID(); state.questionIds.push(id); persist()
    must(await admin.from('questions').insert({ id, created_by: owner.id, org_id: owner.orgIds[0], visibility: 'private', title: `Grading QA ${state.run} ${type}`, question_text: '<p>ข้อมูลสังเคราะห์สำหรับตรวจระบบ</p>', question_type: type, variables: [], logic_rules: [], answer_formula: type === 'written' ? '1' : '', answer_tolerance: 0.01, extra_data: {}, requires_work_image: true, team_edit_allowed: true }), 'Create synthetic question')
  }
  state.assignmentId = randomUUID(); persist()
  must(await admin.from('assignments').insert({ id: state.assignmentId, classroom_id: state.classroomId, created_by: owner.id, org_id: owner.orgIds[0], title: 'Staging grading synthetic', type: 'exercise', mode: 'online', status: 'published', question_ids: state.questionIds, question_points: { [state.questionIds[0]]: 5, [state.questionIds[1]]: 2 }, require_work_image: true, duration_minutes: null, max_attempts: 3, shuffle_questions: false, shuffle_options: false, fullscreen_required: false, proctoring_enabled: false, secure_browser_mode: 'browser', android_exam_mode: 'blocked', show_results: 'never', show_solutions: false }), 'Create synthetic assignment')
  must(await admin.from('assignment_classrooms').insert({ assignment_id: state.assignmentId, classroom_id: state.classroomId }), 'Attach synthetic assignment')
  await configure(state.questionIds[0], 2, 3)
  await configure(state.questionIds[1], 1, 1)
  for (const student of students) {
    const id = randomUUID(); state.submissionIds.push(id); persist()
    must(await admin.from('submissions').insert({ id, org_id: owner.orgIds[0], assignment_id: state.assignmentId, student_id: student.id, status: 'in_progress', attempt_number: 1, started_at: new Date().toISOString(), max_score: 7, total_score: 0 }), 'Create synthetic attempt')
    const rows = state.questionIds.map((questionId, index) => ({ id: randomUUID(), org_id: owner.orgIds[0], submission_id: id, question_id: questionId, student_answer: index === 0 ? '1' : 'Synthetic private answer', correct_answer: index === 0 ? '1' : '', random_values: {}, work_images: [], score: index === 0 ? 5 : 0, max_score: index === 0 ? 5 : 2, is_correct: index === 0 ? true : null, order_index: index }))
    state.answerIds.push(...rows.map(row => row.id)); persist()
    must(await admin.from('submission_answers').insert(rows), 'Create synthetic answers')
    const submission = must(await admin.from('submissions').select('answer_revision').eq('id', id).single(), 'Read synthetic attempt revision')
    must(await admin.rpc('claim_submission_close', { p_submission_id: id, p_student_id: student.id, p_expired_only: false, p_expected_revision: submission.answer_revision }), 'Close synthetic attempt')
    must(await admin.rpc('commit_submission_grade', { p_submission_id: id, p_student_id: student.id, p_updates: rows.map(row => ({ id: row.id, score: row.score, is_correct: row.is_correct })), p_missing_work_evidence: true }), 'Finalize synthetic attempt')
  }
  state.teacherHref = `${SITE}/assignments/${state.assignmentId}/results/questions/${state.questionIds[0]}`
  state.studentHrefs = state.submissionIds.map(id => `${SITE}/submissions/${id}`)
  persist()
  return { owner, peer, students }
}

async function browserDenials(actors, items) {
  for (const client of [anonymous, ...actors.map(actor => clients.get(actor.id))]) {
    for (const table of ['grading_score_drafts', 'grading_draft_requests', 'grading_review_events', 'assignment_question_grading_parts']) {
      await denial(await client.from(table).select('*').eq('assignment_id', state.assignmentId), 'Browser private table access denied')
    }
    await denial(await client.rpc('read_grading_drafts', { p_actor_id: state.accounts[0].id, p_assignment_id: state.assignmentId }), 'Browser private read RPC denied')
    for (const name of ['save_grading_drafts', 'publish_grading_drafts']) await denial(await rpc(name, state.accounts[0].id, items, randomUUID(), client), 'Browser forged actor write RPC denied')
  }
}

async function verify({ owner, peer, students }) {
  const initial = await snapshot()
  check(initial.answers.length === 4 && initial.submissions.length === 2 && initial.submissions.every(row => row.status === 'submitted'), 'Finished synthetic fixture count/state')
  const inputs = initial.answers.map(answer => draftItem(answer, answer.question_id === state.questionIds[0] ? { answerScore: 1.6, workScore: 1.2 } : { workScore: 0 }))
  const saveRequest = randomUUID()
  const saved = must(await rpc('save_grading_drafts', owner.id, inputs, saveRequest), 'Save private draft batch')
  check(saved.success === true && saved.drafts.length === 4, 'Private draft result count')
  const afterSave = await snapshot()
  same(publicState(afterSave), publicState(initial), 'Private save changed public scores/header/audit/notifications')
  same(must(await rpc('save_grading_drafts', owner.id, inputs, saveRequest), 'Retry private save'), saved, 'Private save retry was not idempotent')
  same(await readDrafts(owner.id), saved.drafts, 'Own private read differs')
  same(await readDrafts(peer.id), [], 'Other teacher read leaked owner drafts')
  const peerItem = draftItem(initial.answers.find(answer => answer.question_id === state.questionIds[0]), { workScore: 2 })
  must(await rpc('save_grading_drafts', peer.id, [peerItem]), 'Save separate peer private draft')
  check((await readDrafts(peer.id)).length === 1, 'Peer private draft absent')
  same(await readDrafts(owner.id), saved.drafts, 'Peer save altered owner drafts')
  await denial(await rpc('save_grading_drafts', owner.id, inputs), 'Stale private revision accepted', 'PT409')
  await denial(await rpc('save_grading_drafts', owner.id, [{ ...inputs[0], workScore: 0 }], saveRequest), 'Changed retry payload accepted', 'PT409')
  const publishItems = inputs.map(item => ({ ...item, expectedDraftUpdatedAt: saved.drafts.find(draft => draft.answerId === item.answerId).updatedAt }))
  await denial(await rpc('save_grading_drafts', owner.id, [{ ...publishItems[0], expectedScoreEditedAt: '2000-01-01T00:00:00Z' }]), 'Stale public score revision accepted', 'PT409')
  log('PASS', 'private save, per-teacher isolation, exact CAS and retry', { draftAnswers: 4 })

  const rollbackBefore = await snapshot(), privateBefore = await readDrafts(owner.id)
  const invalid = publishItems.map(item => ({ ...item }))
  // Highest ID executes last, proving earlier valid writes are rolled back.
  const last = invalid.sort((a, b) => a.answerId.localeCompare(b.answerId)).at(-1)
  const lastAnswer = initial.answers.find(answer => answer.id === last.answerId)
  last.workScore = Number(lastAnswer.work_max_score) + 1
  for (const name of ['save_grading_drafts', 'publish_grading_drafts']) {
    await denial(await rpc(name, owner.id, invalid), 'Invalid member did not reject whole batch', '22023')
    same(await snapshot(), rollbackBefore, 'Rejected batch changed published state/receipt')
    same(await readDrafts(owner.id), privateBefore, 'Rejected batch changed private drafts')
  }
  await browserDenials([owner, peer, ...students], inputs)
  for (const student of students) {
    await denial(await rpc('save_grading_drafts', student.id, inputs), 'Student actor authorized by service RPC')
    await denial(await admin.rpc('read_grading_drafts', { p_actor_id: student.id, p_assignment_id: state.assignmentId }), 'Student actor private read allowed')
  }
  must(await admin.from('classroom_co_teachers').delete().eq('classroom_id', state.classroomId).eq('user_id', peer.id), 'Revoke synthetic manager')
  for (const name of ['save_grading_drafts', 'publish_grading_drafts']) await denial(await rpc(name, peer.id, [peerItem]), 'Outsider teacher write authorized')
  await denial(await admin.rpc('read_grading_drafts', { p_actor_id: peer.id, p_assignment_id: state.assignmentId }), 'Outsider teacher private read authorized')
  log('PASS', 'atomic invalid-batch rollback and authenticated/anonymous permission matrix')

  const requestId = randomUUID()
  const result = must(await rpc('publish_grading_drafts', owner.id, publishItems, requestId), 'Publish two-student batch')
  check(result.success === true && result.published.length === 4 && result.notificationCount === 2, 'Publication result/count incorrect')
  const published = await snapshot()
  check(published.events.filter(event => event.kind === 'review').length === 4, 'Publication audit count incorrect')
  check(published.notifications.length === 2 && published.submissions.every(row => row.status === 'submitted' && Number(row.total_score) === 2.8 && Number(row.max_score) === 7), 'Publication headers/notification count incorrect')
  for (const answer of published.answers) {
    const old = initial.answers.find(row => row.id === answer.id)
    check(answer.student_answer === old.student_answer && answer.correct_answer === old.correct_answer && Number(answer.max_score) === Number(old.max_score), 'Publication changed student answer/key/maximum')
    if (answer.question_id === state.questionIds[1]) {
      check(Number(answer.work_score) === 0 && answer.work_reviewed_at !== null && answer.answer_score === old.answer_score && answer.answer_reviewed_at === null && answer.is_correct === old.is_correct, 'Work-only zero changed untouched pending answer')
    } else check(Number(answer.answer_score) === 1.6 && Number(answer.work_score) === 1.2 && answer.answer_reviewed_at && answer.work_reviewed_at, 'Published component scores incorrect')
  }
  same(await readDrafts(owner.id), [], 'Published own private drafts remained')
  const peerDrafts = must(await admin.from('grading_score_drafts').select('answer_id').eq('assignment_id', state.assignmentId).eq('actor_id', peer.id), 'Verify other teacher draft retention')
  check(peerDrafts.length === 1, 'Publication deleted other teacher draft')
  for (const notification of published.notifications) {
    check(notification.type === 'grade_published' && notification.title === 'ครูตรวจคะแนนแล้ว' && notification.body === 'Staging grading synthetic' && notification.grading_publication_request_id === requestId, 'Notification contains non-generic grade content')
    const submission = published.submissions.find(row => row.student_id === notification.recipient_id)
    check(submission && notification.link === `/submissions/${submission.id}`, 'Student notification link scope incorrect')
  }
  const settings = must(await admin.from('assignments').select('show_results,show_solutions').eq('id', state.assignmentId).single(), 'Read visibility settings')
  check(settings.show_results === 'never' && settings.show_solutions === false, 'Publication changed hidden-score/solution reveal')
  for (const student of students) {
    const own = must(await clients.get(student.id).from('notifications').select('recipient_id,title,body,link').eq('related_assignment_id', state.assignmentId), 'Read authenticated learner notification')
    check(own.length === 1 && own[0].recipient_id === student.id && own[0].title === 'ครูตรวจคะแนนแล้ว' && own[0].body === 'Staging grading synthetic', 'Learner notification isolation/generic content failed')
  }
  same(must(await rpc('publish_grading_drafts', owner.id, publishItems, requestId), 'Retry committed publication'), result, 'Publish retry outcome changed')
  same(await snapshot(), published, 'Publish retry duplicated grades/audit/notifications')
  await denial(await rpc('publish_grading_drafts', owner.id, publishItems), 'New stale publication accepted', 'PT409')
  log('PASS', 'two-student atomic publish, explicit work zero, hidden results, generic notifications and idempotent retry', { publishedAnswers: 4, studentNotifications: 2 })

  // The same generic learner message remains valid when results are revealed.
  must(await admin.from('assignments').update({ show_results: 'immediate' }).eq('id', state.assignmentId).eq('created_by', owner.id), 'Reveal synthetic result setting')
  const revealedItems = published.answers.filter(answer => answer.question_id === state.questionIds[0]).map(answer => draftItem(answer, { workScore: 0 }))
  const revealed = must(await rpc('publish_grading_drafts', owner.id, revealedItems), 'Publish revealed-score synthetic round')
  check(revealed.notificationCount === 2, 'Revealed-score recipient deduplication failed')
  const revealedNotifications = must(await admin.from('notifications').select('title,body,recipient_id').eq('related_assignment_id', state.assignmentId).eq('grading_publication_request_id', revealed.requestId), 'Read revealed-score notifications')
  check(revealedNotifications.length === 2 && revealedNotifications.every(row => row.title === 'ครูตรวจคะแนนแล้ว' && row.body === 'Staging grading synthetic'), 'Revealed-score notification contains grade content')
  must(await admin.from('assignments').update({ show_results: 'never' }).eq('id', state.assignmentId).eq('created_by', owner.id), 'Restore synthetic hidden results')
  log('PASS', 'generic notification contract with hidden and revealed results', { publicationRounds: 2, studentNotifications: 4 })
  if (keep) {
    const current = (await snapshot()).answers.find(answer => answer.question_id === state.questionIds[0])
    const beforeResume = publicState(await snapshot())
    must(await rpc('save_grading_drafts', owner.id, [draftItem(current, { workScore: 1.2 })]), 'Seed private browser-resume draft')
    same(publicState(await snapshot()), beforeResume, 'Browser-resume draft changed public state')
    state.browserDraftAnswers = 1; persist()
  }
}

async function cleanup() {
  if (!trustedFixture) return true
  let clean = true
  const attempt = async work => { try { await work() } catch { clean = false } }
  // Validate synthetic Auth provenance before deleting any resource from a
  // resumed manifest. A private file alone never authorizes another actor's IDs.
  try {
    for (const account of state.accounts) {
      const lookup = await admin.auth.admin.getUserById(account.id)
      check(!lookup.error || lookup.error.status === 404, 'Cleanup synthetic provenance lookup failed')
      if (lookup.data.user) check(lookup.data.user.user_metadata?.qa_run === state.run, 'Cleanup synthetic provenance mismatch')
    }
  } catch { return false }
  // Each deletion is an exact generated ID and rechecks the run-owned actor.
  const owner = state.accounts.find(row => row.label === 'owner')
  if (state.assignmentId && owner) await attempt(async () => { must(await admin.from('notifications').delete().eq('related_assignment_id', state.assignmentId).eq('actor_id', owner.id), 'Cleanup own publication notifications') })
  if (state.assignmentId && owner) await attempt(async () => {
    const rows = must(await admin.from('assignments').select('id,created_by').eq('id', state.assignmentId), 'Cleanup assignment ownership')
    check(rows.every(row => row.created_by === owner.id), 'Cleanup assignment owner mismatch')
    must(await admin.from('assignments').delete().eq('id', state.assignmentId).eq('created_by', owner.id), 'Cleanup owned assignment')
  })
  for (const id of state.questionIds) if (owner) await attempt(async () => { must(await admin.from('questions').delete().eq('id', id).eq('created_by', owner.id), 'Cleanup owned question') })
  if (state.classroomId && owner) await attempt(async () => { must(await admin.from('classrooms').delete().eq('id', state.classroomId).eq('teacher_id', owner.id), 'Cleanup owned classroom') })
  for (const account of [...state.accounts].reverse()) await attempt(async () => {
    const lookup = await admin.auth.admin.getUserById(account.id)
    check(!lookup.error || lookup.error.status === 404, 'Cleanup synthetic auth lookup failed')
    const auth = lookup.data
    if (auth.user) check(auth.user.user_metadata?.qa_run === state.run, 'Cleanup synthetic run ownership mismatch')
    if (auth.user) {
      // A fresh synthetic login also permits cleanup after a kept token expired.
      // Neither the token nor the project keys are written into the manifest.
      const client = clients.get(account.id) ?? browserClient()
      const login = must(await client.auth.signInWithPassword({ email: account.email, password: account.password }), 'Authenticate exact synthetic cleanup account')
      check(login.user?.id === account.id && login.session?.access_token, 'Cleanup synthetic authenticated identity mismatch')
      must(await admin.auth.admin.signOut(login.session.access_token, 'global'), 'Revoke synthetic sessions')
      await client.auth.signOut().catch(() => undefined)
    }
    check(account.membershipVerified, 'Cleanup synthetic organization was not verified')
    for (const orgId of account.orgIds) {
      const members = must(await admin.from('organization_members').select('user_id,org_role').eq('org_id', orgId), 'Cleanup synthetic organization members')
      if (members.length === 0) {
        const org = must(await admin.from('organizations').select('id').eq('id', orgId), 'Cleanup existing synthetic organization')
        if (org.length === 0) continue
      }
      check(members.length === 1 && members[0].user_id === account.id && members[0].org_role === 'owner', 'Cleanup refuses shared organization')
      must(await admin.from('organizations').delete().eq('id', orgId), 'Cleanup synthetic personal organization')
    }
    if (auth.user) must(await admin.auth.admin.deleteUser(account.id), 'Cleanup synthetic auth account')
  })
  if (clean) { if (existsSync(fixturePath)) unlinkSync(fixturePath) }
  return clean
}

try {
  if (cleanupPath) {
    const stat = lstatSync(fixturePath)
    check(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, 'Cleanup requires a private regular fixture file')
    state = JSON.parse(readFileSync(fixturePath, 'utf8'))
    check(stat.size <= 128_000 && state.version === 1 && state.projectRef === PROJECT && state.target === SITE && UUID.test(state.run), 'Unexpected cleanup fixture target')
    check(Array.isArray(state.accounts) && state.accounts.length <= 4 && state.accounts.every(row => UUID.test(row.id) && Array.isArray(row.orgIds) && row.orgIds.every(id => UUID.test(id))), 'Invalid cleanup fixture accounts')
    check(Array.isArray(state.questionIds) && state.questionIds.length <= 2 && Array.isArray(state.submissionIds) && state.submissionIds.length <= 2 && Array.isArray(state.answerIds) && state.answerIds.length <= 4, 'Invalid cleanup fixture resource bounds')
    check([state.assignmentId, state.classroomId, ...state.questionIds, ...state.submissionIds, ...state.answerIds].filter(Boolean).every(id => UUID.test(id)), 'Invalid cleanup fixture IDs')
    trustedFixture = true
    verified = true
  } else {
    // Schema checks are read-only and precede synthetic Auth creation.
    for (const [table, columns] of [['grading_score_drafts', 'actor_id,assignment_id,answer_id'], ['grading_draft_requests', 'actor_id,request_id'], ['submission_answers', 'id,answer_max_score,work_max_score,answer_reviewed_at,work_reviewed_at'], ['notifications', 'id,grading_publication_request_id']]) {
      must(await admin.from(table).select(columns).limit(0), 'Required Staging migration schema unavailable')
    }
    await denial(await admin.rpc('read_grading_drafts', { p_actor_id: randomUUID(), p_assignment_id: randomUUID() }), 'Required private draft RPC unavailable')
    stage = 'synthetic setup'
    const fixture = await setup()
    stage = 'grading integration checks'
    await verify(fixture)
    verified = true; keepApproved = keep
  }
  log('PASS', cleanupPath ? 'cleanup fixture validation' : 'complete isolated Staging grading gate', { syntheticTeachers: 2, syntheticStudents: 2 })
} catch (error) {
  // Only our fixed labels/codes reach logs; never serialize SDK errors/data.
  log('FAIL', stage, { message: error instanceof Error ? error.message : 'Staging verification failed' })
} finally {
  if (verified && keepApproved) {
    log('DEFERRED_FOR_BROWSER', 'private mode-0600 fixture retained', { fixturePath, syntheticAccounts: state.accounts.length })
    process.exitCode = 0
  } else {
    const clean = await cleanup()
    log(clean ? 'PASS' : 'FAIL', 'exact owned fixture cleanup', { syntheticAccounts: state.accounts.length })
    if (!clean) log('CLEANUP_REQUIRED', 'private fixture retained for exact retry', { fixturePath })
    process.exitCode = verified && clean ? 0 : 1
  }
}
