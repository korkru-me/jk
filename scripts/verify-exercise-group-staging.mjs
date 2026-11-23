// Disposable synthetic fixtures and evidence for the canonical Staging UI.
// No deployment-protection secrets, Production credentials or real users.
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const ref = 'dyuxkrzeveknqgtuzpbh'
const site = 'https://staging.korkru.com'
const path = '/private/tmp/group-exercise-ui-fixture.json'
const mode = process.argv.find(a => a.startsWith('--mode='))?.slice(7)
if (!process.argv.includes('--confirm=synthetic-staging-exercise-group')) throw Error('Exact disposable Staging confirmation required')
const keys = JSON.parse(readFileSync('/private/tmp/group-exercise-stage-keys.json', 'utf8')).keys
const key = name => keys.find(k => k.id === name)?.api_key
for (const name of ['anon', 'service_role']) {
  const claims = JSON.parse(Buffer.from(key(name).split('.')[1], 'base64url'))
  if (claims.ref !== ref || claims.role !== name) throw Error('Wrong Staging credential')
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(`https://${ref}.supabase.co`, key('service_role'), options)
const client = () => createClient(`https://${ref}.supabase.co`, key('anon'), options)
const check = (ok, label) => { if (!ok) throw Error(label) }
const must = (r, label) => { if (r.error) throw Error(`${label}: ${r.error.code ?? 'request failed'} ${r.error.message}`); return r.data }
let state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { ref, site, run: randomUUID(), accounts: [], rooms: [], questions: [], evidence: [] }
check(state.ref === ref && state.site === site && /^[a-f0-9-]{36}$/.test(state.run), 'Wrong fixture scope')
const save = () => { writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600 }); chmodSync(path, 0o600) }
const note = label => { state.evidence.push({ at: new Date().toISOString(), label }); save(); console.log(`PASS: ${label}`) }
const actor = label => state.accounts.find(a => a.label === label)
const password = `GroupQa!${state.run}`

