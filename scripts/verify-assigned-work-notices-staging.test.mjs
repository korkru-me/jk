import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertStagingEnvironment, main, parseRunMode, privateFixturePath, validateCanonicalAssignments, validateFixtureManifest, verifyNoticeRows } from './verify-assigned-work-notices-staging.mjs'

const project = 'dyuxkrzeveknqgtuzpbh'
const args = ['--execute', '--confirm=assigned-work-notices-staging-synthetic']
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const jwt = (role, ref = project) => `fixture.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.fixture`
const environment = () => ({
  EXAM_QA_ENVIRONMENT: 'staging', KORKRU_DEPLOYMENT_ENV: 'staging', VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com', NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
  ASSIGNED_WORK_NOTICE_QA_MIGRATION_PARITY_VERIFIED: project,
})
const temporaryPaths = []
function manifest() {
  const run = id(1), prefix = `Assigned Work QA ${run}`
  return {
    version: 1, kind: 'assigned-work-notices-staging', projectRef: project, target: 'https://staging.korkru.com', run, prefix,
    accounts: ['teacher', 'student'].map((role, index) => ({ id: id(10 + index), label: role, role,
      email: `assigned-work-qa-${run}-${role}@qa.staging.korkru.com`, password: 'synthetic-fixture-only-password', orgIds: [id(20 + index)], membershipVerified: true })),
    classroomId: id(30), questionId: id(31), assignments: [
      { id: id(40), type: 'exam', title: `${prefix} exam` }, { id: id(41), type: 'exercise', title: `${prefix} exercise` },
    ],
  }
}
function canonical(state = manifest()) {
  return state.assignments.map(row => ({ ...row, created_by: state.accounts[0].id, org_id: state.accounts[0].orgIds[0],
    mode: 'online', status: 'published', question_ids: [state.questionId], secure_browser_mode: 'browser' }))
}
const links = state => state.assignments.map(row => ({ assignment_id: row.id, classroom_id: state.classroomId, group_ids: null }))
function notices(state = manifest()) {
  return state.assignments.map((row, index) => ({ id: id(60 + index), type: 'classroom_post', actor_id: state.accounts[0].id,
    recipient_id: state.accounts[1].id, org_id: state.accounts[0].orgIds[0], related_assignment_id: row.id,
    related_classroom_id: state.classroomId, link: `/classrooms/${state.classroomId}`, title: `มีงานใหม่: ${row.title}`, body: 'ข้อความสมมติ', is_read: false }))
}
afterEach(() => { vi.restoreAllMocks(); for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true }) })

