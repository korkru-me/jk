'use server'

import { createClient as createIsolatedClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { forgotPassword } from '@/lib/actions/auth'
import { completeGoogleAccountLink as completeLink, deriveGoogleConnection } from '@/lib/auth/google-account-link'
import { clearGoogleLinkChallenge, consumeGoogleLinkChallenge, issueGoogleLinkChallenge } from '@/lib/auth/google-account-link.server'
import { verifyGoogleIdToken } from '@/lib/auth/google-id-token.server'
import type {
  AccountSignInMethods, AccountPasswordEmailResult, CancelGoogleLinkResult, CompleteGoogleLinkResult, StartGoogleLinkResult,
} from '@/lib/auth/account-methods-types'

function clientId() {
  const value = process.env.GOOGLE_ACCOUNT_LINK_CLIENT_ID ?? ''
  return process.env.GOOGLE_ACCOUNT_LINKING_ENABLED === 'true'
    && /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value) ? value : null
}

function isolatedAuth() {
  return createIsolatedClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  ).auth
}

export async function getAccountSignInMethods(): Promise<AccountSignInMethods | null> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user?.email || user.is_anonymous) return null
    const google = deriveGoogleConnection(user)
    return {
      email: user.email,
      emailVerified: !!user.email_confirmed_at,
      google,
      canConnectGoogle: !!clientId() && !!user.email_confirmed_at && google.state === 'unlinked',
    }
  } catch { return null }
}

export async function startGoogleAccountLink(formData: FormData): Promise<StartGoogleLinkResult> {
  const audience = clientId()
  if (!audience) return { error: 'ระบบเชื่อมต่อ Google ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล KorKru' }
  const password = formData.get('current_password')
  if (typeof password !== 'string' || !password.length || password.length > 4096) {
    return { error: 'กรุณากรอกรหัสผ่านปัจจุบัน', field: 'current_password' }
  }
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user?.email || user.is_anonymous) return { error: 'กรุณาเข้าสู่ระบบอีกครั้งก่อนเชื่อมต่อ Google' }
    if (!user.email_confirmed_at) return { error: 'กรุณายืนยันอีเมลของบัญชี KorKru ก่อนเชื่อมต่อ Google' }
    const state = deriveGoogleConnection(user).state
    if (state !== 'unlinked') return { error: state === 'linked' ? 'บัญชีนี้เชื่อมต่อ Google แล้ว' : 'ยังตรวจสอบการเชื่อมต่อ Google ไม่ได้ กรุณาติดต่อผู้ดูแล' }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return { error: 'กรุณาเข้าสู่ระบบอีกครั้งก่อนเชื่อมต่อ Google' }

    // Password proof belongs to the verified user, never a submitted email.
    const verifier = isolatedAuth()
    const verified = await verifier.signInWithPassword({ email: user.email, password })
    if (verified.data.session) {
      const cleanup = await verifier.signOut({ scope: 'local' })
      if (cleanup.error) return { error: 'ยังยืนยันรหัสผ่านไม่ได้ กรุณาลองใหม่อีกครั้ง' }
    }
    if (verified.error) {
      if (verified.error.status === 429) return { error: 'ยืนยันรหัสผ่านถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' }
      if (verified.error.code === 'invalid_credentials') return { error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง หากจำไม่ได้ให้ตั้งรหัสผ่านผ่านอีเมลก่อน', field: 'current_password' }
      return { error: 'ยังยืนยันรหัสผ่านไม่ได้ กรุณาลองใหม่อีกครั้ง' }
    }
    if (!verified.data.session || verified.data.user?.id !== user.id) return { error: 'ยืนยันบัญชีไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่' }
    const challenge = await issueGoogleLinkChallenge(user.id, user.email, session.access_token)
    if (!challenge) return { error: 'ระบบเชื่อมต่อ Google ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล KorKru' }
    return { success: true, clientId: audience, nonceHash: challenge.nonceHash, expiresAt: challenge.expiresAt }
  } catch { return { error: 'ยังเชื่อมต่อ Google ไม่ได้ กรุณาลองใหม่อีกครั้ง' } }
}

export async function completeGoogleAccountLink(credential: string): Promise<CompleteGoogleLinkResult> {
  const audience = clientId()
  if (!audience) return { error: 'ระบบเชื่อมต่อ Google ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล KorKru' }
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user?.email || !user.email_confirmed_at || user.is_anonymous) return { error: 'กรุณาเข้าสู่ระบบและยืนยันอีเมลก่อนเชื่อมต่อ Google' }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return { error: 'กรุณาเข้าสู่ระบบอีกครั้งก่อนเชื่อมต่อ Google' }
    const challenge = await consumeGoogleLinkChallenge(user.id, user.email, session.access_token)
    if (typeof credential !== 'string' || !credential || credential.length > 16384) {
      return { error: 'ยังไม่ได้รับข้อมูลยืนยัน Google ที่ถูกต้อง กรุณายืนยันรหัสผ่านแล้วลองใหม่' }
    }
    const result = await completeLink({
      user, accessToken: session.access_token, challenge, credential, audience,
      verifyIdToken: verifyGoogleIdToken, createAuth: isolatedAuth,
    })
    if ('error' in result) return result
    return { success: true, ...(result.warning ? { warning: result.warning } : {}) }
  } catch { return { error: 'ยังเชื่อมต่อ Google ไม่ได้ กรุณายืนยันรหัสผ่านแล้วลองใหม่' } }
}

export async function cancelGoogleAccountLink(): Promise<CancelGoogleLinkResult> {
  try {
    await clearGoogleLinkChallenge()
    return { success: true }
  } catch { return { error: 'ยังยกเลิกขั้นตอนไม่สำเร็จ กรุณาลองอีกครั้งหรือโหลดหน้าใหม่' } }
}

export async function sendAccountPasswordEmail(): Promise<AccountPasswordEmailResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user?.email || user.is_anonymous) return { error: 'กรุณาเข้าสู่ระบบอีกครั้งก่อนขอตั้งรหัสผ่าน' }
    if (!user.email_confirmed_at) return { error: 'กรุณายืนยันอีเมลของบัญชีก่อนขอตั้งรหัสผ่าน' }
    const result = await forgotPassword(user.email, user.id)
    if (result.error) return { error: result.error, ...(typeof result.retryAfterSeconds === 'number' ? { retryAfterSeconds: result.retryAfterSeconds } : {}) }
    return { success: true, retryAfterSeconds: 60 }
  } catch { return { error: 'ยังส่งอีเมลตั้งรหัสผ่านไม่ได้ กรุณาลองใหม่อีกครั้ง' } }
}