async function account(label, role, name) {
  const email = `exercise-group-${state.run}-${label}@qa.staging.korkru.com`
  const { user } = must(await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: name, qa_run: state.run } }), 'Create disposable identity')
  const row = { id: user.id, label, email, role, name, org: null }; state.accounts.push(row); save()
  const orgs = must(await admin.from('organization_members').select('org_id,org_role').eq('user_id', row.id), 'Read disposable workspace')
  check(orgs.length === 1 && orgs[0].org_role === 'owner', 'Unexpected workspace provenance')
  row.org = orgs[0].org_id; save()
  must(await admin.from('users').update({ role, status: 'active', full_name: name, survey_role: role === 'admin' ? 'teacher' : role,
    instructor_type: role === 'student' ? null : 'teacher' }).eq('id', row.id), 'Configure disposable profile')
  return row
}
async function setup() {
  check(state.accounts.length === 0 && !existsSync(path), 'Refuse to overwrite previous fixtures')
  save()
  const owner = await account('admin', 'admin', 'แอดมินทดสอบ งานกลุ่ม')
  const teacher = await account('teacher', 'teacher', 'ครูทดสอบ งานกลุ่ม')
  for (const [label, name] of [['sender', 'ตัวแทนทดสอบ'], ['peer1', 'สมาชิกทดสอบ หนึ่ง'], ['peer2', 'สมาชิกทดสอบ สอง'],
    ['peer3', 'สมาชิกทดสอบ สาม'], ['nonmember', 'นักเรียนทดสอบ นอกกลุ่ม'], ['outsider', 'นักเรียนทดสอบ ต่างห้อง']]) await account(label, 'student', name)
  for (const label of ['main', 'outside']) {
    const id = randomUUID(); state.rooms.push({ id, label }); save()
    must(await admin.from('classrooms').insert({ id, teacher_id: owner.id, org_id: owner.org,
      name: label === 'main' ? `ทดสอบงานกลุ่ม ${state.run.slice(0, 8)}` : `ทดสอบต่างห้อง ${state.run.slice(0, 8)}`,
      description: `Synthetic Staging only ${state.run}`, class_code: randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase(),
      classroom_type: 'subject', status: 'active' }), 'Create disposable classroom')
  }
  const room = state.rooms.find(r => r.label === 'main').id, outside = state.rooms.find(r => r.label === 'outside').id
  must(await admin.from('classroom_co_teachers').insert({ classroom_id: room, user_id: teacher.id, permission: 'manage', invited_by: owner.id }), 'Enroll teacher manager')
  must(await admin.from('classroom_students').insert(state.accounts.filter(a => a.role === 'student').map(a => ({ classroom_id: a.label === 'outsider' ? outside : room, student_id: a.id }))), 'Enroll disposable roster')
  for (const type of ['written', 'essay']) {
    const id = randomUUID(); state.questions.push({ id, type }); save()
    must(await admin.from('questions').insert({ id, created_by: owner.id, org_id: owner.org, visibility: 'private',
      title: type === 'written' ? 'ทดสอบอัตโนมัติ 1 + 1' : 'ทดสอบครูตรวจ อธิบายคำตอบ',
      question_text: type === 'written' ? '<p>1 + 1 เท่ากับเท่าไร</p>' : '<p>อธิบายวิธีคิดของกลุ่ม (ข้อมูลจำลอง)</p>',
      question_type: type, variables: [], logic_rules: [], answer_formula: type === 'written' ? '2' : '', answer_tolerance: 0.01,
      extra_data: {}, requires_work_image: false, team_edit_allowed: true }), 'Create bank question')
  }
  note('Eight synthetic identities, isolated classroom and two bank questions prepared')
}
async function snapshot() {
  const owner = actor('admin')
  const work = must(await admin.from('assignments').select('id,title,type,status,submission_mode,group_min_members,group_max_members,max_attempts,completion_rule,score_strategy,question_ids,question_points,show_results,instant_check')
    .eq('created_by', owner.id).order('created_at'), 'Read synthetic assignments')
  const ids = work.map(w => w.id)
  const submissions = ids.length ? must(await admin.from('submissions').select('id,assignment_id,student_id,status,total_score,max_score,score_adjustment,group_source_submission_id,closed_at,answer_revision').in('assignment_id', ids), 'Read synthetic scores') : []
  const answers = submissions.length ? must(await admin.from('submission_answers').select('id,submission_id,question_id,student_answer,score,max_score,score_edited_at').in('submission_id', submissions.map(s => s.id)), 'Read synthetic answers') : []
  const members = ids.length ? must(await admin.from('exercise_group_members').select('*').in('assignment_id', ids), 'Read synthetic memberships') : []
  state.assignmentIds = ids; save()
  console.log(JSON.stringify({ room: state.rooms[0].id, work, submissions: submissions.map(s => ({ ...s, student: state.accounts.find(a => a.id === s.student_id)?.label })), answers, members }, null, 2))
}
async function verify() {
  const works = must(await admin.from('assignments').select('*').eq('created_by', actor('admin').id), 'Read synthetic work')
  const group = works.find(w => w.submission_mode === 'group' && w.id !== state.reviewAssignmentId)
  check(group && group.type === 'exercise' && group.group_min_members === 3 && group.group_max_members === 5 && group.max_attempts === 1
    && group.completion_rule === 'fixed' && group.question_ids.length === 2, 'Group settings or bank provenance wrong')
  const rows = must(await admin.from('submissions').select('*').eq('assignment_id', group.id), 'Read shared scores')
  const canonical = rows.find(s => s.student_id === actor('sender').id)
  check(canonical && rows.filter(s => s.status !== 'in_progress').length === 3, 'Expected exactly three submitted group members')
  for (const label of ['sender', 'peer1', 'peer2']) {
    const row = rows.find(s => s.student_id === actor(label).id)
    check(row?.total_score === 18 && row.max_score === 20 && row.status === 'graded', `${label} did not get 18/20`)
    if (label !== 'sender') check(row.group_source_submission_id === canonical.id, 'Noncanonical receipt')
    const c = client(); must(await c.auth.signInWithPassword({ email: actor(label).email, password }), 'Authenticate member')
    const answers = must(await c.from('submission_answers').select('id,score').eq('submission_id', canonical.id), 'Read permitted shared answers')
    check(answers.length === 2 && answers.reduce((sum, a) => sum + a.score, 0) === 18, 'Member could not read shared graded answers')
    await c.auth.signOut({ scope: 'local' })
  }
  for (const label of ['nonmember', 'outsider']) {
    const c = client(); must(await c.auth.signInWithPassword({ email: actor(label).email, password }), 'Authenticate nonmember')
    check(must(await c.from('submission_answers').select('id').eq('submission_id', canonical.id), 'Check answer isolation').length === 0, 'Shared answers escaped group')
    await c.auth.signOut({ scope: 'local' })
  }
  note('All three independent members receive 18/20 and shared answers; nonmembers are denied')
}
async function reviewSetup() {
  check(!state.reviewAssignmentId, 'Do not replace a review fixture')
  const q = state.questions.find(q => q.type === 'written').id
  must(await admin.from('questions').update({ solution_text: '<p>เฉลยจำลองของกลุ่ม: หนึ่งบวกหนึ่งเท่ากับสอง</p>' }).eq('id', q).eq('created_by', actor('admin').id), 'Set synthetic solution')
  state.reviewAssignmentId = randomUUID(); save()
  must(await admin.from('assignments').insert({ id: state.reviewAssignmentId, org_id: actor('admin').org, classroom_id: state.rooms[0].id,
    created_by: actor('admin').id, title: 'ทดสอบวิธีทำและเฉลยร่วมของกลุ่ม', type: 'exercise', mode: 'online', status: 'published',
    submission_mode: 'group', group_min_members: 3, group_max_members: 5, max_attempts: 1, completion_rule: 'fixed', score_strategy: 'latest',
    question_ids: [q], question_points: { [q]: 10 }, require_work_image: false, duration_minutes: null, shuffle_questions: false,
    shuffle_options: false, fullscreen_required: false, proctoring_enabled: false, secure_browser_mode: 'browser', android_exam_mode: 'blocked',
    show_results: 'immediate', show_solutions: true, instant_check: false }), 'Create isolated shared-review fixture')
  must(await admin.from('assignment_classrooms').insert({ assignment_id: state.reviewAssignmentId, classroom_id: state.rooms[0].id }), 'Attach review fixture')
  console.log(JSON.stringify({ reviewAssignmentId: state.reviewAssignmentId }))
  note('A separate group review fixture prepared without changing completed answers')
}
async function reviewArtifact() {
  check(state.reviewAssignmentId && !state.uploads?.length, 'Review fixture missing or already enriched')
  const submission = must(await admin.from('submissions').select('id,status,closed_at').eq('assignment_id', state.reviewAssignmentId).eq('student_id', actor('sender').id).single(), 'Read open review attempt')
  check(submission.status === 'in_progress' && !submission.closed_at, 'Never modify completed student evidence')
  const answer = must(await admin.from('submission_answers').select('id').eq('submission_id', submission.id).single(), 'Read exact review answer')
  const preview = `students/${actor('sender').id}/${submission.id}/${answer.id}/${randomUUID()}/preview.webp`
  const bytes = await sharp({ create: { width: 120, height: 60, channels: 4, background: '#a83ac3' } }).webp().toBuffer()
  state.uploads = [preview]; save()
  must(await admin.storage.from('math-work-artifacts').upload(preview, bytes, { contentType: 'image/webp', upsert: false }), 'Upload synthetic preview')
  must(await admin.from('student_work_artifacts').insert({ org_id: actor('admin').org, student_id: actor('sender').id,
    submission_answer_id: answer.id, part_key: 'answer', source_type: 'photo', preview_path: preview, preview_size_bytes: bytes.length,
    scene_path: null, scene_size_bytes: null, element_count: null }), 'Attach synthetic evidence to open attempt')
  note('Private synthetic preview attached while the attempt is open')
}
async function invalidGroups() {
  const works = must(await admin.from('assignments').select('id').eq('created_by', actor('admin').id).eq('submission_mode', 'group'), 'Read synthetic group work')
  check(works.length === 1, 'Expected one disposable group work')
  const source = must(await admin.from('submissions').select('id,answer_revision,status').eq('assignment_id', works[0].id).eq('student_id', actor('sender').id).single(), 'Read open representative attempt')
  check(source.status === 'in_progress', 'Only test rejected claims on the open synthetic attempt')
  const args = peers => ({ p_submission_id: source.id, p_student_id: actor('sender').id, p_classroom_id: state.rooms[0].id,
    p_peers: peers.map(p => actor(p).id), p_expected_revision: source.answer_revision })
  for (const [peers, message] of [[['peer1'], 'GROUP_RANGE'], [['peer1', 'peer1'], 'GROUP_ROSTER'],
    [['peer1', 'outsider'], 'GROUP_ROSTER'], [['peer1', 'peer2', 'peer3', 'nonmember', 'outsider'], 'GROUP_RANGE']]) {
    const r = await admin.rpc('claim_exercise_group_close', args(peers))
    check(r.error?.message.includes(message), 'Invalid group was not rejected: ' + message)
  }
  const c = client(); must(await c.auth.signInWithPassword({ email: actor('sender').email, password }), 'Authenticate representative')
  check((await c.rpc('claim_exercise_group_close', args(['peer1', 'peer2']))).error?.code === '42501', 'Student could invoke privileged close RPC')
  await c.auth.signOut({ scope: 'local' })
  check(must(await admin.from('exercise_group_members').select('student_id').eq('assignment_id', works[0].id), 'Read reservations').length === 0, 'Rejected claims left memberships')
  note('Undersized, oversized, duplicate and cross-class teams rejected atomically; privileged RPC denied to student')
}
async function cleanup() {
  const failures = []
  for (const row of state.accounts) {
    const u = must(await admin.auth.admin.getUserById(row.id), 'Check fixture provenance').user
    check(u?.email === row.email && u.user_metadata?.qa_run === state.run, 'Refuse cleanup outside synthetic run')
  }
  const assignments = must(await admin.from('assignments').select('id').eq('created_by', actor('admin').id), 'List disposable assignments')
  if (state.uploads?.length && (await admin.storage.from('math-work-artifacts').remove(state.uploads)).error) failures.push('private previews')
  if (assignments.length && (await admin.from('assignments').delete().in('id', assignments.map(a => a.id)).eq('created_by', actor('admin').id)).error) failures.push('assignments')
  for (const room of state.rooms) if ((await admin.from('classrooms').delete().eq('id', room.id).eq('teacher_id', actor('admin').id)).error) failures.push('classrooms')
  for (const q of state.questions) if ((await admin.from('questions').delete().eq('id', q.id).eq('created_by', actor('admin').id)).error) failures.push('questions')
  for (const row of [...state.accounts].reverse()) {
    const c = client(); const login = await c.auth.signInWithPassword({ email: row.email, password })
    if (login.error || (await c.auth.signOut({ scope: 'global' })).error) failures.push('sessions')
    if (row.org && (await admin.from('organizations').delete().eq('id', row.org)).error) failures.push('workspaces')
    if ((await admin.auth.admin.deleteUser(row.id)).error) failures.push('accounts')
  }
  check(failures.length === 0, 'Cleanup requires follow-up: ' + [...new Set(failures)].join(', '))
  state.cleaned = true; save(); note('All disposable Staging accounts, sessions and fixture data removed')
}
if (mode === 'setup') await setup()
else if (mode === 'snapshot') await snapshot()
else if (mode === 'verify') await verify()
else if (mode === 'invalid') await invalidGroups()
else if (mode === 'review-setup') await reviewSetup()
else if (mode === 'review-artifact') await reviewArtifact()
else if (mode === 'cleanup') await cleanup()
else if (mode === 'info') console.log(JSON.stringify({ run: state.run, accounts: state.accounts.map(({ label, email }) => ({ label, email })), rooms: state.rooms }, null, 2))
else throw Error('Use --mode=setup|snapshot|verify|cleanup|info')
