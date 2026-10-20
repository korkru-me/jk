import { existsSync, readFileSync, rmSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertStagingEnvironment, buildReminderAssignmentSchedule, createStagingFetch, main, parseRunMode, privateFixturePath, validateFixtureManifest, verifyReminderRows } from './verify-assignment-reminders-staging.mjs'
import { normalizeAssignmentLateSchedule } from '../lib/late-submission.ts'

const project = 'dyuxkrzeveknqgtuzpbh'
const args = ['--execute', '--confirm=assignment-reminders-staging-synthetic']
const jwt = (role, ref = project) => `fixture.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.fixture`
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const environment = () => ({
  EXAM_QA_ENVIRONMENT: 'staging', KORKRU_DEPLOYMENT_ENV: 'staging', VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com', NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
})
const temporaryPaths = []
function manifest() {
  const run = id(1)
  const accounts = ['owner', 'never-started', 'in-progress', 'submitted', 'graded'].map((label, index) => ({
    id: id(10 + index), label, role: label === 'owner' ? 'teacher' : 'student',
    email: `reminder-qa-${run}-${label}@qa.staging.korkru.com`, password: 'synthetic-fixture-password-only',
    orgIds: [id(20 + index)], membershipVerified: true,
  }))
  return { version: 1, kind: 'assignment-reminders-staging', projectRef: project, target: 'https://staging.korkru.com', run,
    prefix: `Reminder QA ${run}`, accounts, classroomId: id(30), assignmentId: id(31), questionId: id(32),
    submissions: accounts.slice(2).map((row, index) => ({ id: id(40 + index), answerId: id(50 + index), studentId: row.id, label: row.label })),
    baseline: { submissions: [], answers: [] },
  }
}
function reminders(state = manifest()) {
  return state.accounts.filter(row => ['never-started', 'in-progress'].includes(row.label)).map((row, index) => ({
    id: id(60 + index), recipient_id: row.id, actor_id: state.accounts[0].id, org_id: state.accounts[0].orgIds[0],
    type: 'assignment_reminder', title: 'ครูเตือนให้ส่งงาน', body: 'ข้อความการเตือน', link: `/assignments/${state.assignmentId}/take`,
    related_assignment_id: state.assignmentId, related_classroom_id: state.classroomId, is_read: false,
  }))
}
afterEach(() => { vi.restoreAllMocks(); for (const path of temporaryPaths.splice(0)) rmSync(path, { force: true }) })

describe('synthetic reminder assignment schedule contract', () => {
  it('supplies one valid late band at the exact due instant using one captured clock value', () => {
    const now = Date.parse('2026-10-20T15:30:47.123Z')
    const schedule = buildReminderAssignmentSchedule(now, id(90))
    const validated = normalizeAssignmentLateSchedule({ startAt: schedule.start_at, dueAt: schedule.due_at,
      endAt: schedule.end_at, bands: schedule.late_bands })
    expect(validated).toEqual({ value: { dueAt: schedule.due_at, bands: schedule.late_bands } })
    expect(schedule.late_bands).toHaveLength(1)
    expect(schedule.late_bands[0].starts_at).toBe(schedule.due_at)
    expect(Date.parse(schedule.due_at) - now).toBe(86_400_000)
    expect(Date.parse(schedule.end_at) - Date.parse(schedule.due_at)).toBe(86_400_000)
    expect(Date.parse(schedule.start_at)).toBeLessThan(now)
  })
  it('reproduces the rejected old fixture contract so a due date cannot lose its required band again', () => {
    const schedule = buildReminderAssignmentSchedule(Date.parse('2026-10-20T15:30:47.123Z'), id(90))
    expect(normalizeAssignmentLateSchedule({ startAt: schedule.start_at, dueAt: schedule.due_at,
      endAt: schedule.end_at, bands: [] })).toMatchObject({ error: expect.any(String) })
    expect(normalizeAssignmentLateSchedule({ startAt: schedule.start_at, dueAt: schedule.due_at,
      endAt: schedule.end_at, bands: [{ ...schedule.late_bands[0], starts_at: schedule.end_at }] }))
      .toMatchObject({ error: expect.any(String) })
  })
})

