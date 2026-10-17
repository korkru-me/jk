import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(), issueGrant: vi.fn(), hasIntent: vi.fn(), consumeIntent: vi.fn(),
  createServer: vi.fn(), createAdmin: vi.fn(), profile: vi.fn(), eq: vi.fn(),
  cookieGetAll: vi.fn(), cookieSet: vi.fn(),
}))
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServer }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdmin }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: mocks.cookieGetAll, set: mocks.cookieSet })) }))
vi.mock('@/lib/auth/recovery-grant.server', () => ({ issueRecoveryGrant: mocks.issueGrant }))
vi.mock('@/lib/auth/recovery-intent.server', () => ({ hasRecoveryIntentNonce: mocks.hasIntent, consumeRecoveryIntent: mocks.consumeIntent }))
import { GET } from '@/app/auth/callback/route'

const nonce = 'n'.repeat(43)
function request(query: string) { return new NextRequest(`https://fixture.invalid/auth/callback?${query}`) }
function recoveryQuery(extra = '') { return `code=synthetic-code&next=%2Freset-password&recovery_nonce=${nonce}${extra}` }

beforeEach(() => {
  mocks.createServer.mockReturnValue({ auth: { exchangeCodeForSession: mocks.exchange } })
  mocks.exchange.mockResolvedValue({ data: { user: { id: 'verified-user', email: 'Student@Example.COM' }, session: { access_token: 'synthetic-session' } }, error: null })
  mocks.hasIntent.mockResolvedValue(true)
  mocks.consumeIntent.mockResolvedValue(true)
  mocks.issueGrant.mockResolvedValue(true)
  mocks.profile.mockResolvedValue({ data: { id: 'verified-user', role: 'student', survey_role: 'student' }, error: null })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.profile })
  mocks.createAdmin.mockReturnValue({ from: () => ({ select: () => ({ eq: mocks.eq }) }) })
  mocks.cookieGetAll.mockReturnValue([])
})
afterEach(() => { vi.resetAllMocks() })

describe('recovery email callback authorization', () => {
  it('does not let user-controlled next alone mint a recovery grant through an OAuth code', async () => {
    const response = await GET(request('code=oauth-code&next=%2Freset-password'))
    expect(response.headers.get('location')).toBe('https://fixture.invalid/reset-password')
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.issueGrant).not.toHaveBeenCalled()
    expect(mocks.createAdmin).not.toHaveBeenCalled()
  })

  it('rejects missing, wrong-browser or invalid nonce intent before exchanging a code', async () => {
    mocks.hasIntent.mockResolvedValue(false)
    await GET(request(recoveryQuery()))
    expect(mocks.hasIntent).toHaveBeenCalledWith(nonce)
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.issueGrant).not.toHaveBeenCalled()
  })

  it('requires a successful exchange, the intended recipient and an exchanged session before issuing the grant', async () => {
    const response = await GET(request(recoveryQuery()))
    expect(mocks.exchange).toHaveBeenCalledWith('synthetic-code')
    expect(mocks.consumeIntent).toHaveBeenCalledWith(nonce, 'Student@Example.COM', 'verified-user')
    expect(mocks.consumeIntent.mock.invocationCallOrder[0]).toBeLessThan(mocks.issueGrant.mock.invocationCallOrder[0])
    expect(mocks.issueGrant).toHaveBeenCalledWith('verified-user', 'synthetic-session')
    expect(response.headers.get('location')).toBe('https://fixture.invalid/reset-password')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.createAdmin).not.toHaveBeenCalled()
  })

  it('never uses the SDK redirectType value as email proof', async () => {
    mocks.hasIntent.mockResolvedValue(false)
    mocks.exchange.mockResolvedValue({ data: { user: { id: 'verified-user', email: 'student@example.com' }, session: { access_token: 'synthetic' }, redirectType: 'recovery' }, error: null })
    await GET(request(recoveryQuery()))
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.issueGrant).not.toHaveBeenCalled()
  })

  it.each([
    { data: { user: null, session: null }, error: { code: 'invalid_grant' } },
    { data: { user: { id: 'verified-user', email: 'student@example.com' }, session: null }, error: null },
  ])('does not issue a grant for a failed or sessionless exchange (%j)', async (result) => {
    mocks.exchange.mockResolvedValue(result)
    await GET(request(recoveryQuery()))
    expect(mocks.issueGrant).not.toHaveBeenCalled()
  })

  it('rejects a valid code for another recipient and does not provision its profile', async () => {
    mocks.consumeIntent.mockResolvedValue(false)
    mocks.exchange.mockResolvedValue({ data: { user: { id: 'another-user', email: 'another@example.com' }, session: { access_token: 'another-session' } }, error: null })
    await GET(request(recoveryQuery()))
    expect(mocks.consumeIntent).toHaveBeenCalledWith(nonce, 'another@example.com', 'another-user')
    expect(mocks.issueGrant).not.toHaveBeenCalled()
    expect(mocks.createAdmin).not.toHaveBeenCalled()
  })

  it('does not issue a grant when the email matches but the authenticated setup user ID changed', async () => {
    mocks.consumeIntent.mockResolvedValue(false)
    mocks.exchange.mockResolvedValue({ data: { user: { id: 'another-user', email: 'Student@Example.COM' }, session: { access_token: 'another-session' } }, error: null })
    await GET(request(recoveryQuery()))
    expect(mocks.consumeIntent).toHaveBeenCalledWith(nonce, 'Student@Example.COM', 'another-user')
    expect(mocks.issueGrant).not.toHaveBeenCalled()
    expect(mocks.createAdmin).not.toHaveBeenCalled()
  })

  it('rejects cross-flow nonce use on signup or normal OAuth callback destinations', async () => {
    for (const query of [recoveryQuery('&flow=signup'), `code=oauth-code&recovery_nonce=${nonce}`]) await GET(request(query))
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.issueGrant).not.toHaveBeenCalled()
  })

  it('does not issue a grant when the code is missing or the intent cookie cannot be checked', async () => {
    await GET(request(`next=%2Freset-password&recovery_nonce=${nonce}`))
    mocks.hasIntent.mockRejectedValueOnce(new Error('cookie unavailable'))
    await GET(request(recoveryQuery()))
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.issueGrant).not.toHaveBeenCalled()
  })

  it.each(['teacher', 'student'])('keeps an ordinary Google callback in the same %s profile without issuing recovery', async (role) => {
    mocks.profile.mockResolvedValue({ data: { id: 'verified-user', role, survey_role: role }, error: null })
    const response = await GET(request('code=oauth-code'))
    expect(response.headers.get('location')).toBe('https://fixture.invalid/dashboard')
    expect(mocks.eq).toHaveBeenCalledWith('id', 'verified-user')
    expect(mocks.hasIntent).not.toHaveBeenCalled()
    expect(mocks.consumeIntent).not.toHaveBeenCalled()
    expect(mocks.issueGrant).not.toHaveBeenCalled()
  })
})
