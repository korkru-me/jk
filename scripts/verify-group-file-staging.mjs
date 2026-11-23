// Disposable, explicitly scoped fixtures for manual hosted group-file UAT.
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import sharp from 'sharp'

const ref = 'dyuxkrzeveknqgtuzpbh', site = 'https://staging.korkru.com'
const statePath = '/private/tmp/group-file-release-fixture.json'
if (!process.argv.includes('--confirm=synthetic-staging-group-file')) throw Error('Exact Staging fixture confirmation required')
const mode = process.argv.find(x => x.startsWith('--mode='))?.slice(7)
const actorLabel = process.argv.find(x => x.startsWith('--actor='))?.slice(8)
const expectedFiles = Number(process.argv.find(x => x.startsWith('--expect-files='))?.slice(15) ?? 2)
checkExpectedFiles()
function checkExpectedFiles() { if (![0, 2].includes(expectedFiles)) throw Error('Expected file count must be 0 or 2') }
const keys = JSON.parse(readFileSync('/private/tmp/group-file-release-staging-keys.json', 'utf8'))
const key = name => keys.find(row => row.id === name)?.api_key
for (const role of ['anon', 'service_role']) {
  const claims = JSON.parse(Buffer.from(key(role).split('.')[1], 'base64url'))
  if (claims.ref !== ref || claims.role !== role) throw Error('Wrong credential scope')
}
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(`https://${ref}.supabase.co`, key('service_role'), opts)
const client = () => createClient(`https://${ref}.supabase.co`, key('anon'), opts)
const must = (result, label) => { if (result.error) throw Error(`${label}: ${result.error.code ?? ''} ${result.error.message}`); return result.data }
const check = (value, label) => { if (!value) throw Error(label) }
let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { ref, site, run: randomUUID(), accounts: [], rooms: [], questions: [] }
check(state.ref === ref && state.site === site, 'Wrong fixture scope')
const save = () => { writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 }); chmodSync(statePath, 0o600) }
const actor = label => state.accounts.find(row => row.label === label)
const password = `GroupFileQa!${state.run}`
async function account(label, role, name) {
  const email = `group-file-${state.run}-${label}@qa.staging.korkru.com`
  const { user } = must(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name, qa_run: state.run } }), 'Create synthetic account')
  const row = { id: user.id, label, email, name, role }; state.accounts.push(row); save()
  const orgs = must(await admin.from('organization_members').select('org_id,org_role').eq('user_id', row.id), 'Read own workspace')
  check(orgs.length === 1 && orgs[0].org_role === 'owner', 'Workspace provenance')
  row.org = orgs[0].org_id; save()
  must(await admin.from('users').update({ role, status: 'active', full_name: name, survey_role: role === 'admin' ? 'teacher' : role, instructor_type: role === 'student' ? null : 'teacher' }).eq('id', row.id), 'Configure synthetic profile')
  return row
}
async function setup() {
  check(!existsSync(statePath), 'Never replace a previous run'); save()
  const owner = await account('admin', 'admin', 'แอดมินทดสอบ งานไฟล์กลุ่ม')
  const teacher = await account('teacher', 'teacher', 'ครูทดสอบ งานไฟล์กลุ่ม')
  for (const [label, name] of [['sender', 'ตัวแทนทดสอบ'], ['peer1', 'สมาชิกทดสอบ หนึ่ง'], ['peer2', 'สมาชิกทดสอบ สอง'], ['peer3', 'สมาชิกทดสอบ สาม'], ['nonmember', 'นักเรียนทดสอบ นอกกลุ่ม'], ['outsider', 'นักเรียนทดสอบ ต่างห้อง']]) await account(label, 'student', name)
  for (const label of ['main', 'outside']) {
    const id = randomUUID(); state.rooms.push({ id, label }); save()
    must(await admin.from('classrooms').insert({ id, org_id: owner.org, teacher_id: owner.id, name: `ทดสอบงานไฟล์กลุ่ม ${label} ${state.run.slice(0, 8)}`, description: `Synthetic Staging ${state.run}`, class_code: randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase(), classroom_type: 'subject', status: 'active' }), 'Create synthetic room')
  }
  must(await admin.from('classroom_co_teachers').insert({ classroom_id: state.rooms[0].id, user_id: teacher.id, permission: 'manage', invited_by: owner.id }), 'Enroll manager')
  must(await admin.from('classroom_students').insert(state.accounts.filter(row => row.role === 'student').map(row => ({ classroom_id: state.rooms[row.label === 'outsider' ? 1 : 0].id, student_id: row.id }))), 'Enroll synthetic roster')
  const id = randomUUID(); state.questions.push({ id }); save()
  must(await admin.from('questions').insert({ id, org_id: owner.org, created_by: owner.id, visibility: 'private', title: 'โจทย์ทดสอบงานกลุ่ม 1 + 1', question_text: '<p>1 + 1 เท่ากับเท่าไร</p>', question_type: 'written', variables: [], logic_rules: [], answer_formula: '2', answer_tolerance: 0.01, extra_data: {}, requires_work_image: false, team_edit_allowed: true }), 'Create disposable bank question')
  console.log('PASS: eight synthetic identities, two rooms and one bank question prepared')
}
async function login() {
  const row = actor(actorLabel); check(row && !state.cleaned, 'Unknown/cleaned fixture actor')
  const cookies = []
  const c = createServerClient(`https://${ref}.supabase.co`, key('anon'), { cookies: { getAll: () => [], setAll: values => cookies.push(...values) } })
  must(await c.auth.signInWithPassword({ email: row.email, password }), 'Authenticate synthetic actor')
  const path = `/private/tmp/group-file-release-auth-${actorLabel}.json`
  writeFileSync(path, JSON.stringify({ cookies: cookies.map(({ name, value }) => ({ name, value, domain: 'staging.korkru.com', path: '/', secure: true, httpOnly: false, sameSite: 'Lax', expires: -1 })), origins: [] }), { mode: 0o600 }); chmodSync(path, 0o600)
  console.log('Synthetic browser state prepared for ' + actorLabel)
}
async function snapshot() {
  const works = must(await admin.from('assignments').select('id,title,type,status,submission_mode,group_min_members,group_max_members,question_ids,question_points').in('created_by', [actor('admin').id, actor('teacher').id]), 'Read run work')
  const ids = works.map(row => row.id); state.assignmentIds = ids;
  state.browserUploadAssignmentId = works.find(row => row.title === `ทดสอบแนบผ่าน Chrome Staging ${state.run.slice(0, 8)}`)?.id ?? state.browserUploadAssignmentId; save()
  const submissions = ids.length ? must(await admin.from('submissions').select('id,assignment_id,student_id,status,total_score,max_score,group_source_submission_id,answer_revision').in('assignment_id', ids), 'Read run receipts') : []
  const answers = submissions.length ? must(await admin.from('submission_answers').select('id,submission_id,question_id,student_answer,score').in('submission_id', submissions.map(row => row.id)), 'Read run answers') : []
  const members = ids.length ? must(await admin.from('exercise_group_members').select('assignment_id,submission_id,student_id').in('assignment_id', ids), 'Read run members') : []
  console.log(JSON.stringify({ rooms: state.rooms, works, submissions: submissions.map(row => ({ ...row, actor: state.accounts.find(a => a.id === row.student_id)?.label })), answers, members }, null, 2))
}
async function verify() {
  const work = must(await admin.from('assignments').select('id,submission_mode,group_min_members,group_max_members,question_ids').eq('created_by', actor('admin').id), 'Read run group work')
  const group = expectedFiles === 2 ? work.find(row => row.id === (state.browserUploadAssignmentId ?? state.fileUploadAssignmentId))
    : work.find(row => row.submission_mode === 'group' && row.id !== state.fileUploadAssignmentId && !row.question_ids.includes(state.questions[0].id))
  check(group?.group_min_members === 3 && group.group_max_members === 5, 'File group bounds')
  const rows = must(await admin.from('submissions').select('*').eq('assignment_id', group.id), 'Read group receipts')
  const source = rows.find(row => row.student_id === actor('sender').id)
  for (const label of ['sender', 'peer1', 'peer2']) {
    const row = rows.find(r => r.student_id === actor(label).id)
    check(row?.status === 'graded' && row.total_score === 8 && row.max_score === 10, 'Wrong grade for ' + label)
    if (label !== 'sender') check(row.group_source_submission_id === source.id, 'Wrong answer source')
    const c = client(); must(await c.auth.signInWithPassword({ email: actor(label).email, password }), 'Authenticate independent member')
    const answers = must(await c.from('submission_answers').select('id,student_answer,score').eq('submission_id', source.id), 'Read own group answers')
    check(answers.length === 1 && answers[0].score === 8, 'Shared answer/grade not visible')
    const response = JSON.parse(answers[0].student_answer)
    check(response.version === 1 && response.text.includes('ทดสอบ') && response.link.startsWith('https://') && response.files.length === expectedFiles, 'Mixed response was lost')
    await c.auth.signOut({ scope: 'local' })
  }
  for (const label of ['nonmember', 'outsider']) {
    const c = client(); must(await c.auth.signInWithPassword({ email: actor(label).email, password }), 'Authenticate isolated student')
    check(must(await c.from('submission_answers').select('id').eq('submission_id', source.id), 'Read denied answers').length === 0, 'Answers escaped group')
    await c.auth.signOut({ scope: 'local' })
  }
  console.log('PASS: all three independent members receive 8/10 and one mixed response; unrelated students denied')
  const bank = work.find(row => row.submission_mode === 'group' && row.question_ids.includes(state.questions[0].id))
  if (bank) {
    const receipts = must(await admin.from('submissions').select('student_id,status,total_score,max_score').eq('assignment_id', bank.id), 'Read bank exercise regression')
    check(receipts.length === 3 && receipts.every(row => ['submitted', 'graded'].includes(row.status) && row.total_score === 10 && row.max_score === 10), 'Bank group score regression')
    console.log('PASS: bank-question group exercise gives all three members 10/10')
  }
}
function samplePdf() {
  const content = 'BT /F1 14 Tf 20 60 Td (Synthetic Staging group file) Tj ET'
  const objects = ['<</Type /Catalog /Pages 2 0 R>>', '<</Type /Pages /Kids [3 0 R] /Count 1>>', '<</Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Resources <</Font <</F1 4 0 R>>>> /Contents 5 0 R>>', '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>', `<</Length ${content.length}>>\nstream\n${content}\nendstream`]
  let pdf = '%PDF-1.4\n'; const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const start = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n${start}\n%%EOF\n`
  return Buffer.from(pdf)
}
async function fileFixtures() {
  check(!state.fileUploadAssignmentId, 'Do not replace file fixtures')
  const works = must(await admin.from('assignments').select('id,question_ids,title').eq('created_by', actor('admin').id).eq('submission_mode', 'group'), 'Read disposable file case')
  const work = works.find(row => row.title === `ทดสอบ PDF และรูปจริง Staging ${state.run.slice(0, 8)}`)
  check(work?.question_ids.length === 1, 'Exact disposable file case required')
  const question = must(await admin.from('questions').select('id,extra_data').eq('id', work.question_ids[0]).single(), 'Read fixture prompt provenance')
  check(question.extra_data?.file_assignment_id === work.id, 'Not standalone file work')
  const sub = must(await admin.from('submissions').select('id,status,closed_at').eq('assignment_id', work.id).eq('student_id', actor('sender').id).single(), 'Read open synthetic attempt')
  check(sub.status === 'in_progress' && !sub.closed_at, 'Never seed closed work')
  const answer = must(await admin.from('submission_answers').select('id,student_answer').eq('submission_id', sub.id).eq('question_id', question.id).single(), 'Read exact synthetic answer')
  check(!answer.student_answer || answer.student_answer === '[]', 'Never replace existing response')
  state.fileUploadAssignmentId = work.id; state.fileFixturePaths = []; save()
  const c = client(); must(await c.auth.signInWithPassword({ email: actor('sender').email, password }), 'Authenticate synthetic uploader')
  const samples = [
    { name: 'staging-group.pdf', type: 'application/pdf', extension: 'pdf', bytes: samplePdf() },
    { name: 'staging-group.png', type: 'image/png', extension: 'png', bytes: await sharp({ create: { width: 180, height: 90, channels: 4, background: '#af39c1' } }).png().toBuffer() },
  ]
  const files = []
  for (const sample of samples) {
    const path = `${actor('sender').id}/${sub.id}/${answer.id}/${randomUUID()}.${sample.extension}`
    state.fileFixturePaths.push(path); save()
    const signed = must(await admin.storage.from('submission-files').createSignedUploadUrl(path), 'Authorize disposable fixture path')
    must(await c.storage.from('submission-files').uploadToSignedUrl(path, signed.token, sample.bytes, { contentType: sample.type }), 'Upload actual synthetic file')
    const url = admin.storage.from('submission-files').getPublicUrl(path).data.publicUrl
    const response = await fetch(url)
    check(response.ok, 'Uploaded file not readable')
    const bytes = Buffer.from(await response.arrayBuffer())
    check(bytes.equals(sample.bytes), 'Uploaded fixture bytes changed')
    files.push({ url, name: sample.name, type: sample.type })
  }
  // Legacy saved-file fixture only. The browser reloads, adds text/link and
  // saves/submits through deployed Server Actions; all finalization, storage
  // validation, teacher review and group receipts remain the real app path.
  must(await admin.from('submission_answers').update({ student_answer: JSON.stringify(files) }).eq('id', answer.id).eq('submission_id', sub.id), 'Seed saved-file compatibility fixture')
  await c.auth.signOut({ scope: 'local' })
  console.log('PASS: real PDF and PNG uploaded through signed Staging targets, bytes verified, saved-file fixture ready for UI')
}
async function invalid() {
  const work = must(await admin.from('assignments').select('id').eq('created_by', actor('admin').id).eq('submission_mode', 'group'), 'Find disposable group')
  check(work.length === 1, 'Exact group required')
  const source = must(await admin.from('submissions').select('id,status,answer_revision').eq('assignment_id', work[0].id).eq('student_id', actor('sender').id).single(), 'Read open representative attempt')
  check(source.status === 'in_progress', 'Never probe a completed attempt')
  const args = labels => ({ p_submission_id: source.id, p_student_id: actor('sender').id, p_classroom_id: state.rooms[0].id, p_peers: labels.map(label => actor(label).id), p_expected_revision: source.answer_revision })
  for (const [labels, expected] of [[['peer1'], 'GROUP_RANGE'], [['peer1', 'peer1'], 'GROUP_ROSTER'], [['peer1', 'outsider'], 'GROUP_ROSTER'], [['peer1', 'peer2', 'peer3', 'nonmember', 'outsider'], 'GROUP_RANGE']]) {
    const result = await admin.rpc('claim_exercise_group_close', args(labels))
    check(result.error?.message.includes(expected), 'Invalid group accepted: ' + expected)
  }
  const c = client(); must(await c.auth.signInWithPassword({ email: actor('sender').email, password }), 'Authenticate RPC probe')
  check((await c.rpc('claim_exercise_group_close', args(['peer1', 'peer2']))).error?.code === '42501', 'Privileged RPC accessible to student')
  await c.auth.signOut({ scope: 'local' })
  check(must(await admin.from('exercise_group_members').select('student_id').eq('assignment_id', work[0].id), 'Check no failed reservation').length === 0, 'Rejected group left a reservation')
  console.log('PASS: too few/many, duplicate and cross-class peers rejected atomically; privileged RPC denied')
}
async function cleanup() {
  check(!state.cleaned, 'Run already cleaned')
  for (const row of state.accounts) {
    const { user } = must(await admin.auth.admin.getUserById(row.id), 'Verify cleanup provenance')
    check(user.email === row.email && user.user_metadata?.qa_run === state.run, 'Cleanup scope mismatch')
  }
  const works = must(await admin.from('assignments').select('id,question_ids').in('created_by', [actor('admin').id, actor('teacher').id]), 'List run assignments')
  const ids = works.map(row => row.id)
  const subs = ids.length ? must(await admin.from('submissions').select('id,student_id').in('assignment_id', ids), 'List run attempts') : []
  const paths = []
  for (const sub of subs) {
    check(state.accounts.some(row => row.id === sub.student_id), 'Storage owner outside run')
    const prefix = `${sub.student_id}/${sub.id}`
    const folders = must(await admin.storage.from('submission-files').list(prefix, { limit: 1000 }), 'List synthetic answer folders')
    for (const folder of folders) {
      check(/^[0-9a-f-]{36}$/i.test(folder.name) && !folder.id, 'Unexpected synthetic storage layout')
      const files = must(await admin.storage.from('submission-files').list(`${prefix}/${folder.name}`, { limit: 1000 }), 'List synthetic uploads')
      for (const file of files) {
        check(/^[0-9a-f-]{36}\.(pdf|png|jpe?g|webp)$/i.test(file.name) && file.id, 'Unexpected upload name')
        paths.push(`${prefix}/${folder.name}/${file.name}`)
      }
    }
  }
  if (paths.length) must(await admin.storage.from('submission-files').remove(paths), 'Remove synthetic uploads')
  if (ids.length) must(await admin.from('assignments').delete().in('id', ids).in('created_by', [actor('admin').id, actor('teacher').id]), 'Remove run assignments')
  for (const room of state.rooms) must(await admin.from('classrooms').delete().eq('id', room.id).eq('teacher_id', actor('admin').id), 'Remove run room')
  const questions = [...state.questions.map(row => row.id), ...works.flatMap(row => row.question_ids)]
  if (questions.length) must(await admin.from('questions').delete().in('id', questions).in('created_by', [actor('admin').id, actor('teacher').id]), 'Remove run questions')
  for (const row of [...state.accounts].reverse()) {
    const c = client(); must(await c.auth.signInWithPassword({ email: row.email, password }), 'Revoke fixture sessions'); must(await c.auth.signOut({ scope: 'global' }), 'Sign out fixture')
    must(await admin.from('organizations').delete().eq('id', row.org), 'Remove run workspace')
    must(await admin.auth.admin.deleteUser(row.id), 'Remove run account')
  }
  for (const [table, values] of [['users', state.accounts.map(row => row.id)], ['organizations', state.accounts.map(row => row.org)], ['classrooms', state.rooms.map(row => row.id)], ['assignments', ids], ['questions', questions]]) {
    if (values.length) check(must(await admin.from(table).select('id').in('id', values), 'Verify cleanup').length === 0, 'Rows remain in ' + table)
  }
  state.cleaned = true; save(); console.log('PASS: synthetic accounts, sessions, rooms, assignments, questions and referenced uploads removed')
}
if (mode === 'setup') await setup()
else if (mode === 'login') await login()
else if (mode === 'snapshot') await snapshot()
else if (mode === 'verify') await verify()
else if (mode === 'invalid') await invalid()
else if (mode === 'file-fixtures') await fileFixtures()
else if (mode === 'local-files') {
  writeFileSync('/private/tmp/group-file-chrome.pdf', samplePdf())
  writeFileSync('/private/tmp/group-file-chrome.png', await sharp({ create: { width: 180, height: 90, channels: 4, background: '#af39c1' } }).png().toBuffer())
  console.log('Synthetic local PDF/PNG ready for browser file chooser')
}
else if (mode === 'cleanup') await cleanup()
else throw Error('Use --mode=setup|login|snapshot|verify|cleanup')
