import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSebExamContextClaims } from './seb-exam-context-core'
import { GET } from '../app/auth/callback/route'

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(), consume: vi.fn(), finish: vi.fn(), exchange: vi.fn(),
  from: vi.fn(), cookieSet: vi.fn(), profile: null as Record<string, unknown> | null,
  order: [] as string[],
}))
vi.mock('@/lib/seb-exam-auth.server', () => ({
  inspectWaitingAuthCallback: mocks.inspect,
  consumeWaitingAuthNonce: mocks.consume,
  finishWaitingAuthentication: mocks.finish,
}))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { exchangeCodeForSession: mocks.exchange } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: mocks.cookieSet }) }))

const origin = 'https://korkru-seb-uat.vercel.app'
const context = createSebExamContextClaims({
  assignmentId: '11111111-1111-4111-8111-111111111111', revision: 7,
  releaseId: 'asr-11111111111141118111111111111111-r7-abcdef0123456789',
}, { now: 1_800_000_000_000 })
const base = `/exam/${context.assignmentId}/r/7`
const user = { id: '22222222-2222-4222-8222-222222222222', email: 'student@example.test', user_metadata: {} }
const request = (query = '?code=one-time-code') => new NextRequest(`${origin}/auth/callback${query}`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order = []
  mocks.inspect.mockResolvedValue({ kind: 'ordinary' })
  mocks.consume.mockImplementation(async () => { mocks.order.push('consume') })
  mocks.finish.mockResolvedValue({ success: true, href: `${base}/waiting` })
  mocks.exchange.mockImplementation(async () => { mocks.order.push('exchange'); return { data: { user }, error: null } })
  mocks.profile = { id: user.id, full_name: 'นักเรียนทดสอบ', role: 'student', survey_role: 'student' }
  mocks.from.mockImplementation(() => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: mocks.profile }) }
    return chain
  })
})

describe('waiting callback stays exam-only', () => {
  it('rejects missing/tampered context before auth exchange', async () => {
    mocks.inspect.mockResolvedValue({ kind: 'denied', loginHref: null })
    const response = await GET(request('?code=once&exam_handoff=bad'))
    expect(response.status).toBe(403)
    expect(response.headers.get('location')).toBeNull()
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.consume).not.toHaveBeenCalled()
  })

  it('redirects valid-context handoff failure only to canonical exam login', async () => {
    mocks.inspect.mockResolvedValue({ kind: 'denied', loginHref: `${base}/login` })
    expect((await GET(request())).headers.get('location')).toBe(`${origin}${base}/login?error=auth_failed`)
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('does not consume/exchange a missing code and never falls back to dashboard', async () => {
    mocks.inspect.mockResolvedValue({ kind: 'waiting', context })
    expect((await GET(request(''))).headers.get('location')).toBe(`${origin}${base}/login?error=missing_code`)
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.consume).not.toHaveBeenCalled()
  })

  it.each(['waiting', 'profile'])('consumes nonce before exchange and redirects only to scoped %s', async surface => {
    mocks.inspect.mockResolvedValue({ kind: 'waiting', context })
    mocks.finish.mockResolvedValue({ success: true, href: `${base}/${surface}` })
    const response = await GET(request())
    expect(mocks.order).toEqual(['consume', 'exchange'])
    expect(response.headers.get('location')).toBe(`${origin}${base}/${surface}`)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('keeps exchange/profile errors and unexpected hrefs on canonical login', async () => {
    mocks.inspect.mockResolvedValue({ kind: 'waiting', context })
    mocks.exchange.mockResolvedValueOnce({ data: { user: null }, error: { message: 'provider-secret' } })
    expect((await GET(request())).headers.get('location')).toBe(`${origin}${base}/login?error=auth_failed`)
    expect(mocks.finish).not.toHaveBeenCalled()
    mocks.finish.mockResolvedValueOnce({ error: 'not on roster' })
    expect((await GET(request())).headers.get('location')).toBe(`${origin}${base}/login?error=auth_failed`)
    mocks.finish.mockResolvedValueOnce({ success: true, href: '/dashboard' })
    expect((await GET(request())).headers.get('location')).toBe(`${origin}${base}/login?error=auth_failed`)
    mocks.finish.mockRejectedValueOnce(new Error('private provider error'))
    expect((await GET(request())).headers.get('location')).toBe(`${origin}${base}/login?error=auth_failed`)
  })
})

describe('ordinary Google, Magic Link and password-recovery callback regression', () => {
  it('preserves default dashboard and existing explicit next routing without exam marker', async () => {
    expect((await GET(request())).headers.get('location')).toBe(`${origin}/dashboard`)
    expect((await GET(request('?code=once&next=/assignments'))).headers.get('location')).toBe(`${origin}/assignments`)
    expect(mocks.consume).not.toHaveBeenCalled()
    expect(mocks.finish).not.toHaveBeenCalled()
  })

  it('preserves reset-password and first Google profile completion routing', async () => {
    expect((await GET(request('?code=once&next=/reset-password'))).headers.get('location')).toBe(`${origin}/reset-password`)
    mocks.profile = { ...mocks.profile, survey_role: null }
    expect((await GET(request('?code=once&role=teacher'))).headers.get('location')).toBe(`${origin}/complete-profile?role=teacher`)
  })

  it('preserves ordinary missing-code failure', async () => {
    expect((await GET(request(''))).headers.get('location')).toBe(`${origin}/login?error=missing_code`)
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
})
