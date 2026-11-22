import { readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const SITE='https://staging.korkru.com', REF='dyuxkrzeveknqgtuzpbh'
export function assertTarget(keys) { if(keys.site!==SITE || keys.projectRef!==REF || typeof keys.protection!=='string' || !keys.protection) throw Error('Exact protected Staging required') }
export function encodeForm(fields) { const f=new FormData(); for(const [key,value] of Object.entries(fields)) f.set(`_1_${key}`,String(value)); f.set('0','["$K1"]'); return f }
export function actionResult(body) { const line=body.split('\n').find(x=>x.startsWith('1:')); if(!line) throw Error('Missing action receipt'); const v=JSON.parse(line.slice(2)); if(v?.error) throw Error(String(v.error)); return v }
export function validateManifest(m) { if(m.site!==SITE||m.projectRef!==REF||! /^[a-f0-9-]{36}$/.test(m.run)||m.accounts.length>81)throw Error('Invalid manifest');for(const a of m.accounts)if(a.email!==`capacity-${m.run}-${a.label}@qa.staging.korkru.com`||!Array.isArray(a.cookies))throw Error('Invalid synthetic identity'); }
const save=(path,data)=>{writeFileSync(path,JSON.stringify(data,null,2),{mode:0o600});chmodSync(path,0o600)}
export async function main(argv=process.argv.slice(2)) {
 if(!argv.includes('--execute')||!argv.includes('--confirm=80-synthetic-staging'))throw Error('Explicit bounded synthetic execution required')
 const keys=JSON.parse(readFileSync('/private/tmp/korkru-capacity-stage-keys.json','utf8'));assertTarget(keys)
 const file='/private/tmp/korkru-capacity-manifest.json'
 const mode=argv.find(x=>x.startsWith('--mode='))?.slice(7)
 let m=JSON.parse(readFileSync(file,'utf8'));m.accounts.forEach(a=>a.cookies??=[]);validateManifest(m)
 m.metrics??=[];m.actions??={}; const samples=[]
 const headers={'x-vercel-protection-bypass':keys.protection,Origin:SITE,Accept:'text/x-component'}
 const persist=()=>save(file,m)
 async function request(path,options={},actor) {
  if(!path.startsWith('/')||path.startsWith('//'))throw Error('Unsafe path')
  const response=await fetch(SITE+path,{...options,headers:{...headers,...options.headers,...(actor?.cookies.length?{Cookie:actor.cookies.join('; ')}:{})},redirect:'manual',signal:AbortSignal.timeout(90000)})
  if(actor)for(const value of response.headers.getSetCookie()){const item=value.split(';')[0],name=item.split('=')[0];actor.cookies=actor.cookies.filter(x=>!x.startsWith(name+'='));if(!/max-age=0/i.test(value))actor.cookies.push(item)}
  return response
 }
 async function discover(path,actor){const r=await request(path,{headers:{Accept:'text/html'}},actor);const body=await r.text();if(r.status!==200||!body.includes('STAGING'))throw Error(`Staging page unavailable: ${r.status}`);const scripts=[...body.matchAll(/src="([^\"]+\.js[^\"]*)"/g)].map(x=>x[1]);for(const src of scripts){m.chunks??={};if(m.chunks[src])continue;const s=await(await request(src)).text();for(const match of s.matchAll(/createServerReference\)\("([a-f0-9]+)"[^;]{0,130}?"([A-Za-z0-9_]+)"\)/g))m.actions[match[2]]=match[1];m.chunks[src]=true;}persist();return body}
 async function call(name,args,actor,path='/signup',form){const t=performance.now();let sample={phase:mode,action:name,label:actor.label};try{if(!m.actions[name])throw Error('Missing action '+name);const r=await request(path,{method:'POST',headers:{'Next-Action':m.actions[name],...(form?{}:{'Content-Type':'text/plain;charset=UTF-8'})},body:form??JSON.stringify(args)},actor);sample.http=r.status;const text=await r.text();if(!r.ok)throw Error(`HTTP ${r.status}`);const result=actionResult(text);sample.ok=true;sample.ms=Math.round(performance.now()-t);samples.push(sample);return {result,redirect:r.headers.get('x-action-redirect')};}catch(e){sample.ok=false;sample.error=e.message;sample.ms=Math.round(performance.now()-t);samples.push(sample);throw e}}
 await discover('/signup');await discover('/login')
 const students=m.accounts.filter(a=>/^student\d+$/.test(a.label))
 if(mode==='signup'){
  if(students.length===0){for(let i=1;i<=80;i++){const label=`student${String(i).padStart(2,'0')}`;m.accounts.push({label,email:`capacity-${m.run}-${label}@qa.staging.korkru.com`,password:`Qa1!${randomUUID()}Aa9`,cookies:[]});}persist()}
  const actors=m.accounts.filter(a=>/^student\d+$/.test(a.label)&&!a.registered)
  await Promise.allSettled(actors.map(async(a,i)=>{const fields={role:'student',full_name:`Capacity QA ${m.run} ${a.label}`,email:a.email,password:a.password,confirm_password:a.password,accept_terms:'true',grade_level:'ม.4',section_number:'1',student_code:'SYNTHETIC-'+a.label,class_number:String(i+1)};const {result}=await call('register',[],a,'/signup',encodeForm(fields));a.registered=true;a.signedIn=result.signedIn===true;persist()}))
 }else if(mode==='login'){
  await Promise.allSettled(students.map(async a=>{const f=encodeForm({email:a.email,password:a.password});f.set('0','[null,"$K1"]');const r=await call('login',[],a,'/login',f);a.loggedIn=Boolean(r.redirect?.includes('/dashboard'));if(!a.loggedIn)throw Error('Missing login redirect');persist()}))
 }else if(mode==='discover-exam'){
  const a=students.find(a=>a.loggedIn);if(!a||!m.assignmentId)throw Error('Fixture/login required');await discover(`/assignments/${m.assignmentId}/take`,a);await discover('/classrooms',a);console.log({actions:Object.keys(m.actions)});
 }else if(mode==='start'){
  await Promise.allSettled(students.map(async a=>{const {result}=await call('startAssignmentFromWaiting',[m.assignmentId,null,'start'],a,`/assignments/${m.assignmentId}/take`);a.submissionId=result.submissionId;if(!a.submissionId)throw Error('Missing attempt');persist()}))
 }else if(mode==='answers'){
  if(!students.every(a=>a.answers?.length===40))throw Error('Expected 80 x 40 answer rows');
  await Promise.allSettled(students.map(async a=>{for(let q=0;q<40;q++){await call('saveAnswer',[a.answers[q].id,a.answers[q].value],a,`/assignments/${m.assignmentId}/take`);if(q%5===0)await call('recordProctorSignal',[{submissionId:a.submissionId,clientInstanceId:a.clientInstanceId??(a.clientInstanceId=randomUUID()),tabVisible:true,fullscreen:false,events:[]}],a,`/assignments/${m.assignmentId}/take`)}}))
 }else if(mode==='heartbeat'){
  const rounds=Number(argv.find(x=>x.startsWith('--rounds='))?.slice(9)??'4');if(!Number.isInteger(rounds)||rounds<1||rounds>240)throw Error('Bounded rounds required');
  for(let i=0;i<rounds;i++){await Promise.allSettled(students.map(a=>call('recordProctorSignal',[{submissionId:a.submissionId,clientInstanceId:a.clientInstanceId??(a.clientInstanceId=randomUUID()),tabVisible:true,fullscreen:false,events:[]}],a,`/assignments/${m.assignmentId}/take`)));persist();console.log(JSON.stringify({phase:mode,round:i+1,rounds}));if(i+1<rounds)await new Promise(r=>setTimeout(r,15000))}
 }else if(mode==='submit'){
  await Promise.allSettled(students.map(a=>call('submitSubmission',[a.submissionId],a,`/assignments/${m.assignmentId}/take`)))
 }else throw Error('Unknown bounded mode')
 persist();const times=samples.map(s=>s.ms).sort((a,b)=>a-b);const stats={phase:mode,count:samples.length,passed:samples.filter(s=>s.ok).length,failed:samples.filter(s=>!s.ok).length,p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.min(times.length-1,Math.floor(times.length*.95))],maxMs:times.at(-1),errors:[...new Set(samples.filter(s=>!s.ok).map(s=>s.error))]};m.metrics.push({at:new Date().toISOString(),...stats});save('/private/tmp/korkru-capacity-last-samples.json',samples);persist();console.log(JSON.stringify(stats));return stats.failed?1:0
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(code=>process.exitCode=code).catch(e=>{console.error(e.message);process.exitCode=1})
