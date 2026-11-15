// Staging only: authenticated API contract, independent of the browser UI UAT.
// Supply the two Staging keys through a private env file or scoped environment.
// Never prints key values, JWTs, account details, request bodies, or files.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const site = 'https://staging.korkru.com'
const project = 'dyuxkrzeveknqgtuzpbh'
const db = `https://${project}.supabase.co`
const bucket = 'classroom-group-work'
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const check = (condition, label) => { if (!condition) throw new Error(label) }
function must(result, label) {
  check(!result.error, `${label} (${/^[0-9A-Z_]{3,12}$/.test(result.error?.code ?? '') ? result.error.code : 'request failed'})`)
  return result.data
}
function roleToken(value, kind) {
  if (kind === 'anon' && /^sb_publishable_[A-Za-z0-9_-]{18,}$/.test(value ?? '')) return true
  if (kind === 'service_role' && /^sb_secret_[A-Za-z0-9_-]{18,}$/.test(value ?? '')) return true
  try {
    const claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url'))
    return claims.ref === project && claims.role === kind
  } catch { return false }
}
if (process.argv.includes('--help')) {
  console.log('Staging only: node --env-file=/private/tmp/<private-env> scripts/verify-group-work-staging.mjs --confirm=synthetic-staging-group-work')
  process.exit(0)
}
check(process.argv.includes('--confirm=synthetic-staging-group-work')
  && process.env.NEXT_PUBLIC_SITE_URL === site && process.env.NEXT_PUBLIC_SUPABASE_URL === db
  && process.env.KORKRU_DEPLOYMENT_ENV === 'staging', 'Exact Staging confirmation, origin and project required')
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
check(roleToken(anon, 'anon') && roleToken(secret, 'service_role'), 'Staging credentials are absent or mismatched')
const admin = createClient(db, secret, options)
const run = randomUUID()
const room = randomUUID()
const outsideRoom = randomUUID()
const created = []
const uploaded = []
const createdRooms = []
let phase = 'Staging preflight'

async function account(label, role) {
  const email = `group-work-qa-${run}-${label}@qa.staging.korkru.com`
  const password = `Qa9!${randomUUID()}Ab3`
  const { user } = must(await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: `Group Work QA ${label}`, qa_run: run } }), 'Create synthetic identity')
  const row = { id: user.id, org: null, client: createClient(db, anon, options) }
  created.push(row)
  const memberships = must(await admin.from('organization_members').select('org_id,org_role').eq('user_id', row.id), 'Read synthetic org')
  check(memberships?.length === 1 && memberships[0].org_role === 'owner', 'Unexpected synthetic organization')
  row.org = memberships[0].org_id
  const profile = must(await admin.from('users').update({ role, status: 'active', survey_role: role, instructor_type: role === 'teacher' ? 'teacher' : null })
    .eq('id', row.id).select('id'), 'Set synthetic role')
  check(profile.length === 1, 'Synthetic profile missing')
  const login = must(await row.client.auth.signInWithPassword({ email, password }), 'Authenticate synthetic account')
  check(login.user.id === row.id, 'Synthetic login did not match')
  return row
}
function newRoom(id, owner) {
  return { id, teacher_id: owner.id, org_id: owner.org, name: `Group work QA ${run}`, description: 'Synthetic Staging only',
    class_code: randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase(), status: 'active', classroom_type: 'subject' }
}
const snapshot = (actor, work) => actor.client.rpc('classroom_group_work_page', { p_room: room, p_work: work })

