// One bounded signup cohort. This runner never seeds Auth users or sends email.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { assertTarget, encodeForm } from './verify-exam-capacity-staging.mjs'

export const SITE = 'https://staging.korkru.com'
export const REF = 'dyuxkrzeveknqgtuzpbh'
const FILE = '/private/tmp/korkru-auth80-manifest.json'
const KEYS = '/private/tmp/korkru-auth80-stage-keys.json'
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

export function createBudget(requestLimit = 300, byteLimit = 64 * 1024 * 1024) {
  let requests = 0, bytes = 0
  return {
    request() { if (++requests > requestLimit) throw Error('Request budget exceeded') },
    read(count) { bytes += count; if (bytes > byteLimit) throw Error('Transfer budget exceeded') },
    snapshot() { return { requests, bytes, requestLimit, byteLimit } },
  }
}

export function signupReceipt(body, email, cookies) {
  const line = body.split('\n').find(value => value.startsWith('1:'))
  if (!line) throw Error('Missing signup receipt')
  const result = JSON.parse(line.slice(2))
  if (result?.error) throw Error(String(result.error))
  if (result?.success !== true || result.signedIn !== true || result.email !== email) {
    throw Error('Signup did not create an authenticated session')
  }
  if (!cookies.some(cookie => new RegExp(`^sb-${REF}-auth-token(?:\\.\\d+)?=.+`).test(cookie))) {
    throw Error('Missing Staging auth cookie')
  }
  return result
}

export function validateCohort(state) {
  if (state.site !== SITE || state.projectRef !== REF || !UUID.test(state.run)
    || state.accounts.length !== 80) throw Error('Exact 80-user Staging cohort required')
  const labels = new Set()
  for (const account of state.accounts) {
    if (!/^student(?:0[1-9]|[1-7][0-9]|80)$/.test(account.label) || labels.has(account.label)
      || account.email !== `auth80-${state.run}-${account.label}@qa.staging.korkru.com`
      || !Array.isArray(account.cookies)) throw Error('Invalid synthetic identity')
    labels.add(account.label)
  }
}

