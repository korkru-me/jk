import { NextRequest, NextResponse } from 'next/server'
// The installed package still exports the legacy name despite the bundled proxy guide.
import { unstable_doesMiddlewareMatch as doesProxyMatch } from 'next/experimental/testing/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SEB_EXAM_CONTEXT_COOKIE_NAME,
  createSebExamContextClaims,
  signSebExamContextClaims,
} from './seb-exam-context-core'
import { SEB_EXAM_TRUSTED_PATHNAME_HEADER } from './seb-exam-transport-policy'
import { config, proxy } from '../proxy'

const mocks = vi.hoisted(() => ({ updateSession: vi.fn(), readSecret: vi.fn<() => string | null>() }))
vi.mock('@/lib/supabase/middleware', () => ({ updateSession: mocks.updateSession }))
vi.mock('@/lib/seb', () => ({ readSebSessionSecret: mocks.readSecret }))

const now = 1_800_000_000_000
const secret = 'test-only-exam-context-proxy-signing-secret'
const assignmentId = '11111111-1111-4111-8111-111111111111'
const scope = { assignmentId, revision: 7, releaseId: 'asr-11111111111141118111111111111111-r7-abcdef0123456789' }
const context = createSebExamContextClaims(scope, { now, userId: '22222222-2222-4222-8222-222222222222' })
const marker = `${SEB_EXAM_CONTEXT_COOKIE_NAME}=${signSebExamContextClaims(context, secret)}`
const base = `/exam/${assignmentId}/r/7`
function request(pathname: string, options: { cookie?: string; method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`https://exam.test${pathname}`, {
    method: options.method ?? 'GET',
    headers: { ...(options.cookie !== undefined ? { cookie: options.cookie } : {}), ...options.headers },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  vi.stubEnv('NODE_ENV', 'development')
  mocks.readSecret.mockReturnValue(secret)
  mocks.updateSession.mockImplementation(async (_request: NextRequest, headers: Headers) =>
    NextResponse.next({ request: { headers } }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('proxy matcher and pre-refresh scope gate', () => {
  it.each(['/', '/dashboard', '/_next/static/chunks/app.js', '/_next/image?url=secret', '/questions/answer.png', '/private.svg', `${base}/take?_rsc=abc`])('covers every transport including %s', url => {
    expect(doesProxyMatch({ config, nextConfig: {}, url })).toBe(true)
  })

  it.each(['/dashboard', '/assignments', '/api/other', '/_next/image?url=https://evil.test/x.png', '/questions/private.png', '/classrooms/private.svg', '/exam-screen-lab', '/exam/quit'])('denies restricted request %s before session construction', async pathname => {
    const response = await proxy(request(pathname, { cookie: marker }))
    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.updateSession).not.toHaveBeenCalled()
  })

  it('denies raw duplicate markers even though Next collapses them into one cookie', async () => {
    const req = request(`${base}/waiting`, { cookie: `${marker}; ${marker}` })
    expect(req.cookies.getAll(SEB_EXAM_CONTEXT_COOKIE_NAME)).toHaveLength(1)
    expect((await proxy(req)).status).toBe(403)
    expect(mocks.updateSession).not.toHaveBeenCalled()
  })

  it.each([
    `${SEB_EXAM_CONTEXT_COOKIE_NAME}=`, SEB_EXAM_CONTEXT_COOKIE_NAME,
    `${SEB_EXAM_CONTEXT_COOKIE_NAME}=bad`, `${SEB_EXAM_CONTEXT_COOKIE_NAME} =bad`,
    `${SEB_EXAM_CONTEXT_COOKIE_NAME}=%65encoded`,
  ])('rejects malformed marker %j on noncanonical requests', async cookie => {
    expect((await proxy(request('/dashboard', { cookie }))).status).toBe(403)
    expect(mocks.updateSession).not.toHaveBeenCalled()
  })

  it('fails closed with expired token or unavailable signing secret', async () => {
    vi.mocked(Date.now).mockReturnValue(context.expiresAt)
    expect((await proxy(request(`${base}/waiting`, { cookie: marker }))).status).toBe(403)
    vi.mocked(Date.now).mockReturnValue(now)
    mocks.readSecret.mockReturnValue(null)
    expect((await proxy(request(`${base}/entry`, { cookie: marker }))).status).toBe(403)
    expect(mocks.updateSession).not.toHaveBeenCalled()
  })

  it('permits only canonical entry without a marker and forwards its actual pathname', async () => {
    const response = await proxy(request(`${base}/entry`))
    expect(response.status).toBe(200)
    expect(mocks.updateSession.mock.calls[0][1].get(SEB_EXAM_TRUSTED_PATHNAME_HEADER)).toBe(`${base}/entry`)
    mocks.updateSession.mockClear()
    for (const pathname of [`${base}/waiting`, `${base}/take`, `${base}/waiting/`, `${base}/completion.seb`, `${base}/api/start`, `${base.replace('/r/7', '/r/07')}/entry`, `${base.replace('/exam/', '/exam%2f')}/entry`]) {
      expect((await proxy(request(pathname))).status).toBe(403)
    }
    expect(mocks.updateSession).not.toHaveBeenCalled()
  })

  it('rejects cross-scope entry replacement and restricted Next-Action even on assets', async () => {
    expect((await proxy(request(`${base.replace('/r/7', '/r/8')}/entry`, { cookie: marker }))).status).toBe(403)
    for (const pathname of [`${base}/waiting`, `${base}/api`, '/auth/callback', '/icon.png', '/_next/static/chunks/app.js']) {
      expect((await proxy(request(pathname, { cookie: marker, headers: { 'Next-Action': '' } }))).status).toBe(403)
    }
    expect(mocks.updateSession).not.toHaveBeenCalled()
  })

  it('rejects progressive form POST and only permits dedicated JSON API transport', async () => {
    expect((await proxy(request(`${base}/waiting`, { cookie: marker, method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } }))).status).toBe(405)
    expect((await proxy(request(`${base}/api`, { cookie: marker, method: 'POST', headers: { 'content-type': 'text/plain' } }))).status).toBe(415)
    expect(mocks.updateSession).not.toHaveBeenCalled()
    expect((await proxy(request(`${base}/api`, { cookie: marker, method: 'POST', headers: { 'content-type': 'application/json' } }))).status).toBe(200)
    expect(mocks.updateSession).toHaveBeenCalledTimes(1)
  })

  it('canonicalizes trusted pathname header and ignores RSC query/header aliases', async () => {
    const req = request(`${base}/take?_rsc=foo`, { cookie: marker, headers: { [SEB_EXAM_TRUSTED_PATHNAME_HEADER]: '/dashboard', RSC: '1' } })
    await proxy(req)
    expect(mocks.updateSession.mock.calls[0][1].get(SEB_EXAM_TRUSTED_PATHNAME_HEADER)).toBe(`${base}/take`)
    mocks.updateSession.mockClear()
    await proxy(request('/dashboard', { headers: { [SEB_EXAM_TRUSTED_PATHNAME_HEADER]: `${base}/waiting` } }))
    expect(mocks.updateSession.mock.calls[0][1].has(SEB_EXAM_TRUSTED_PATHNAME_HEADER)).toBe(false)
  })

  it('allows only finite protected assets without session refresh and strips spoofed header', async () => {
    for (const pathname of ['/icon.png', '/apple-icon.png', '/brand/deer-mark.svg', '/brand/deer-mark.png', '/favicon.ico', '/_next/static/chunks/app.js']) {
      const response = await proxy(request(pathname, { cookie: marker, headers: { [SEB_EXAM_TRUSTED_PATHNAME_HEADER]: '/dashboard' } }))
      expect(response.status).toBe(200)
      expect(response.headers.has(`x-middleware-request-${SEB_EXAM_TRUSTED_PATHNAME_HEADER}`)).toBe(false)
    }
    expect(mocks.updateSession).not.toHaveBeenCalled()
    for (const pathname of ['/brand/deer-mark-source.png', '/uploads/private.jpg', '/_next/data/build/dashboard.json']) {
      expect((await proxy(request(pathname, { cookie: marker }))).status).toBe(403)
    }
  })
})

describe('ordinary browser regression', () => {
  it('keeps ordinary auth refresh and Server Actions unchanged', async () => {
    expect((await proxy(request('/dashboard', { method: 'POST', headers: { 'next-action': 'ordinary-action' } }))).status).toBe(200)
    expect(mocks.updateSession).toHaveBeenCalledTimes(1)
    expect(mocks.readSecret).not.toHaveBeenCalled()
  })

  it('keeps old asset and lab/Quit bypasses only without a marker', async () => {
    for (const pathname of ['/_next/image?url=normal', '/normal-image.png', '/ordinary.svg', '/favicon.ico', '/exam-screen-lab', '/exam/quit']) {
      const response = await proxy(request(pathname, { headers: { [SEB_EXAM_TRUSTED_PATHNAME_HEADER]: `${base}/take` } }))
      expect(response.status).toBe(200)
      expect(response.headers.has(`x-middleware-request-${SEB_EXAM_TRUSTED_PATHNAME_HEADER}`)).toBe(false)
    }
    expect(mocks.updateSession).not.toHaveBeenCalled()
  })
})
