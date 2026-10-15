// Synthetic Staging-only fixtures. Never accepts a caller-supplied project URL.
// setup|resume|expire|verify|cleanup <keys-json> <private-manifest-json> [exam|exercise]
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID, randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
const [phase, keysPath, manifestPath, type = 'exam'] = process.argv.slice(2)
assert(['setup','resume','expire','verify','worker','cleanup'].includes(phase) && keysPath && manifestPath)
assert(['exam','exercise'].includes(type))
const ref = 'dyuxkrzeveknqgtuzpbh', url = `https://${ref}.supabase.co`
const keys = JSON.parse(readFileSync(keysPath, 'utf8'))
const key = name => keys.find(k => k.name === name)?.api_key
for (const name of ['anon','service_role']) assert.equal(JSON.parse(Buffer.from(key(name).split('.')[1], 'base64url')).ref, ref)
const admin = createClient(url, key('service_role'), { auth: { persistSession: false, autoRefreshToken: false } })
const must = (r, label) => { if (r.error) throw new Error(`${label}: ${r.error.code ?? 'request failed'}`); return r.data }
const save = state => writeFileSync(manifestPath, JSON.stringify(state), { mode: 0o600 })
if (phase === 'setup') {
  const state = { ref, run: `attempt-expiry-${randomUUID()}`, users: [], assignments: {}, rounds: {}, savedAnswers: {}, orgs: [] }
  save(state)
  for (const role of ['teacher','student']) {
    const email = `${role}-${state.run}@example.invalid`, password = `Qa1!${randomUUID()}`
    const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { full_name: `QA ${role}`, role, survey_role:role } }), 'create synthetic account')
    state[role] = { id: created.user.id, email, password }; state.users.push(created.user.id); save(state)
    must(await admin.from('users').update({ role, status: 'active', full_name: `QA ${role}` }).eq('id', created.user.id), 'fixture role')
    const orgs = must(await admin.from('organization_members').select('org_id').eq('user_id', created.user.id).eq('org_role','owner'), 'fixture orgs')
    state.orgs.push(...orgs.map(o => o.org_id))
    if (role === 'teacher') {
      state.org = orgs[0]?.org_id ?? must(await admin.from('organizations').insert({name:`QA ${state.run}`,is_personal:false}).select('id').single(),'fixture org').id
      if (!state.orgs.includes(state.org)) state.orgs.push(state.org)
    }
    save(state)
  }
  state.room = must(await admin.from('classrooms').insert({ teacher_id: state.teacher.id, org_id: state.org,
    name: `QA ${state.run}`, class_code: randomUUID().replaceAll('-','').slice(0,6).toUpperCase(), status:'active' }).select('id').single(), 'fixture classroom').id; save(state)
  must(await admin.from('classroom_students').insert({ classroom_id:state.room, student_id:state.student.id }), 'fixture roster')
  state.question = must(await admin.from('questions').insert({ created_by:state.teacher.id, org_id:state.org,
    title:'QA timed question', question_text:'เลือก 10', question_type:'mcq', variables:[], logic_rules:[],
    mcq_options:[{text:'10',is_correct:true},{text:'20',is_correct:false}], extra_data:{} }).select('id').single(), 'fixture question').id; save(state)
  for (const assignmentType of ['exam','exercise']) {
    const row = must(await admin.from('assignments').insert({ classroom_id:state.room, created_by:state.teacher.id, org_id:state.org,
      title:`QA ${state.run} ${assignmentType}`, type:assignmentType, mode:'online', status:'published',
      question_ids:[state.question], duration_minutes:30, max_attempts:3, shuffle_questions:false, shuffle_options:false,
      fullscreen_required:false, proctoring_enabled:false, secure_browser_mode:'browser', android_exam_mode:'blocked', show_results:'immediate' }).select('id').single(), 'fixture assignment')
    state.assignments[assignmentType] = row.id; save(state)
    must(await admin.from('assignment_classrooms').insert({ assignment_id:row.id, classroom_id:state.room }), 'fixture assignment room')
  }
  const cookies = new Map()
  const auth = createServerClient(url, key('anon'), { cookies: {
    getAll: () => [...cookies.values()].map(({name,value}) => ({name,value})),
    setAll: values => values.forEach(c => cookies.set(c.name,c)),
  } })
  const login = must(await auth.auth.signInWithPassword({ email:state.student.email, password:state.student.password }), 'synthetic login')
  state.accessToken = login.session.access_token; state.browserState = `${manifestPath}.browser.json`; save(state)
  writeFileSync(state.browserState, JSON.stringify({ cookies:[...cookies.values()].map(c => ({ name:c.name, value:c.value,
    domain:'localhost',path:'/',expires:-1,httpOnly:false,secure:false,sameSite:'Lax' })), origins:[] }), { mode:0o600 })
  const secret = randomBytes(32).toString('hex'); state.workerSecret = secret; save(state)
  writeFileSync('.env.local', `KORKRU_DEPLOYMENT_ENV=staging\nVERCEL_ENV=preview\nEXAM_QA_ENVIRONMENT=staging\nNEXT_PUBLIC_SITE_URL=https://staging.korkru.com\nEXAM_QA_PRODUCTION_SITE_URL=https://korkru.com\nNEXT_PUBLIC_SUPABASE_URL=${url}\nEXAM_QA_PRODUCTION_SUPABASE_URL=https://libsutfinswqkruihwdx.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${key('anon')}\nSUPABASE_SERVICE_ROLE_KEY=${key('service_role')}\nATTEMPT_FINALIZER_SECRET=${secret}\n`, {mode:0o600})
  console.log('PASS: isolated synthetic Staging fixtures and private browser state prepared')
} else {
  const state = JSON.parse(readFileSync(manifestPath,'utf8'))
  assert.equal(state.ref,ref); assert.match(state.run,/^attempt-expiry-[0-9a-f-]{36}$/)
  const rows = ['cleanup','worker'].includes(phase) ? [] : must(await admin.from('submissions').select('id,status,started_at,closed_at,total_score,submitted_at,attempt_number')
    .eq('assignment_id',state.assignments[type]).eq('student_id',state.student.id), 'fixture rounds')
  if (phase === 'resume' || phase === 'expire') {
    assert.equal(rows.length,1)
    state.rounds[type] = rows[0].id; save(state)
    if (phase === 'resume') {
      const answers = must(await admin.from('submission_answers').select('student_answer').eq('submission_id',rows[0].id),'saved fixture answer')
      assert.ok(answers[0]?.student_answer)
      state.savedAnswers[type] = answers[0].student_answer; save(state)
    }
    must(await admin.from('submissions').update({ started_at:new Date(Date.now()-(phase==='expire'?31*60:30*60-15)*1000).toISOString() }).eq('id',rows[0].id), 'fixture time control')
    console.log(`PASS: ${type} synthetic clock prepared for ${phase}`)
  } else if (phase === 'verify') {
    assert.equal(rows.length,1); assert.equal(rows[0].attempt_number,1)
    assert.ok(rows[0].closed_at)
    assert.equal(rows[0].status,'submitted'); assert.equal(Number(rows[0].total_score),1)
    assert.equal(rows[0].closed_at,rows[0].submitted_at)
    const answers = must(await admin.from('submission_answers').select('student_answer,score,is_correct').eq('submission_id',rows[0].id), 'fixture answers')
    assert.equal(answers.length,1)
    assert.equal(answers[0].student_answer,state.savedAnswers[type])
    const late = await admin.from('submission_answers').update({student_answer:'MCQ:1'}).eq('submission_id',rows[0].id)
    assert.equal(late.error?.code,'PT425')
    const outsider = await admin.rpc('claim_submission_close',{p_submission_id:rows[0].id,p_student_id:state.teacher.id,p_expired_only:true,p_expected_revision:null})
    assert.equal(outsider.error?.code,'42501')
    const anon = createClient(url,key('anon'),{auth:{persistSession:false}})
    assert.ok((await anon.rpc('close_expired_submission_attempts',{p_limit:1})).error)
    console.log(`PASS: ${type} closed, one original round, late-write/other-owner/direct-browser RPC rejection; status=${rows[0].status}`)
  } else if (phase === 'worker') {
    const endpoint = 'http://localhost:3011/api/internal/attempt-finalizer'
    assert.equal((await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer wrong-secret'}})).status,401)
    const results = await Promise.all([1,2].map(async () => {
      const response = await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${state.workerSecret}`}})
      assert.equal(response.status,200); return response.json()
    }))
    assert.ok(results.every(r => r.success && r.failed===0))
    console.log('PASS: worker rejects invalid auth and simultaneous authorized workers confirm grading idempotently')
  } else {
    must(await admin.from('assignments').delete().in('id',Object.values(state.assignments)), 'cleanup assignments')
    if(state.question) must(await admin.from('questions').delete().eq('id',state.question),'cleanup question')
    if(state.room) must(await admin.from('classrooms').delete().eq('id',state.room),'cleanup classroom')
    if(state.accessToken) await admin.auth.admin.signOut(state.accessToken,'global')
    for(const id of state.users) must(await admin.auth.admin.deleteUser(id),'cleanup synthetic account')
    for(const id of state.orgs) must(await admin.from('organizations').delete().eq('id',id),'cleanup personal org')
    console.log('PASS: this run’s synthetic Staging fixtures removed')
  }
}