describe('assigned-work fixture Staging-only execution fence', () => {
  it('requires its own explicit synthetic confirmation and a verified exact project ledger', () => {
    expect(() => assertStagingEnvironment(environment(), args)).not.toThrow()
    for (const flags of [[], ['--execute'], ['--execute', '--confirm=assignment-reminders-staging-synthetic']]) expect(() => assertStagingEnvironment(environment(), flags)).toThrow()
    expect(() => assertStagingEnvironment({ ...environment(), ASSIGNED_WORK_NOTICE_QA_MIGRATION_PARITY_VERIFIED: '' }, args)).toThrow('migration parity')
  })
  it.each([
    ['EXAM_QA_ENVIRONMENT', 'production'], ['KORKRU_DEPLOYMENT_ENV', 'production'], ['VERCEL_ENV', 'production'],
    ['NEXT_PUBLIC_SITE_URL', 'https://www.korkru.com'], ['NEXT_PUBLIC_SUPABASE_URL', 'https://libsutfinswqkruihwdx.supabase.co'],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', jwt('anon', 'libsutfinswqkruihwdx')], ['SUPABASE_SERVICE_ROLE_KEY', jwt('service_role', 'libsutfinswqkruihwdx')],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', jwt('service_role')], ['SUPABASE_SERVICE_ROLE_KEY', ''],
    ['ASSIGNED_WORK_NOTICE_QA_MIGRATION_PARITY_VERIFIED', 'libsutfinswqkruihwdx'],
  ])('rejects unsafe %s before requests', (key, value) => {
    expect(() => assertStagingEnvironment({ ...environment(), [key]: value }, args)).toThrow()
  })
  it('help, config preflight and rejected Production execution neither fetch nor disclose keys', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(await main(['--help'], {})).toBe(0)
    expect(await main([...args, '--check-config'], environment())).toBe(0)
    expect(await main([...args, '--create-fixture'], { ...environment(), VERCEL_ENV: 'production' })).toBe(1)
    expect(request).not.toHaveBeenCalled()
    const output = JSON.stringify(log.mock.calls)
    expect(output).not.toContain(environment().NEXT_PUBLIC_SUPABASE_ANON_KEY)
    expect(output).not.toContain(environment().SUPABASE_SERVICE_ROLE_KEY)
  })
  it('has four exclusive modes and bounded read/assignment expectations', () => {
    expect(parseRunMode([...args, '--create-fixture'])).toEqual({ mode: 'create', expectedReadCount: null, expectedAssignmentCount: null })
    expect(parseRunMode([...args, '--verify-fixture', '--fixture-file=x', '--expected-read-count=1', '--expected-assignment-count=2']))
      .toEqual({ mode: 'verify', expectedReadCount: 1, expectedAssignmentCount: 2 })
    for (const flags of [[], ['--create-fixture', '--cleanup-fixture'], ['--verify-fixture'], ['--discover-fixture'],
      ['--cleanup-fixture'], ['--create-fixture', '--expected-read-count=0'],
      ['--cleanup-fixture', '--fixture-file=x', '--expected-assignment-count=1'],
      ['--discover-fixture', '--fixture-file=x', '--expected-read-count=0'],
      ['--verify-fixture', '--fixture-file=x', '--expected-read-count=3']]) expect(() => parseRunMode([...args, ...flags])).toThrow()
  })
  it('restricts manifest filenames and rejects public, symlinked or forged manifest files before requests', async () => {
    expect(privateFixturePath('/private/tmp/korkru-assigned-work-notices-staging-unit.json')).toContain('/private/tmp/')
    for (const path of ['relative.json', '/private/tmp/unrelated.json', '/Users/korkusonmasaen/Korkru/test.json']) expect(() => privateFixturePath(path)).toThrow()
    const directory = mkdtempSync('/private/tmp/korkru-assigned-fixture-unit-'); temporaryPaths.push(directory)
    const path = '/private/tmp/korkru-assigned-work-notices-staging-unit-private.json'; temporaryPaths.push(path)
    const target = join(directory, 'fixture.json')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const request = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'))
    writeFileSync(path, JSON.stringify(manifest()), { mode: 0o644 }); chmodSync(path, 0o644)
    expect(await main([...args, '--verify-fixture', `--fixture-file=${path}`], environment())).toBe(1)
    rmSync(path); writeFileSync(target, JSON.stringify(manifest()), { mode: 0o600 }); symlinkSync(target, path)
    expect(await main([...args, '--cleanup-fixture', `--fixture-file=${path}`], environment())).toBe(1)
    rmSync(path); writeFileSync(path, JSON.stringify({ ...manifest(), projectRef: 'libsutfinswqkruihwdx' }), { mode: 0o600 })
    expect(await main([...args, '--cleanup-fixture', `--fixture-file=${path}`], environment())).toBe(1)
    expect(request).not.toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-fixture-only-password')
  })
})

describe('synthetic identity and exact cleanup provenance', () => {
  it('accepts complete and partial recovery manifests, including the zero-work browser baseline', () => {
    const state = manifest()
    expect(validateFixtureManifest(state)).toBe(state)
    expect(validateFixtureManifest({ ...state, assignments: [] }).assignments).toEqual([])
    expect(validateFixtureManifest({ ...state, accounts: [], classroomId: null, questionId: null, assignments: [] }).accounts).toEqual([])
  })
  it.each([
    state => { state.projectRef = 'libsutfinswqkruihwdx' }, state => { state.target = 'https://www.korkru.com' },
    state => { state.prefix = 'real user work' }, state => { state.accounts[0].email = 'teacher@real.example' },
    state => { state.accounts[0].role = 'student' }, state => { state.accounts[1].label = 'teacher' },
    state => { state.accounts.push({ ...state.accounts[0], id: id(999) }) }, state => { state.accounts[0].orgIds.push(id(999)) },
    state => { state.accounts[0].orgIds = [] }, state => { state.questionId = 'not-a-uuid' },
    state => { state.assignments[0].title = 'another work' }, state => { state.assignments[1].type = 'exam' },
    state => { state.assignments[1].id = state.assignments[0].id }, state => { state.accounts = [] },
  ])('refuses forged or unbounded identity manifests', mutate => {
    const state = manifest(); mutate(state); expect(() => validateFixtureManifest(state)).toThrow()
  })
  it('accepts only canonical teacher-created online work with the exact question and single room audience', () => {
    const state = manifest()
    expect(validateCanonicalAssignments(state, canonical(state), links(state), [])).toEqual(state.assignments)
    expect(validateCanonicalAssignments({ ...state, assignments: [] }, [], [], [])).toEqual([])
  })
  it.each([
    rows => { rows[0].created_by = id(999) }, rows => { rows[0].org_id = id(999) }, rows => { rows[0].title = 'another run' },
    rows => { rows[0].mode = 'offline' }, rows => { rows[0].secure_browser_mode = 'seb_required' }, rows => { rows[0].question_ids.push(id(999)) },
    rows => { rows[0].question_ids = [id(999)] }, rows => { rows[1].type = 'exam' }, rows => { rows.push({ ...rows[0], id: id(999) }) },
  ])('refuses canonical work provenance changes', mutate => {
    const state = manifest(), rows = canonical(state); mutate(rows)
    expect(() => validateCanonicalAssignments(state, rows, links(state), [])).toThrow()
  })
  it('refuses cross-room/group audiences, unexpected links and any learner attempt before cleanup', () => {
    const state = manifest()
    for (const changedLinks of [links(state).slice(1), [...links(state), { assignment_id: id(999), classroom_id: state.classroomId, group_ids: null }],
      links(state).map((row, index) => index === 0 ? { ...row, classroom_id: id(999) } : row),
      links(state).map((row, index) => index === 0 ? { ...row, group_ids: [] } : row)]) {
      expect(() => validateCanonicalAssignments(state, canonical(state), changedLinks, [])).toThrow()
    }
    expect(() => validateCanonicalAssignments(state, canonical(state), links(state), [{ id: id(999) }])).toThrow('learner attempts')
  })
})

