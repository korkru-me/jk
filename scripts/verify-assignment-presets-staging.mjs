// Manual integration gate. Only the named, separate Staging project; synthetic
// accounts created by THIS process. No Production keys, rows or file exports.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function cli(args) {
  try { return JSON.parse(execFileSync('supabase', [...args, '--output', 'json', '--agent', 'no'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })) }
  catch { throw Error('Staging CLI check failed') }
}
function assert(condition, label) { if (!condition) throw Error(label) }
const projects = cli(['projects', 'list'])
const project = projects.find(item => item.name === 'Korkru Staging')
assert(project && project.id !== readFileSync('supabase/.temp/project-ref', 'utf8').trim(), 'Target is not separate Staging')
const keys = cli(['projects', 'api-keys', '--project-ref', project.id])
const anon = keys.find(item => item.name === 'anon')?.api_key
const service = keys.find(item => item.name === 'service_role')?.api_key
assert(anon && service, 'Staging keys unavailable')
const url = `https://${project.id}.supabase.co`
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, service, options)
const fixtures = []
const run = randomUUID()
let verified = false

const settings = {
  duration_minutes: 45, shuffle_questions: true, shuffle_options: false, shared_random_values: true,
  show_results: 'score_only', show_solutions: false, max_attempts: 3,
  score_strategy: 'average', retry_scope: 'all', questions_per_page: 4,
  instant_check: true, instant_check_answer_key: false, calculator_enabled: true,
  scratchpad_enabled: true, proctoring_enabled: false, fullscreen_required: false,
  block_clipboard: false, exam_watermark_enabled: false, secure_browser_mode: 'browser',
  android_exam_mode: 'blocked', completion_rule: 'fixed', streak_target: 5,
  streak_question_cap: 30, streak_recycle_pool: true, passing_type: null,
  passing_value: null, random_question_count: 5, display_max_score: 10,
  show_question_sections: true, require_work_image: false,
}
async function account(role) {
  const password = `QAx!${randomUUID()}Aa9`
  const email = `preset-qa-${run}-${role}-${fixtures.length}@example.test`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: `Preset QA ${role} ${run}`, qa_run: run } })
  assert(!created.error && created.data.user, 'Synthetic account creation failed')
  const id = created.data.user.id
  const fixture = { id, orgs: [], membershipVerified: false, client: createClient(url, anon, options) }
  fixtures.push(fixture)
  const membership = await admin.from('organization_members').select('org_id, org_role').eq('user_id', id)
  assert(!membership.error, 'Synthetic membership read failed')
  for (const member of membership.data) {
    assert(member.org_role === 'owner', 'Unexpected synthetic membership')
    fixture.orgs.push(member.org_id)
  }
  assert(fixture.orgs.length === 1, 'Unexpected synthetic organization count')
  fixture.membershipVerified = true
  const profile = await admin.from('users').update({ role, status: 'active' }).eq('id', id).select('id')
  assert(!profile.error && profile.data.length === 1, 'Synthetic role setup failed')
  const login = await fixture.client.auth.signInWithPassword({ email, password })
  assert(!login.error && login.data.user?.id === id, 'Synthetic login failed')
  return fixture
}
async function rpc(client, action, { type = 'exercise', id = null, name = null, config = null, revision = null } = {}) {
  return client.rpc('mutate_assignment_setting_preset', {
    p_type: type, p_action: action, p_id: id, p_name: name,
    p_settings: config, p_expected_revision: revision,
  })
}
try {
  const a = await account('teacher')
  const b = await account('teacher')
  const student = await account('student')
  const administrator = await account('admin')
  console.log('Staging: four synthetic accounts authenticated')
  const created = await rpc(a.client, 'create', { name: 'Round trip', config: settings })
  assert(!created.error && created.data, 'Authenticated create failed')
  const id = created.data
  const row = await a.client.from('assignment_setting_presets').select('*').eq('id', id).single()
  assert(!row.error && row.data.owner_id === a.id && row.data.settings.duration_minutes === 45
    && row.data.settings.random_question_count === 5 && row.data.settings.display_max_score === 10, 'Settings round trip failed')
  for (const foreign of [b, student, administrator]) {
    const hidden = await foreign.client.from('assignment_setting_presets').select('id').eq('id', id)
    assert(!hidden.error && hidden.data.length === 0, 'Foreign preset readable')
    assert((await rpc(foreign.client, 'delete', { id, revision: 1 })).error, 'Foreign delete allowed')
    assert((await rpc(foreign.client, 'default', { id, revision: 1 })).error, 'Foreign default allowed')
  }
  const anonymous = createClient(url, anon, options)
  assert((await rpc(anonymous, 'create', { name: 'Anonymous', config: settings })).error, 'Anonymous write allowed')
  assert((await rpc(student.client, 'create', { name: 'Student', config: settings })).error, 'Student write allowed')
  assert((await a.client.from('assignment_setting_presets').update({ name: 'Direct' }).eq('id', id)).error, 'Direct browser write allowed')
  assert((await rpc(a.client, 'create', { name: 'Secret', config: { ...settings, access_code: 'LAB ONLY' } })).error, 'Secret field accepted')
  assert(!(await rpc(a.client, 'default', { id, revision: 1 })).error, 'Default selection failed')
  const preference = await a.client.from('assignment_setting_preset_preferences').select('default_preset_id').single()
  assert(!preference.error && preference.data.default_preset_id === id, 'Default preference not persisted')
  const edits = await Promise.all([
    rpc(a.client, 'rename', { id, name: 'Editor A', revision: 1 }),
    rpc(a.client, 'rename', { id, name: 'Editor B', revision: 1 }),
  ])
  console.log(`Staging CAS results: ${JSON.stringify(edits.map(result => ({status: result.status,
    errorCode: result.error?.code ?? null, staleMessage: result.error?.message?.includes('preset_stale_revision') ?? false,
    dataType: typeof result.data, returnedIdMatches: result.data === id,
    errorKeys: result.error ? Object.keys(result.error) : []})))}`)
  const afterRace = await a.client.from('assignment_setting_presets').select('revision, name').eq('id', id).single()
  console.log(`Staging CAS persisted: revision ${afterRace.data?.revision ?? 'unreadable'}, candidate ${['Editor A', 'Editor B'].includes(afterRace.data?.name)}`)
  assert(edits.filter(result => !result.error && result.status === 200 && result.data === id).length === 1
    && edits.filter(result => result.status === 409 && result.error?.code === 'PT409').length === 1
    && !afterRace.error && afterRace.data.revision === 2, 'Concurrent CAS failed')
  const creates = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    rpc(a.client, 'create', { name: `Race ${i}`, config: settings })))
  assert(creates.filter(result => !result.error).length === 2
    && creates.filter(result => result.error?.code === 'P0001').length === 3, 'Concurrent quota failed')
  const exercise = await a.client.from('assignment_setting_presets').select('id').eq('assignment_type', 'exercise')
  assert(!exercise.error && exercise.data.length === 3, 'Quota did not remain at three')
  for (let i = 0; i < 3; i++) assert(!(await rpc(a.client, 'create', { type: 'exam', name: `Exam ${i}`, config: settings })).error, 'Separate exam quota failed')
  assert((await rpc(a.client, 'create', { type: 'exam', name: 'Exam fourth', config: settings })).error?.code === 'P0001', 'Exam fourth accepted')
  assert((await rpc(a.client, 'default', { type: 'exam', id, revision: 2 })).error, 'Cross-type default accepted')
  assert(!(await rpc(a.client, 'delete', { id, revision: 2 })).error, 'Own deletion failed')
  const cleared = await a.client.from('assignment_setting_preset_preferences').select('default_preset_id')
  assert(!cleared.error && cleared.data.length === 0, 'Deleted default not cleared')
  verified = true
  console.log('PASS: Staging authenticated roundtrip, private RLS, 3+3 quota, secret rejection, default/delete and separate-connection CAS/quota races')
} catch (error) {
  console.log(`FAIL: ${error instanceof Error ? error.message : 'Staging integration failed'}`)
} finally {
  let cleanupComplete = true
  for (const fixture of fixtures.reverse()) {
    await fixture.client.auth.signOut().catch(() => undefined)
    // Preserve the synthetic account if setup could not resolve its exact
    // organization. Deleting Auth first would hide an orphaned organization.
    if (!fixture.membershipVerified) { cleanupComplete = false; continue }
    for (const org of fixture.orgs) {
      const members = await admin.from('organization_members').select('user_id, org_role').eq('org_id', org)
      if (members.error || members.data.length !== 1 || members.data[0].user_id !== fixture.id || members.data[0].org_role !== 'owner') {
        cleanupComplete = false
        continue
      }
      const removed = await admin.from('organizations').delete().eq('id', org)
      if (removed.error) cleanupComplete = false
    }
    const removed = await admin.auth.admin.deleteUser(fixture.id)
    if (removed.error) cleanupComplete = false
    const remaining = await admin.from('assignment_setting_presets').select('id').eq('owner_id', fixture.id)
    if (remaining.error || remaining.data.length !== 0) cleanupComplete = false
  }
  console.log(cleanupComplete ? 'PASS: synthetic Staging fixtures cleaned up' : 'FAIL: synthetic cleanup needs inspection')
  process.exitCode = verified && cleanupComplete ? 0 : 1
}