describe('assignment reminder Staging execution fence', () => {
  it('requires the exact Staging project/site and explicit synthetic confirmation', () => {
    expect(() => assertStagingEnvironment(environment(), args)).not.toThrow()
    for (const altered of [[], ['--execute'], ['--execute', '--confirm=assignment-deadline-staging-synthetic']]) {
      expect(() => assertStagingEnvironment(environment(), altered)).toThrow('confirmation')
    }
  })
  it.each([
    ['EXAM_QA_ENVIRONMENT', 'production'], ['KORKRU_DEPLOYMENT_ENV', 'production'], ['VERCEL_ENV', 'production'],
    ['NEXT_PUBLIC_SITE_URL', 'https://www.korkru.com'], ['NEXT_PUBLIC_SITE_URL', 'https://staging.korkru.com/'],
    ['NEXT_PUBLIC_SUPABASE_URL', 'https://libsutfinswqkruihwdx.supabase.co'],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', jwt('anon', 'libsutfinswqkruihwdx')],
    ['SUPABASE_SERVICE_ROLE_KEY', jwt('service_role', 'libsutfinswqkruihwdx')],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', jwt('service_role')], ['SUPABASE_SERVICE_ROLE_KEY', ''],
  ])('rejects an unsafe %s before any request', (key, value) => {
    expect(() => assertStagingEnvironment({ ...environment(), [key]: value }, args)).toThrow()
  })
  it('accepts opaque keys only within the fixed Staging origin', () => {
    const env = { ...environment(), NEXT_PUBLIC_SUPABASE_ANON_KEY: `sb_publishable_${'a'.repeat(24)}`, SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${'b'.repeat(24)}` }
    expect(() => assertStagingEnvironment(env, args)).not.toThrow()
    expect(() => assertStagingEnvironment({ ...env, NEXT_PUBLIC_SITE_URL: 'https://example.com' }, args)).toThrow()
  })
  it('help/config checks never fetch or print keys', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in unit checks'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const env = environment()
    expect(await main(['--help'], {})).toBe(0)
    expect(await main([...args, '--check-config'], env)).toBe(0)
    expect(request).not.toHaveBeenCalled()
    const output = JSON.stringify(log.mock.calls)
    expect(output).not.toContain(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    expect(output).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY)
  })
  it('a Production target is rejected without network or key disclosure', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in unit checks'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const env = { ...environment(), NEXT_PUBLIC_SUPABASE_URL: 'https://libsutfinswqkruihwdx.supabase.co' }
    expect(await main([...args, '--create-fixture'], env)).toBe(1)
    expect(request).not.toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY)
  })
  it('requires exactly one mode and retains fixtures only when creation is explicit', () => {
    expect(parseRunMode([...args, '--create-fixture', '--keep-fixture'])).toEqual({ mode: 'create', expectedReadCount: null })
    expect(parseRunMode([...args, '--verify-notifications', '--fixture-file=x', '--expected-read-count=1'])).toEqual({ mode: 'verify', expectedReadCount: 1 })
    expect(parseRunMode([...args, '--cleanup-fixture=x'])).toEqual({ mode: 'cleanup', expectedReadCount: null })
    for (const flags of [[], ['--create-fixture', '--verify-notifications'], ['--verify-notifications'],
      ['--cleanup-fixture=x', '--keep-fixture'], ['--create-fixture', '--expected-read-count=1'],
      ['--verify-notifications', '--fixture-file=x', '--expected-read-count=3']]) expect(() => parseRunMode(flags)).toThrow()
  })
  it('restricts the fixture to its own basename directly inside the private temporary directory', () => {
    expect(privateFixturePath('/private/tmp/korkru-assignment-reminders-staging-unit.json')).toBe('/private/tmp/korkru-assignment-reminders-staging-unit.json')
    for (const path of ['relative.json', '/Users/korkusonmasaen/Korkru/file.json', '/private/tmp/unrelated.json', '/private/tmp/korkru-assignment-reminders-staging-../other.json']) {
      expect(() => privateFixturePath(path)).toThrow()
    }
  })
})

describe('fixture provenance and cleanup bounds', () => {
  it('accepts full or partial run-owned fixtures for recovery cleanup', () => {
    const full = manifest()
    expect(validateFixtureManifest(full)).toBe(full)
    const partial = { ...full, accounts: [], submissions: [], classroomId: null, assignmentId: null, questionId: null }
    expect(validateFixtureManifest(partial)).toBe(partial)
  })
  it.each([
    state => { state.projectRef = 'libsutfinswqkruihwdx' },
    state => { state.target = 'https://www.korkru.com' },
    state => { state.kind = 'unrelated-test' },
    state => { state.prefix = 'unrelated run' },
    state => { state.accounts[0].email = 'real@example.com' },
    state => { state.accounts[0].role = 'student' },
    state => { state.accounts[0].orgIds = [] },
    state => { state.accounts[1].label = 'owner' },
    state => { state.accounts.push({ ...state.accounts[0] }) },
    state => { state.submissions.push({ ...state.submissions[0] }) },
    state => { state.submissions[0].studentId = id(999) },
    state => { state.submissions[0].label = 'never-started' },
    state => { state.assignmentId = 'not-a-uuid' },
  ])('rejects forged or unbounded cleanup identities', mutate => {
    const state = manifest(); mutate(state)
    expect(() => validateFixtureManifest(state)).toThrow()
  })
})

describe('exact owned reminder verification', () => {
  it('targets never-started and in-progress learners only, with optional acknowledgement count checks', () => {
    const state = manifest(), rows = reminders(state)
    expect(verifyReminderRows(state, rows, 0)).toEqual({ reminders: 2, recipients: 2, read: 0, unread: 2 })
    rows[0].is_read = true
    expect(verifyReminderRows(state, rows, 1)).toMatchObject({ read: 1, unread: 1 })
    rows[1].is_read = true
    expect(verifyReminderRows(state, rows, 2)).toMatchObject({ read: 2, unread: 0 })
  })
  it.each([
    (rows, state) => { rows[0].recipient_id = state.accounts[3].id },
    (rows, state) => { rows[0].recipient_id = state.accounts[4].id },
    rows => { rows[1].recipient_id = rows[0].recipient_id },
    rows => { rows.push({ ...rows[0], id: id(90) }) },
    rows => { rows[1].id = rows[0].id },
    rows => { rows[0].actor_id = id(999) },
    rows => { rows[0].related_assignment_id = id(999) },
    rows => { rows[0].related_classroom_id = id(999) },
    rows => { rows[0].type = 'grade_published' },
    rows => { rows[0].link = 'https://example.com/private' },
  ])('rejects wrong recipients, duplicate sends and cross-resource notification rows', mutate => {
    const state = manifest(), rows = reminders(state); mutate(rows, state)
    expect(() => verifyReminderRows(state, rows)).toThrow()
  })
  it('rejects an unexpected read count rather than claiming acknowledgement succeeded', () => {
    expect(() => verifyReminderRows(manifest(), reminders(), 1)).toThrow('read count')
  })
})

describe('bounded Staging-only request reuse', () => {
  const url = `https://${project}.supabase.co/rest/v1/notifications`
  it('rejects non-Staging targets and embedded credentials before fetch', async () => {
    const request = vi.fn()
    const bounded = createStagingFetch({ fetchImpl: request })
    for (const target of ['https://libsutfinswqkruihwdx.supabase.co/rest/v1/notifications',
      `https://user:private@${project}.supabase.co/rest/v1/notifications`]) await expect(bounded(target)).rejects.toThrow('non-Staging')
    expect(request).not.toHaveBeenCalled()
  })
  it('aborts a stalled request once without retrying a mutation', async () => {
    const request = vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    }))
    await expect(createStagingFetch({ fetchImpl: request, timeoutMs: 10 })(url, { method: 'POST' }))
      .rejects.toMatchObject({ name: 'TimeoutError' })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('logs fixed request classifications without tokens, IDs, filters or bodies', async () => {
    const trace = vi.fn(), request = vi.fn(async () => new Response('{}', { status: 200 }))
    await createStagingFetch({ fetchImpl: request, trace })(`${url}?recipient_id=eq.${id(50)}`, {
      method: 'GET', headers: { Authorization: 'Bearer private-token' },
    })
    expect(trace.mock.calls[0]).toEqual(['START', { method: 'GET', pathKind: 'database table' }])
    const output = JSON.stringify(trace.mock.calls)
    expect(output).not.toContain(id(50))
    expect(output).not.toContain('private-token')
  })
})

describe('partial synthetic account setup cleanup recovery', () => {
  // Exercise the actual SDK and runner against fake HTTP. Simulate a setup
  // membership read failure and one failed automatic cleanup read, leaving a
  // private receipt that the explicit cleanup invocation must safely recover.
  function partialSetupTransport(path, { wrongAuth = false, shared = false, extraMembership = false } = {}) {
    let account = null, membershipFailuresRemaining = 2
    const orgId = id(90), requests = [], repairedReceipts = []
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
    const fetch = vi.fn(async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
      expect(url.origin).toBe(`https://${project}.supabase.co`)
      const method = init?.method ?? 'GET'
      requests.push({ method, path: url.pathname })
      if (url.pathname.startsWith('/rest/v1/') && url.searchParams.get('limit') === '0') return json([])
      if (url.pathname === '/auth/v1/admin/users' && method === 'POST') {
        const payload = JSON.parse(init.body)
        account = { id: id(80), email: payload.email, user_metadata: payload.user_metadata, aud: 'authenticated', role: 'authenticated' }
        return json(account)
      }
      if (url.pathname === `/auth/v1/admin/users/${id(80)}`) {
        if (method === 'DELETE') return json(account)
        return json({ ...account, user_metadata: wrongAuth ? { ...account.user_metadata, qa_run: id(999) } : account.user_metadata })
      }
      if (url.pathname === '/rest/v1/organization_members') {
        if (url.searchParams.has('user_id')) {
          expect(url.searchParams.get('user_id')).toBe(`eq.${account.id}`)
          if (membershipFailuresRemaining > 0) { membershipFailuresRemaining -= 1; return json({ code: 'P0001', message: 'Synthetic setup read failed' }, 400) }
          return json(extraMembership ? [{ org_id: orgId, org_role: 'owner' }, { org_id: id(91), org_role: 'owner' }] : [{ org_id: orgId, org_role: 'owner' }])
        }
        expect(url.searchParams.get('org_id')).toBe(`eq.${orgId}`)
        return json(shared ? [{ user_id: account.id, org_role: 'owner' }, { user_id: id(999), org_role: 'member' }] : [{ user_id: account.id, org_role: 'owner' }])
      }
      if (url.pathname === '/auth/v1/token') {
        expect(JSON.parse(init.body).email).toBe(account.email)
        return json({ access_token: jwt('authenticated'), refresh_token: 'fixture-refresh-token', expires_in: 3600, token_type: 'bearer', user: account })
      }
      if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 })
      if (url.pathname === '/rest/v1/organizations' && method === 'DELETE') {
        expect(url.searchParams.get('id')).toBe(`eq.${orgId}`)
        repairedReceipts.push(JSON.parse(readFileSync(path, 'utf8')).accounts[0])
        return new Response(null, { status: 204 })
      }
      if (['/rest/v1/classrooms', '/rest/v1/assignments', '/rest/v1/questions'].includes(url.pathname)) {
        expect(url.searchParams.get('org_id')).toBe(`eq.${orgId}`)
        return json([])
      }
      throw new Error(`Unexpected mocked request ${method} ${url.pathname}`)
    })
    return { fetch, requests, repairedReceipts, orgId }
  }
  async function failSetupThenRetryCleanup(options = {}) {
    const path = `/private/tmp/korkru-assignment-reminders-staging-partial-${process.pid}.json`; temporaryPaths.push(path)
    const fake = partialSetupTransport(path, options)
    vi.spyOn(globalThis, 'fetch').mockImplementation(fake.fetch)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(await main([...args, '--create-fixture', '--keep-fixture', `--fixture-file=${path}`], environment())).toBe(1)
    const state = JSON.parse(readFileSync(path, 'utf8'))
    expect(state.accounts).toHaveLength(1)
    expect(state.accounts[0]).toMatchObject({ label: 'owner', membershipVerified: false, orgIds: [] })
    expect(state.classroomId).toBeNull()
    expect(fake.requests.filter(row => row.method === 'DELETE')).toHaveLength(0)
    const result = await main([...args, `--cleanup-fixture=${path}`], environment())
    expect(JSON.stringify(log.mock.calls)).not.toContain(state.accounts[0].password)
    expect(JSON.stringify(log.mock.calls)).not.toContain(environment().SUPABASE_SERVICE_ROLE_KEY)
    return { ...fake, result, path, state }
  }
  it('recovers the exact provisioned personal organization after failed setup reads, persists ownership, and cleans up only that account', async () => {
    const recovered = await failSetupThenRetryCleanup()
    expect(recovered.result).toBe(0)
    expect(existsSync(recovered.path)).toBe(false)
    expect(recovered.repairedReceipts).toHaveLength(1)
    expect(recovered.repairedReceipts[0]).toMatchObject({ id: recovered.state.accounts[0].id, membershipVerified: true, orgIds: [recovered.orgId] })
    expect(recovered.requests.filter(row => row.method === 'DELETE').map(row => row.path))
      .toEqual(['/rest/v1/organizations', `/auth/v1/admin/users/${recovered.state.accounts[0].id}`])
    expect(recovered.requests.findIndex(row => row.path === '/auth/v1/logout')).toBeLessThan(recovered.requests.findIndex(row => row.method === 'DELETE'))
  })
  it.each([{ wrongAuth: true }, { shared: true }, { extraMembership: true }])('retains a failed partial fixture without deletion or sign-out when recovery provenance is unsafe (%j)', async options => {
    const recovered = await failSetupThenRetryCleanup(options)
    expect(recovered.result).toBe(1)
    expect(existsSync(recovered.path)).toBe(true)
    expect(JSON.parse(readFileSync(recovered.path, 'utf8')).accounts[0]).toMatchObject({ membershipVerified: false, orgIds: [] })
    expect(recovered.requests.filter(row => row.method === 'DELETE' || row.path === '/auth/v1/logout')).toHaveLength(0)
  })
})
