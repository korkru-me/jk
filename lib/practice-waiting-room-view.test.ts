import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PracticeAccessCodeForm } from '@/components/practice/practice-access-code-form'
import PracticeEntryPage from '@/app/(app)/practice/[id]/page'

const mocks = vi.hoisted(() => ({ read: vi.fn(), hasCodeSession: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (href: string) => { throw new Error(`redirect:${href}`) },
  notFound: () => { throw new Error('not-found') },
}))
vi.mock('@/lib/auth/server', () => ({ getAuthUser: async () => ({ id: 'student' }) }))
vi.mock('@/lib/practice-question', () => ({ isPracticeLibraryEnabled: () => true }))
vi.mock('@/lib/practice-question-access.server', () => ({ loadPracticeLibraryWaiting: mocks.read }))
vi.mock('@/lib/practice-access-session.server', () => ({ hasPracticeAccessSession: mocks.hasCodeSession, grantPracticeAccessSession: vi.fn() }))

const id = '10000000-0000-4000-8000-000000000001'
const title = 'สอวน. ค่าย 1 · ไฟฟ้า'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('React', { createElement })
})
afterEach(() => vi.unstubAllGlobals())

function entry(requiresAccessCode: boolean, searchParams = {}) {
  mocks.read.mockResolvedValue({ status: 'ready', library: { id, title, requiresAccessCode } })
  return PracticeEntryPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(searchParams) })
}

describe('student practice library entry', () => {
  it('preserves search and enters the question list directly for an unlocked library', async () => {
    await expect(entry(false, { q: 'test' })).rejects.toThrow(`redirect:/practice/${id}/library?q=test`)
    expect(mocks.hasCodeSession).not.toHaveBeenCalled()
    mocks.hasCodeSession.mockResolvedValue(true)
    await expect(entry(true)).rejects.toThrow(`redirect:/practice/${id}/library`)
  })

  it('renders only the code prompt when access is locked', async () => {
    mocks.hasCodeSession.mockResolvedValue(false)
    const page = await entry(true, { access: 'invalid' })
    expect(page.type).toBe(PracticeAccessCodeForm)
    const html = renderToStaticMarkup(page)
    expect(html).toContain(title)
    expect(html).toContain('name="accessCode"')
    expect(html).toContain('required=""')
    expect(html).toContain('รหัสผ่านไม่ถูกต้อง')
    expect(html).not.toContain('หน้ารอ')
    expect(html).not.toContain(`href="/practice/${id}/library"`)
  })
})