describe('durable publication receipt assertions', () => {
  it('distinguishes the empty baseline, unread publications and successful student acknowledgements', () => {
    const state = manifest(), rows = notices(state)
    expect(verifyNoticeRows({ ...state, assignments: [] }, [], 0)).toEqual({ assignments: 0, notices: 0, read: 0, unread: 0, attempts: 0 })
    expect(verifyNoticeRows(state, rows, 0)).toMatchObject({ notices: 2, read: 0, unread: 2 })
    rows[0].is_read = true
    expect(verifyNoticeRows(state, rows, 1)).toMatchObject({ read: 1, unread: 1 })
    rows[1].is_read = true
    expect(verifyNoticeRows(state, rows, 2)).toMatchObject({ read: 2, unread: 0 })
    expect(() => verifyNoticeRows(state, rows, 0)).toThrow('Durable acknowledgement')
  })
  it.each([
    rows => { rows[0].type = 'assignment_reminder' }, rows => { rows[0].actor_id = id(999) }, rows => { rows[0].recipient_id = id(999) },
    rows => { rows[0].org_id = id(999) }, rows => { rows[0].related_assignment_id = id(999) }, rows => { rows[0].related_classroom_id = id(999) },
    rows => { rows[0].link = 'https://external.example/' }, rows => { rows[0].is_read = 'true' }, rows => { rows[0].title = 'wrong work' },
    rows => { rows[0].body = '' }, rows => { rows[1].id = rows[0].id }, rows => { rows[1].related_assignment_id = rows[0].related_assignment_id },
    rows => { rows.pop() }, rows => { rows.push({ ...rows[0], id: id(999) }) },
  ])('rejects wrong recipients, spoofed links and duplicate or missing receipt evidence', mutate => {
    const state = manifest(), rows = notices(state); mutate(rows)
    expect(() => verifyNoticeRows(state, rows)).toThrow()
  })
})

