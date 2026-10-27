import { beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({ user: vi.fn(), session: vi.fn(), grant: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.user, getSession: mocks.session } }),
}))
vi.mock('@/lib/auth/recovery-grant.server', () => ({ hasRecoveryGrant: mocks.grant }))
vi.mock('@/components/auth/reset-password-form', () => ({
  ResetPasswordForm: () => createElement('form', { 'data-testid': 'authorized-reset-form' }),
}))
vi.mock('@/components/brand-logo', () => ({ BrandLogo: () => null }))

import ResetPasswordPage from '@/app/reset-password/page'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockResolvedValue({ data: { user: { id: 'verified-user' } } })
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'synthetic-token' } } })
  mocks.grant.mockResolvedValue(false)
})

async function render(error?: string | string[]) {
  return renderToStaticMarkup(await ResetPasswordPage({ searchParams: Promise.resolve({ error }) }))
}

it.each([undefined, 'browser_required', 'link_expired', 'verification_failed', 'success', ['link_expired']])(
  'never allows a URL hint (%j) to replace a server-verified recovery grant', async error => {
    const html = await render(error)
    expect(html).not.toContain('authorized-reset-form')
    expect(html).toContain('ขอลิงก์ตั้งรหัสผ่านใหม่')
    expect(mocks.grant).toHaveBeenCalledWith('verified-user', 'synthetic-token')
  },
)

it('explains missing browser data separately from provider expiry', async () => {
  expect(await render()).toContain('เปิดลิงก์ในเบราว์เซอร์เดิมที่ขอลิงก์')
  const expired = await render('link_expired')
  expect(expired).toContain('ลิงก์นี้หมดอายุหรือถูกใช้แล้ว')
  expect(expired).not.toContain('ไม่พบข้อมูลยืนยันคำขอในเบราว์เซอร์นี้')
  expect(await render('verification_failed')).toContain('ยังยืนยันลิงก์ตั้งรหัสผ่านไม่ได้')
})

it('preserves the authorized form even with a stale failure hint', async () => {
  mocks.grant.mockResolvedValue(true)
  const html = await render('link_expired')
  expect(html).toContain('authorized-reset-form')
  expect(html).not.toContain('ลิงก์นี้หมดอายุหรือถูกใช้แล้ว')
})

it('does not render untrusted query text', async () => {
  const html = await render('<script>untrusted-provider-error</script>')
  expect(html).not.toContain('untrusted-provider-error')
  expect(html).toContain('เปิดลิงก์ในเบราว์เซอร์เดิมที่ขอลิงก์')
})