try {
  const page = await fetch(`${site}/login`, { redirect: 'error' })
  check(page.ok && (await page.text()).includes('STAGING · ระบบทดสอบ'), 'Canonical site does not show the Staging badge')
  const probe = await admin.rpc('classroom_group_work_page', { p_room: room, p_work: null })
  check(probe.error?.code === '42501', 'Candidate schema or identity guard not found on Staging')
  phase = 'Synthetic Auth and enrollment'
  const owner = await account('teacher', 'teacher')
  const students = []
  for (const label of ['sender', 'peer-1', 'peer-2', 'peer-3', 'same-room-nonmember']) students.push(await account(label, 'student'))
  const [author, ...others] = students
  const [peer1, peer2, peer3, nonMember] = others
  const foreign = await account('other-room', 'student')
  for (const id of [room, outsideRoom]) {
    must(await admin.from('classrooms').insert(newRoom(id, owner)), 'Create scoped classroom')
    createdRooms.push(id)
  }
  must(await admin.from('classroom_students').insert([
    ...students.map(s => ({ classroom_id: room, student_id: s.id })),
    { classroom_id: outsideRoom, student_id: foreign.id },
  ]), 'Enroll synthetic students')

  phase = 'Create authenticated group assignment'
  const work = must(await owner.client.rpc('create_classroom_group_work', {
    p_room: room, p_title: `Group QA ${run}`, p_instructions: 'ข้อมูลสมมติ', p_mode: 'group',
    p_min: 3, p_max: 5, p_score: 20, p_due: null,
  }), 'Create work as teacher')
  const initial = must(await snapshot(author, work), 'Open work as student')
  check(initial.roster.length === students.length && !initial.roster.some(s => s.id === foreign.id), 'Roster escaped classroom')
  check((await snapshot(foreign, work)).error?.code === '42501', 'Cross-class work lookup not denied')

  phase = 'Private Storage and group submission'
  const token = randomUUID(), path = `${work}/${author.id}/${token}`
  const pdf = await fetch(`${site}/exam-screen-lab/grading-workspace/assets/file-0.pdf`, { redirect: 'error' })
  check(pdf.ok, 'Synthetic PDF fixture unavailable')
  must(await author.client.rpc('reserve_classroom_group_work_uploads', { p_work: work, p_tokens: [token] }), 'Reserve upload')
  must(await author.client.storage.from(bucket).upload(path, await pdf.blob(), { contentType: 'application/pdf', upsert: false }), 'Upload one PDF')
  uploaded.push(path)
  const receipt = randomUUID()
  const submit = (actor, id, peers) => actor.client.rpc('submit_classroom_group_work', {
    p_work: work, p_request_id: id, p_peers: peers, p_response: 'คำตอบพร้อม PDF', p_files: actor === author ? [{ path, name: 'Report.pdf' }] : [],
  })
  check((await submit(author, receipt, [peer1.id])).error?.code === '22023', 'Undersized group not rejected')
  check((await submit(author, receipt, [peer1.id, foreign.id])).error?.code === '22023', 'Cross-class membership not rejected')
  check(must(await submit(author, receipt, [peer1.id, peer2.id, peer3.id]), 'Submit as representative') === receipt, 'Wrong receipt')
  check(must(await submit(author, receipt, [peer1.id, peer2.id, peer3.id]), 'Replay lost receipt') === receipt, 'Duplicate receipt')
  check((await submit(nonMember, randomUUID(), [peer1.id, peer2.id])).error?.code === '23505', 'Overlapping group not rejected')
  check(Boolean((await nonMember.client.storage.from(bucket).download(path)).error), 'Non-member could download a group file')
  const file = must(await owner.client.storage.from(bucket).download(path), 'Teacher reads PDF')
  check((await file.slice(0, 5).text()) === '%PDF-', 'Teacher download is not a PDF')

  phase = 'Draft confidentiality and publish to all accounts'
  const group = [author, peer1, peer2, peer3]
  const grade = (score, publish, revision) => owner.client.rpc('grade_classroom_group_work', {
    p_work: work, p_submission: receipt, p_score: score, p_feedback: 'ข้อเสนอแนะตัวอย่าง', p_publish: publish, p_revision: revision,
  })
  const revision = must(await grade(16, false, 0), 'Save private draft')
  for (const student of group) {
    const result = must(await snapshot(student, work), 'Read draft-period student view')
    check(result.submissions.length === 1 && result.submissions[0].draft_score == null && result.submissions[0].published_score == null, 'Draft visible to a student')
  }
  must(await grade(18, true, revision), 'Publish one score')
  for (const student of group) {
    const result = must(await snapshot(student, work), 'Read published student view')
    check(result.submissions.length === 1 && result.submissions[0].id === receipt && result.submissions[0].members.length === 4
      && result.submissions[0].published_score === 18, 'A member did not receive the same score')
  }
  check(must(await snapshot(nonMember, work), 'Read non-member view').submissions.length === 0, 'Non-member saw another group outcome')
  console.log('PASS: authenticated Staging API, one shared submission, private PDF, and the same published score for all 4 members.')
} catch (error) {
  console.error(`FAIL: ${phase}: ${error instanceof Error ? error.message : 'unknown'}`)
  process.exitCode = 1
} finally {
  const failures = []
  try {
    if (uploaded.length && (await admin.storage.from(bucket).remove(uploaded)).error) failures.push('files')
    if (createdRooms.length && (await admin.from('classrooms').delete().in('id', createdRooms).eq('name', `Group work QA ${run}`)).error) failures.push('classrooms')
    for (const row of created.reverse()) {
      if (row.org && (await admin.from('organizations').delete().eq('id', row.org)).error) failures.push('organizations')
      if ((await admin.auth.admin.deleteUser(row.id)).error) failures.push('auth accounts')
    }
  } catch { failures.push('cleanup interrupted') }
  if (failures.length) { console.error(`Staging cleanup requires follow-up (${[...new Set(failures)].join(', ')}); run tag ${run}`); process.exitCode = 1 }
}
