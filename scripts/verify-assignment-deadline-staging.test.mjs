import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertStagingEnvironment, createStagingFetch, expectDenial, main, privateFixturePath, validateFixtureManifest } from './verify-assignment-deadline-staging.mjs'

const project = 'dyuxkrzeveknqgtuzpbh'
const args = ['--execute', '--confirm=assignment-deadline-staging-synthetic']
const jwt = (role, ref = project) => `fixture.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.fixture`
const environment = () => ({
  EXAM_QA_ENVIRONMENT: 'staging', KORKRU_DEPLOYMENT_ENV: 'staging', VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com', NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co`,
  ASSIGNMENT_DEADLINE_QA_MIGRATIONS_APPLIED: '20261019154815,20261019162413',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
})
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function manifest() {
  const run = id(1)
  return {
    version: 1, kind: 'assignment-deadline-staging', projectRef: project, target: 'https://staging.korkru.com', run,
    prefix: `Deadline QA ${run}`, accounts: [{ id: id(2), role: 'teacher', label: 'owner',
      email: `deadline-qa-${run}-owner@qa.staging.korkru.com`, password: 'synthetic-password-only', orgIds: [id(3)], membershipVerified: true }],
    classrooms: [{ id: id(4), ownerId: id(2), label: 'room-a' }],
    assignments: [{ id: id(5), ownerId: id(2), label: 'shared' }], assignmentId: id(5), foreignAssignmentId: null,
    questionIds: [id(6)], submissionIds: [], answerIds: [], extensionIds: [],
  }
}
afterEach(() => vi.restoreAllMocks())