function persist(state) {
  const temporary = `${FILE}.${randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600, flag: 'wx' })
  renameSync(temporary, FILE)
  chmodSync(FILE, 0o600)
}

export async function main(argv = process.argv.slice(2)) {
  if (!argv.includes('--execute') || !argv.includes('--confirm=80-new-staging-signups')) {
    throw Error('Exact synthetic execution confirmation required')
  }
  if (existsSync(FILE)) throw Error('Existing cohort retained; refusing another signup cohort')
  const notBefore = argv.find(value => value.startsWith('--not-before='))?.slice(13)
  if (notBefore && (!Number.isFinite(Date.parse(notBefore)) || Date.now() < Date.parse(notBefore))) {
    throw Error('Waiting for the previous limiter window; no requests sent')
  }
  const keys = JSON.parse(readFileSync(KEYS, 'utf8'))
  assertTarget(keys)
  if (JSON.parse(Buffer.from(keys.anon.split('.')[1], 'base64url')).ref !== REF) {
    throw Error('Publishable key belongs to another project')
  }
  const budget = createBudget()
  const stop = new AbortController()
  const samples = []
  const run = randomUUID()
  const state = {
    version: 1, kind: 'auth80-staging', site: SITE, projectRef: REF, run,
    createdAt: new Date().toISOString(), budget: budget.snapshot(), metrics: [],
    accounts: Array.from({ length: 80 }, (_, index) => {
      const label = `student${String(index + 1).padStart(2, '0')}`
      return { label, email: `auth80-${run}-${label}@qa.staging.korkru.com`,
        password: `Qa1!${randomUUID()}Aa9`, cookies: [], registered: false }
    }),
  }
  validateCohort(state)

  async function read(response) {
    const chunks = []
    const reader = response.body?.getReader()
    if (!reader) return ''
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      try { budget.read(part.value.byteLength) }
      catch (error) { stop.abort(error); await reader.cancel(); throw error }
      chunks.push(Buffer.from(part.value))
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  async function request(path, options = {}, actor) {
    if (!path.startsWith('/') || path.startsWith('//')) throw Error('Unsafe site path')
    try { budget.request() } catch (error) { stop.abort(error); throw error }
    const response = await fetch(SITE + path, {
      ...options, redirect: 'manual',
      headers: { 'x-vercel-protection-bypass': keys.protection, Origin: SITE,
        ...options.headers, ...(actor?.cookies.length ? { Cookie: actor.cookies.join('; ') } : {}) },
      signal: AbortSignal.any([stop.signal, AbortSignal.timeout(90_000)]),
    })
    if (actor) for (const cookie of response.headers.getSetCookie()) {
      const item = cookie.split(';')[0], name = item.split('=')[0]
      actor.cookies = actor.cookies.filter(value => !value.startsWith(name + '='))
      if (!/max-age=0/i.test(cookie)) actor.cookies.push(item)
    }
    return { response, body: await read(response) }
  }

  // Refuse to allocate accounts unless signup matches Production's existing
  // email-autoconfirm behavior. Never spend SMTP quota on synthetic recipients.
  budget.request()
  const settingsResponse = await fetch(`https://${REF}.supabase.co/auth/v1/settings`, {
    headers: { apikey: keys.anon }, redirect: 'error', signal: AbortSignal.timeout(10_000),
  })
  const settings = JSON.parse(await read(settingsResponse))
  if (!settingsResponse.ok || settings.mailer_autoconfirm !== true || settings.disable_signup === true) {
    throw Error('Staging signup settings must match Production without sending email')
  }
  const { response, body } = await request('/signup', { headers: { Accept: 'text/html' } })
  if (!response.ok || !body.includes('STAGING')) throw Error('Canonical Staging badge not found')
  let registerAction
  for (const match of body.matchAll(/src="([^\"]+\.js[^\"]*)"/g)) {
    const chunk = await request(match[1])
    const action = chunk.body.match(/createServerReference\)\("([a-f0-9]+)"[^;]{0,130}?"register"\)/)
    if (action) { registerAction = action[1]; break }
  }
  if (!registerAction) throw Error('Public signup action not found')
  state.startedAt = new Date().toISOString()
  persist(state)
  console.log(JSON.stringify({ phase: 'signup', run, students: 80, budget: budget.snapshot(), emailSends: 0 }))

  await Promise.all(state.accounts.map(async (actor, index) => {
    const started = performance.now()
    const sample = { phase: 'signup', label: actor.label, ok: false }
    try {
      const fields = { role: 'student', full_name: `Auth80 QA ${run} ${actor.label}`,
        email: actor.email, password: actor.password, confirm_password: actor.password,
        accept_terms: 'true', grade_level: 'ม.4', section_number: '1',
        student_code: `SYNTHETIC-${actor.label}`, class_number: String(index + 1) }
      const result = await request('/signup', { method: 'POST', headers: {
        'Next-Action': registerAction, Accept: 'text/x-component',
      }, body: encodeForm(fields) }, actor)
      sample.http = result.response.status
      if (!result.response.ok) throw Error(`HTTP ${result.response.status}`)
      signupReceipt(result.body, actor.email, actor.cookies)
      actor.registered = true
      sample.ok = true
    } catch (error) { sample.error = error.message }
    sample.ms = Math.round(performance.now() - started)
    samples.push(sample)
    state.budget = budget.snapshot()
    state.samples = samples
    persist(state)
  }))

  const times = samples.map(sample => sample.ms).sort((a, b) => a - b)
  const summary = { phase: 'signup', count: 80, passed: samples.filter(sample => sample.ok).length,
    failed: samples.filter(sample => !sample.ok).length, p50Ms: times[40], p95Ms: times[76],
    maxMs: times.at(-1), errors: [...new Set(samples.filter(sample => !sample.ok).map(sample => sample.error))] }
  state.metrics.push(summary)
  console.log(JSON.stringify(summary))

  // Eight independent authenticated page reads provide a browser-route check;
  // SQL separately verifies all 80 provisioned profiles and live sessions.
  if (summary.failed === 0) {
    const probes = await Promise.all(state.accounts.filter((_, index) => index % 10 === 0).map(async actor => {
      const result = await request('/dashboard', { headers: { Accept: 'text/html' } }, actor)
      return { label: actor.label, ok: result.response.ok && result.body.includes('STAGING') }
    }))
    state.probes = probes
    console.log(JSON.stringify({ phase: 'authenticated-dashboard', count: probes.length,
      passed: probes.filter(probe => probe.ok).length }))
  }
  state.budget = budget.snapshot()
  state.finishedAt = new Date().toISOString()
  persist(state)
  console.log(JSON.stringify({ phase: 'budget', ...state.budget, emailSends: 0 }))
  return summary.failed === 0 && state.probes?.every(probe => probe.ok) ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => process.exitCode = code).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
