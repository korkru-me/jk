import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEB_EXAM_TRUSTED_PATHNAME_HEADER } from '@/lib/seb-exam-transport-policy'
import { updateSession } from './middleware'

interface CookieAdapter {
  getAll: () => { name: string; value: string }[]
  setAll: (cookies: { name: string; value: string; options?: { httpOnly?: boolean; path?: string } }[]) => void
}
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getSession: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createClient }))

let adapter: CookieAdapter
beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockImplementation((_url: unknown, _key: unknown, options: { cookies: CookieAdapter }) => {
    adapter = options.cookies
    return { auth: { getSession: mocks.getSession } }
  })
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
})
afterEach(() => vi.restoreAllMocks())

describe('sanitized headers through Supabase refresh', () => {
  it('removes spoofed internal header for direct default refresh while preserving ordinary cookies', async () => {
    const req = new NextRequest('https://exam.test/dashboard', { headers: { cookie: 'ordinary=old', [SEB_EXAM_TRUSTED_PATHNAME_HEADER]: '/exam/fake' } })
    const response = await updateSession(req)
    expect(mocks.getSession).toHaveBeenCalledTimes(1)
    expect(adapter.getAll()).toContainEqual({ name: 'ordinary', value: 'old' })
    expect(response.headers.has(`x-middleware-request-${SEB_EXAM_TRUSTED_PATHNAME_HEADER}`)).toBe(false)
    expect(response.headers.get('x-middleware-request-cookie')).toBe('ordinary=old')
    expect(response.headers.get('location')).toBeNull()
  })

  it('preserves Proxy pathname plus refreshed request and response cookies', async () => {
    const pathname = '/exam/11111111-1111-4111-8111-111111111111/r/7/waiting'
    const req = new NextRequest(`https://exam.test${pathname}`, { headers: { cookie: 'auth=old; other=keep' } })
    const headers = new Headers(req.headers)
    headers.set(SEB_EXAM_TRUSTED_PATHNAME_HEADER, pathname)
    mocks.getSession.mockImplementation(async () => {
      adapter.setAll([{ name: 'auth', value: 'new', options: { httpOnly: true, path: '/' } }])
      return { data: { session: null }, error: null }
    })
    const response = await updateSession(req, headers)
    expect(response.headers.get(`x-middleware-request-${SEB_EXAM_TRUSTED_PATHNAME_HEADER}`)).toBe(pathname)
    expect(response.headers.get('x-middleware-request-cookie')).toContain('auth=new')
    expect(response.headers.get('x-middleware-request-cookie')).toContain('other=keep')
    expect(req.cookies.get('auth')?.value).toBe('new')
    expect(response.cookies.get('auth')?.value).toBe('new')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    // Refresh itself grants no exam authentication and invents no dashboard/login redirect.
    expect(response.headers.get('location')).toBeNull()
  })
})