describe('partial setup recovery through the real runner', () => {
  // These fake HTTP responses exercise SDK receipt parsing, the persisted
  // failed-setup manifest, and cleanup's actual request ordering. No client,
  // Auth or database method is stubbed, and no external request can occur.
  function partialSetupTransport(path, { shared = false, wrongAuth = false, extraMembership = false } = {}) {
    let account = null, failMembershipOnce = true, orgDeleted = false, accountDeleted = false
    const orgId = id(90), requests = [], repairedReceipts = []
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
    const fetch = vi.fn(async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
      expect(url.origin).toBe(`https://${project}.supabase.co`)
      const method = init?.method ?? 'GET'
      requests.push({ method, path: url.pathname, query: url.searchParams })
      if (url.pathname.startsWith('/rest/v1/') && url.searchParams.get('limit') === '0') return json([])
      if (url.pathname === '/auth/v1/admin/users' && method === 'POST') {
        const payload = JSON.parse(init.body)
        account = { id: id(80), email: payload.email, user_metadata: payload.user_metadata, aud: 'authenticated', role: 'authenticated' }
        return json(account)
      }
      if (url.pathname === `/auth/v1/admin/users/${id(80)}`) {
        if (method === 'DELETE') { accountDeleted = true; return json(account) }
        if (accountDeleted) return json({ message: 'User not found', code: 'user_not_found' }, 404)
        return json({ ...account, user_metadata: wrongAuth ? { ...account.user_metadata, qa_run: id(999) } : account.user_metadata })
      }
      if (url.pathname === '/rest/v1/organization_members') {
        if (url.searchParams.has('user_id')) {
          expect(url.searchParams.get('user_id')).toBe(`eq.${account.id}`)
          if (failMembershipOnce) { failMembershipOnce = false; return json({ code: 'P0001', message: 'Synthetic setup read failed' }, 400) }
          return json(extraMembership ? [{ org_id: orgId, org_role: 'owner' }, { org_id: id(91), org_role: 'owner' }] : [{ org_id: orgId, org_role: 'owner' }])
        }
        expect(url.searchParams.get('org_id')).toBe(`eq.${orgId}`)
        return json(shared ? [{ user_id: account.id, org_role: 'owner' }, { user_id: id(999), org_role: 'member' }] : [{ user_id: account.id, org_role: 'owner' }])
      }
      if (url.pathname === '/auth/v1/token') {
        const login = JSON.parse(init.body)
        expect(login.email).toBe(account.email)
        return json({ access_token: jwt('authenticated'), refresh_token: 'fixture-refresh-token', expires_in: 3600, token_type: 'bearer', user: account })
      }
      if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 })
      if (url.pathname === '/rest/v1/organizations') {
        expect(url.searchParams.get('id')).toBe(`eq.${orgId}`)
        if (method === 'DELETE') {
          repairedReceipts.push(JSON.parse(readFileSync(path, 'utf8')).accounts[0])
          orgDeleted = true; return new Response(null, { status: 204 })
        }
        return json(orgDeleted ? [] : [{ id: orgId }])
      }
      if (['/rest/v1/assignments', '/rest/v1/classrooms', '/rest/v1/questions'].includes(url.pathname)) {
        expect(url.searchParams.get('org_id')).toBe(`eq.${orgId}`)
        return json([])
      }
      throw new Error(`Unexpected mocked request ${method} ${url.pathname}`)
    })
    return { fetch, requests, repairedReceipts, orgId }
  }
  async function failSetupThenCleanup(options = {}) {
    const path = `/private/tmp/korkru-assigned-work-notices-staging-recovery-${process.pid}.json`; temporaryPaths.push(path)
    const fake = partialSetupTransport(path, options)
    vi.spyOn(globalThis, 'fetch').mockImplementation(fake.fetch)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(await main([...args, '--create-fixture', `--fixture-file=${path}`], environment())).toBe(1)
    const state = JSON.parse(readFileSync(path, 'utf8'))
    expect(state.accounts).toHaveLength(1)
    expect(state.accounts[0]).toMatchObject({ membershipVerified: false, orgIds: [] })
    expect(state.classroomId).toBeNull()
    expect(fake.requests.filter(row => row.method === 'DELETE')).toHaveLength(0)
    const result = await main([...args, '--cleanup-fixture', `--fixture-file=${path}`], environment())
    expect(JSON.stringify(log.mock.calls)).not.toContain(state.accounts[0].password)
    return { ...fake, result, path, state }
  }
  it('recovers an Auth receipt after its organization read failed, persists sole ownership, and removes only that fixture', async () => {
    const recovered = await failSetupThenCleanup()
    expect(recovered.result).toBe(0)
    expect(existsSync(recovered.path)).toBe(false)
    expect(recovered.repairedReceipts).toHaveLength(1)
    expect(recovered.repairedReceipts[0]).toMatchObject({ id: recovered.state.accounts[0].id, membershipVerified: true, orgIds: [recovered.orgId] })
    const deletes = recovered.requests.filter(row => row.method === 'DELETE')
    expect(deletes.map(row => row.path)).toEqual(['/rest/v1/organizations', `/auth/v1/admin/users/${recovered.state.accounts[0].id}`])
    expect(recovered.requests.findIndex(row => row.path === '/auth/v1/logout')).toBeLessThan(recovered.requests.findIndex(row => row.method === 'DELETE'))
  })
  it.each([{ shared: true }, { wrongAuth: true }, { extraMembership: true }])('preserves evidence and performs no deletion when recovery provenance fails (%j)', async options => {
    const recovered = await failSetupThenCleanup(options)
    expect(recovered.result).toBe(1)
    expect(existsSync(recovered.path)).toBe(true)
    expect(JSON.parse(readFileSync(recovered.path, 'utf8')).accounts[0]).toMatchObject({ membershipVerified: false, orgIds: [] })
    expect(recovered.requests.filter(row => row.method === 'DELETE')).toHaveLength(0)
    expect(recovered.requests.filter(row => row.path === '/auth/v1/logout')).toHaveLength(0)
  })
})