describe('assignment deadline Staging harness safety fence', () => {
  it('accepts only the exact isolated project, site, migration and execution flags', () => {
    expect(() => assertStagingEnvironment(environment(), args)).not.toThrow()
    for (const altered of [[], ['--execute'], ['--execute', '--confirm=grading-staging-synthetic']]) {
      expect(() => assertStagingEnvironment(environment(), altered)).toThrow('confirmation')
    }
  })
  it.each([
    ['EXAM_QA_ENVIRONMENT', 'production'], ['KORKRU_DEPLOYMENT_ENV', 'production'], ['VERCEL_ENV', 'production'],
    ['NEXT_PUBLIC_SITE_URL', 'https://korkru.com'], ['NEXT_PUBLIC_SITE_URL', 'https://staging.korkru.com/'],
    ['NEXT_PUBLIC_SUPABASE_URL', 'https://libsutfinswqkruihwdx.supabase.co'],
    ['ASSIGNMENT_DEADLINE_QA_MIGRATIONS_APPLIED', '20261019154815'],
    ['ASSIGNMENT_DEADLINE_QA_MIGRATIONS_APPLIED', '20261019162413'],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', jwt('anon', 'libsutfinswqkruihwdx')],
    ['SUPABASE_SERVICE_ROLE_KEY', jwt('service_role', 'libsutfinswqkruihwdx')],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', jwt('service_role')], ['SUPABASE_SERVICE_ROLE_KEY', ''],
  ])('rejects a mismatched %s before creating clients or making requests', (name, value) => {
    expect(() => assertStagingEnvironment({ ...environment(), [name]: value }, args)).toThrow()
  })
  it('accepts project-scoped opaque keys only after the fixed Staging URL/site fence', () => {
    const env = { ...environment(), NEXT_PUBLIC_SUPABASE_ANON_KEY: `sb_publishable_${'a'.repeat(24)}`, SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${'b'.repeat(24)}` }
    expect(() => assertStagingEnvironment(env, args)).not.toThrow()
    expect(() => assertStagingEnvironment({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://example.com' }, args)).toThrow()
  })
  it('check-config and help return without a network request, and logs contain no credentials', async () => {
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in unit checks'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const env = environment()
    expect(await main([...args, '--check-config'], env)).toBe(0)
    expect(await main(['--help'], {})).toBe(0)
    expect(network).not.toHaveBeenCalled()
    const output = JSON.stringify(log.mock.calls)
    expect(output).not.toContain(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    expect(output).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY)
  })
  it('a Production target fails without network requests or echoing its key', async () => {
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in unit checks'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const env = { ...environment(), NEXT_PUBLIC_SUPABASE_URL: 'https://libsutfinswqkruihwdx.supabase.co' }
    expect(await main(args, env)).toBe(1)
    expect(network).not.toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY)
  })
  it('restricts fixture paths to an owned basename directly in the private temporary directory', () => {
    expect(privateFixturePath('/private/tmp/korkru-assignment-deadline-staging-unit.json')).toBe('/private/tmp/korkru-assignment-deadline-staging-unit.json')
    for (const path of ['relative.json', '/Users/korkusonmasaen/Korkru/fixture.json', '/private/tmp/other-fixture.json', '/private/tmp/korkru-assignment-deadline-staging-../other.json']) {
      expect(() => privateFixturePath(path)).toThrow()
    }
  })
})

describe('private cleanup manifest identity bounds', () => {
  it('accepts partial or full bounded synthetic fixtures without requiring a completed verification', () => {
    const state = manifest()
    expect(validateFixtureManifest(state)).toBe(state)
    const partial = { ...state, accounts: [], classrooms: [], assignments: [], assignmentId: null, questionIds: [] }
    expect(validateFixtureManifest(partial)).toBe(partial)
  })
  it.each([
    state => { state.projectRef = 'libsutfinswqkruihwdx' },
    state => { state.target = 'https://korkru.com' },
    state => { state.prefix = 'unrelated run' },
    state => { state.accounts[0].email = 'real-user@example.com' },
    state => { state.accounts[0].role = 'student' },
    state => { state.accounts.push({ ...state.accounts[0] }) },
    state => { state.classrooms[0].ownerId = id(99) },
    state => { state.assignmentId = id(99) },
    state => { state.foreignAssignmentId = id(99) },
    state => { state.submissionIds = [id(7), id(7)] },
    state => { state.answerIds = [id(7), id(8), id(9)] },
  ])('rejects forged or out-of-bounds cleanup provenance', mutate => {
    const state = manifest(); mutate(state)
    expect(() => validateFixtureManifest(state)).toThrow()
  })
})

describe('bounded Staging-only fetch', () => {
  const url = `https://${project}.supabase.co/rest/v1/rpc/extend_assignment_deadline`
  const waitForAbort = (_input, init) => new Promise((_resolve, reject) => {
    if (init.signal.aborted) reject(init.signal.reason)
    else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
  })
  it('aborts a stalled POST once without retrying', async () => {
    const request = vi.fn(waitForAbort)
    const bounded = createStagingFetch({ fetchImpl: request, timeoutMs: 10 })
    await expect(bounded(url, { method: 'POST', body: 'private body' })).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][1].redirect).toBe('error')
  })
  it('composes the caller abort with the timeout instead of replacing it', async () => {
    const controller = new AbortController(), reason = new Error('caller cancellation')
    const request = vi.fn(waitForAbort)
    const pending = createStagingFetch({ fetchImpl: request })(url, { method: 'POST', signal: controller.signal })
    controller.abort(reason)
    await expect(pending).rejects.toBe(reason)
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('preserves an input Request abort signal', async () => {
    const controller = new AbortController(), reason = new Error('input request cancellation')
    const request = vi.fn(waitForAbort)
    const pending = createStagingFetch({ fetchImpl: request })(new Request(url, { signal: controller.signal }))
    controller.abort(reason)
    await expect(pending).rejects.toBe(reason)
  })
  it('keeps the timeout signal alive for a stalled response body after headers', async () => {
    const request = vi.fn(async (_input, init) => new Response(new ReadableStream({
      start(controller) { init.signal.addEventListener('abort', () => controller.error(init.signal.reason), { once: true }) },
    })))
    const response = await createStagingFetch({ fetchImpl: request, timeoutMs: 10 })(url)
    await expect(response.text()).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('logs only method and fixed route classification, never IDs, query values, headers or body', async () => {
    const trace = vi.fn(), request = vi.fn(async () => new Response('{}', { status: 200 }))
    await createStagingFetch({ fetchImpl: request, trace })(
      `https://${project}.supabase.co/auth/v1/admin/users/${id(100)}?private=secret-query`,
      { method: 'DELETE', headers: { Authorization: 'Bearer private-token' }, body: 'private-body' },
    )
    expect(trace.mock.calls).toEqual([
      ['START', { method: 'DELETE', pathKind: 'Auth administration' }],
      ['DONE', { method: 'DELETE', pathKind: 'Auth administration', outcome: 'headers_received', httpStatus: 200 }],
    ])
    const output = JSON.stringify(trace.mock.calls)
    for (const secret of [id(100), 'secret-query', 'private-token', 'private-body']) expect(output).not.toContain(secret)
  })
  it('rejects non-Staging origins and URL credentials before issuing any request', async () => {
    const request = vi.fn()
    const bounded = createStagingFetch({ fetchImpl: request })
    for (const target of ['https://libsutfinswqkruihwdx.supabase.co/rest/v1/users', `https://user:secret@${project}.supabase.co/rest/v1/users`]) {
      await expect(bounded(target)).rejects.toThrow('non-Staging')
    }
    expect(request).not.toHaveBeenCalled()
  })
})

describe('exact denial evidence', () => {
  it('accepts only the explicitly expected database error code', () => {
    expect(() => expectDenial({ error: { code: 'PT409' } }, 'Stale snapshot', 'PT409')).not.toThrow()
    expect(() => expectDenial({ error: { code: '42501' } }, 'Forbidden actor')).not.toThrow()
    expect(() => expectDenial({ error: { code: '40001' } }, 'Stale snapshot', 'PT409')).toThrow('expected denial PT409, received 40001')
  })
  it('labels a genuinely successful denied operation as unexpected success', () => {
    expect(() => expectDenial({ error: null, data: { id: id(1) } }, 'Forbidden actor')).toThrow('request unexpectedly succeeded')
  })
  it.each(['TimeoutError', 'AbortError'])('does not mistake %s for an accepted write or a confirmed denial', name => {
    let failure
    try { expectDenial({ error: { code: '', message: `${name}: private-query-with-token` } }, 'Stale snapshot', 'PT409') } catch (error) { failure = error }
    expect(failure?.message).toBe('Stale snapshot: request aborted or timed out; denial not confirmed')
    expect(failure?.message).not.toContain('private-query-with-token')
  })
  it('reports a generic transport error without echoing SDK details', () => {
    expect(() => expectDenial({ error: { code: '', message: 'FetchError: private-token' } }, 'Forbidden actor'))
      .toThrow('expected denial 42501, received request_failed')
  })
})
