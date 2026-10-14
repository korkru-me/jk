// Explicitly approved Staging-only synthetic QA. No production reads or writes.
// node scripts/qa/student-profile-announcements.mjs setup|probe|cleanup <keys-json> <manifest-json>
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
const [phase, keysPath, manifestPath] = process.argv.slice(2)
if (!['setup','probe','cleanup'].includes(phase) || !keysPath || !manifestPath) throw new Error('Missing explicit QA phase/paths')
const ref = 'dyuxkrzeveknqgtuzpbh', url = `https://${ref}.supabase.co`
const keys = JSON.parse(readFileSync(keysPath,'utf8'))
const key = name => keys.find(k => k.name === name)?.api_key
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url,key('service_role'),options)
const must = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.code ?? 'request failed'}`); return result.data }
const rpc = async (name, args) => must(await admin.rpc(name,args),name)
const save = state => writeFileSync(manifestPath,JSON.stringify(state),{mode:0o600})
if (phase === 'setup') {
  const run = `student-ui-${randomUUID()}`
  const state = { ref, run, users: {}, orgs: [], rooms: [], posts: [] }
  save(state)
  const orgA=must(await admin.from('organizations').insert({name:`QA ${run}`,is_personal:false}).select('id').single(),'orgA').id
  state.orgs.push(orgA); save(state)
  const orgB=must(await admin.from('organizations').insert({name:`QA ${run} other`,is_personal:false}).select('id').single(),'orgB').id
  state.orgs.push(orgB); save(state)
  for (const [label,role] of [['teacher','teacher'],['manager','teacher'],['viewer','teacher'],['foreign','teacher'],['student','student'],['otherStudent','student']]) {
    const email=`${label}-${run}@example.invalid`, password=`Qa1!${randomUUID()}`
    const auth=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`QA ${label}`,role}}),'create synthetic account')
    state.users[label]={id:auth.user.id,email,password}; save(state)
    must(await admin.from('users').update({role,status:'active',full_name:`QA ${label}`}).eq('id',auth.user.id),'set fixture role')
    const memberships=must(await admin.from('organization_members').select('org_id,org_role').eq('user_id',auth.user.id),'fixture memberships')
    for(const membership of memberships??[]) if(membership.org_role==='owner'&&!state.orgs.includes(membership.org_id)) state.orgs.push(membership.org_id)
    save(state)
  }
  const user=label=>state.users[label].id
  for(const [label,owner,org] of [['room','teacher',orgA],['otherRoom','foreign',orgB]]) {
    const room=must(await admin.from('classrooms').insert({teacher_id:user(owner),org_id:org,name:`QA ${label}`,class_code:randomUUID().replaceAll('-','').slice(0,6).toUpperCase(),status:'active'}).select('id').single(),'fixture room').id
    state.rooms.push(room);state[label]=room;save(state)
    const post=must(await admin.from('classroom_posts').insert({classroom_id:room,author_id:user(owner),body:`ประกาศจำลอง ${run}`}).select('id').single(),'fixture post').id
    state.posts.push(post);state[`${label}Post`]=post;save(state)
  }
  must(await admin.from('classroom_students').insert([{classroom_id:state.room,student_id:user('student')},{classroom_id:state.otherRoom,student_id:user('otherStudent')}]),'fixture rosters')
  must(await admin.from('classroom_co_teachers').insert(['manager','viewer'].map(label=>({classroom_id:state.room,user_id:user(label),permission:label==='manager'?'manage':'view',invited_by:user('teacher')}))),'fixture staff')
  console.log('PASS: isolated synthetic accounts, two organizations and two rosters created')
} else {
  const state=JSON.parse(readFileSync(manifestPath,'utf8'))
  assert.equal(state.ref,ref); assert.match(state.run,/^student-ui-[0-9a-f-]{36}$/)
  const user=label=>state.users[label].id, post=state.roomPost
  if (phase==='cleanup') {
    for(const account of Object.values(state.users)) {
      const files=must(await admin.storage.from('profile-avatars').list(account.id),'list fixture avatar objects')
      if(files?.length) must(await admin.storage.from('profile-avatars').remove(files.filter(x=>/^[0-9a-f-]{36}\.png$/.test(x.name)).map(x=>`${account.id}/${x.name}`)),'remove fixture avatars')
    }
    if(state.rooms.length) must(await admin.from('classrooms').delete().in('id',state.rooms),'remove fixture rooms')
    for(const account of Object.values(state.users)) must(await admin.auth.admin.deleteUser(account.id),'remove fixture account')
    for(const org of state.orgs) must(await admin.from('organizations').delete().eq('id',org),'remove fixture org')
    console.log('PASS: only manifest-owned synthetic records/avatars removed')
  } else {
    const client=createClient(url,key('anon'),options)
    must(await client.auth.signInWithPassword({email:state.users.student.email,password:state.users.student.password}),'synthetic Auth login')
    const initial=(await rpc('remind_classroom_announcement',{p_actor:user('teacher'),p_post:post})).round
    const pending=()=>rpc('pending_classroom_announcements',{p_actor:user('student')})
    const ack=round=>admin.rpc('acknowledge_classroom_announcement',{p_actor:user('student'),p_post:post,p_round:round})
    assert.deepEqual((await pending()).map(p=>p.id),[post])
    const first=await Promise.all([ack(initial),ack(initial)])
    assert.ok(first.every(x=>!x.error));assert.equal(typeof first[0].data.acknowledgedAt,'string');assert.equal(first[0].data.acknowledgedAt,first[1].data.acknowledgedAt)
    assert.equal(must(await admin.from('classroom_announcement_acknowledgements').select('*').eq('post_id',post).eq('round_no',initial),'receipts').length,1)
    assert.deepEqual(await pending(),[])
    await rpc('remind_classroom_announcement',{p_actor:user('manager'),p_post:post})
    assert.equal((await pending())[0].round,initial+1)
    assert.equal((await ack(initial)).error?.code,'PT409')
    const race=await Promise.all([ack(initial+1),admin.rpc('remind_classroom_announcement',{p_actor:user('teacher'),p_post:post})])
    assert.ok(!race[1].error);assert.ok(!race[0].error||race[0].error.code==='PT409')
    assert.equal((await pending())[0].round,initial+2);must(await ack(initial+2),'current acknowledgement')
    for(const label of ['viewer','foreign','student']) assert.equal((await admin.rpc('remind_classroom_announcement',{p_actor:user(label),p_post:post})).error?.code,'42501')
    assert.equal((await admin.rpc('acknowledge_classroom_announcement',{p_actor:user('student'),p_post:state.otherRoomPost,p_round:1})).error?.code,'42501')
    for(const browser of [createClient(url,key('anon'),options),client]) {
      assert.ok((await browser.rpc('remind_classroom_announcement',{p_actor:user('teacher'),p_post:post})).error)
      assert.ok((await browser.from('classroom_announcement_acknowledgements').select('*')).error)
      assert.ok((await browser.storage.from('profile-avatars').upload(`${user('teacher')}/${randomUUID()}.png`,new Uint8Array([1]),{contentType:'image/png'})).error)
    }
    must(await admin.from('classroom_students').delete().eq('classroom_id',state.room).eq('student_id',user('student')),'withdraw fixture')
    assert.deepEqual(await pending(),[]);assert.equal((await ack(initial+2)).error?.code,'42501')
    must(await admin.from('classroom_students').insert({classroom_id:state.room,student_id:user('student')}),'restore fixture')
    must(await admin.from('classrooms').update({status:'archived'}).eq('id',state.room),'archive fixture')
    assert.deepEqual(await pending(),[]);assert.equal((await ack(initial+2)).error?.code,'42501')
    must(await admin.from('classrooms').update({status:'active'}).eq('id',state.room),'restore fixture room')
    await rpc('remind_classroom_announcement',{p_actor:user('teacher'),p_post:post})
    console.log('PASS: real Auth, concurrent/idempotent ack, concurrent resend, stale round, exact roles/rosters/orgs, archived room, direct RPC/table/Storage denial')
  }
}
