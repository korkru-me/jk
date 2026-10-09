import 'server-only'

import { cookies } from 'next/headers'
import { isAuthRetryableFetchError, type User as AuthUser } from '@supabase/supabase-js'
import { displayNameSchema, emailSchema, loginSchema } from '@/lib/auth/validation'
import { studentHasAssignment } from '@/lib/auth/assignment-access'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readSebSessionSecret } from '@/lib/seb'
import { readCurrentAssignmentSebRelease } from '@/lib/seb-assignment-release.server'
import { readWaitingSebProfile } from '@/lib/seb-waiting-release-policy'
import { bindSebExamContextUser, readSebExamContext } from '@/lib/seb-exam-context.server'
import {
  SEB_EXAM_CONTEXT_COOKIE_NAME,
  verifySebExamContextClaims,
  type SebExamContextClaims,
} from '@/lib/seb-exam-context-core'
import { sebExamRoutePath } from '@/lib/seb-exam-transport-policy'
import {
  WAITING_AUTH_HANDOFF_QUERY,
  WAITING_AUTH_NONCE_COOKIE,
  createWaitingAuthHandoffClaims,
  readWaitingAuthNonceCookie,
  signWaitingAuthHandoffClaims,
  verifyWaitingAuthHandoffClaims,
  type WaitingAuthMethod,
} from '@/lib/seb-exam-auth-core'

export type WaitingAuthResult = { error: string } | { success: true; href?: string }
const SCOPE_ERROR = 'ลิงก์ข้อสอบหมดอายุหรือเปลี่ยนแล้ว กรุณาเปิดไฟล์ข้อสอบใหม่'
const ACCOUNT_ERROR = 'บัญชีนี้ไม่มีสิทธิ์เข้าสอบนี้ กรุณาแจ้งครูผู้คุมสอบ'
const AUTH_ERROR = 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
const CONNECTION_ERROR = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'

function validationMessage(issues: { message: string }[]) {
  return issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่'
}

async function readWaitingAuthScope() {
  const state = await readSebExamContext()
  if (state.status !== 'valid') return null
  const release = await readCurrentAssignmentSebRelease(state.claims.assignmentId)
  if (!release || release.revision !== state.claims.revision || release.releaseId !== state.claims.releaseId) return null
  const profile = readWaitingSebProfile(release)
  return profile ? { context: state.claims, profile } : null
}

function providerOrigin() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    return url.protocol === 'https:' && !url.username && !url.password ? url.origin : null
  } catch { return null }
}

async function prepareHandoff(scope: NonNullable<Awaited<ReturnType<typeof readWaitingAuthScope>>>, method: WaitingAuthMethod) {
  const secret = readSebSessionSecret()
  if (!secret) return null
  const claims = createWaitingAuthHandoffClaims(scope.context, method)
  const callback = new URL('/auth/callback', scope.profile.origin)
  callback.searchParams.set(WAITING_AUTH_HANDOFF_QUERY, signWaitingAuthHandoffClaims(claims, secret))
  const jar = await cookies()
  jar.set(WAITING_AUTH_NONCE_COOKIE, claims.nonce, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/auth/callback', priority: 'high', expires: new Date(claims.expiresAt),
    maxAge: Math.max(1, Math.floor((claims.expiresAt - Date.now()) / 1000)),
    // No Domain: nonce continuity is confined to this host and auth return path.
  })
  return callback.toString()
}

type ProfileRow = { id: string; full_name: string; role: string; survey_role: string | null; status: string }
const PROFILE_FIELDS = 'id, role, survey_role, full_name, status'

async function readOrProvisionOwnProfile(user: AuthUser, source: 'password' | 'callback'): Promise<ProfileRow | null> {
  if (!user.email) return null
  const admin = createAdminClient()
  const existing = await admin.from('users').select(PROFILE_FIELDS).eq('id', user.id).maybeSingle()
  if (existing.error) return null
  if (existing.data) return existing.data as ProfileRow

  // Same orphan recovery contract as ordinary login/callback, for this authenticated user only.
  const meta = user.user_metadata
  const candidateName = meta?.full_name ?? meta?.name ?? user.email.split('@')[0]
  const parsedName = displayNameSchema.safeParse(candidateName)
  const fullName = parsedName.success ? parsedName.data : 'ผู้ใช้ KorKru'
  const role = source === 'password' && meta?.role === 'teacher' ? 'teacher' : 'student'
  const surveyRole = source === 'password' && (meta?.survey_role === 'student' || meta?.survey_role === 'teacher')
    ? meta.survey_role as string : null
  const created = await admin.from('users').insert({
    id: user.id, email: user.email, full_name: fullName, role, survey_role: surveyRole,
    prefix: typeof meta?.prefix === 'string' ? meta.prefix : null,
    first_name: typeof meta?.first_name === 'string' ? meta.first_name : null,
    last_name: typeof meta?.last_name === 'string' ? meta.last_name : null,
    instructor_type: role === 'teacher' ? 'teacher' : null,
  }).select(PROFILE_FIELDS).maybeSingle()
  if (!created.error && created.data) {
    const provisioned = await admin.rpc('ensure_personal_organization', { p_user_id: user.id, p_display_name: fullName })
    return provisioned.error ? null : created.data as ProfileRow
  }
  // The auth trigger or another return request may have created the same profile concurrently.
  if (created.error?.code !== '23505') return null
  const recovered = await admin.from('users').select(PROFILE_FIELDS).eq('id', user.id).maybeSingle()
  return recovered.error ? null : recovered.data as ProfileRow | null
}

async function ownsPublishedWaitingAssignment(context: SebExamContextClaims, userId: string) {
  const admin = createAdminClient()
  const [assignment, handedToStudent] = await Promise.all([
    admin.from('assignments').select('id, type, mode, status, secure_browser_mode').eq('id', context.assignmentId).maybeSingle(),
    studentHasAssignment(admin, context.assignmentId, userId),
  ])
  return !assignment.error && assignment.data?.id === context.assignmentId
    && assignment.data.type === 'exam' && assignment.data.mode === 'online'
    && assignment.data.status === 'published' && assignment.data.secure_browser_mode === 'seb_required'
    && handedToStudent
}

/** Caller supplies only the user returned by a successful server-side auth exchange. */
export async function finishWaitingAuthentication(user: AuthUser, source: 'password' | 'callback'): Promise<WaitingAuthResult> {
  const scope = await readWaitingAuthScope()
  if (!scope) return { error: SCOPE_ERROR }
  if (scope.context.userId !== null && scope.context.userId !== user.id) return { error: ACCOUNT_ERROR }
  const profile = await readOrProvisionOwnProfile(user, source)
  if (!profile || profile.id !== user.id || profile.role !== 'student' || profile.status !== 'active') return { error: ACCOUNT_ERROR }
  if (!await ownsPublishedWaitingAssignment(scope.context, user.id)) return { error: ACCOUNT_ERROR }
  const bound = await bindSebExamContextUser(user.id)
  return { success: true, href: sebExamRoutePath(bound, profile.survey_role ? 'waiting' : 'profile') }
}

export async function passwordLoginForWaiting(input: { email: string; password: string }): Promise<WaitingAuthResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }
  if (!await readWaitingAuthScope()) return { error: SCOPE_ERROR }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error || !data.user) {
    return { error: error && isAuthRetryableFetchError(error) ? CONNECTION_ERROR : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }
  }
  return finishWaitingAuthentication(data.user, 'password')
}

export async function prepareWaitingGoogleLogin(): Promise<WaitingAuthResult> {
  const scope = await readWaitingAuthScope()
  if (!scope) return { error: SCOPE_ERROR }
  const authOrigin = providerOrigin()
  if (!authOrigin || !scope.profile.authOrigins.includes(authOrigin)
    || !scope.profile.authOrigins.includes('https://accounts.google.com')) {
    return { error: 'ไฟล์ข้อสอบนี้ยังไม่รองรับการเข้าสู่ระบบด้วย Google กรุณาใช้อีเมลและรหัสผ่าน' }
  }
  const callback = await prepareHandoff(scope, 'google')
  if (!callback) return { error: SCOPE_ERROR }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google', options: {
      redirectTo: callback, skipBrowserRedirect: true,
      queryParams: { access_type: 'offline', prompt: 'select_account' },
    },
  })
  if (error || !data.url) return { error: error && isAuthRetryableFetchError(error) ? CONNECTION_ERROR : AUTH_ERROR }
  try {
    const url = new URL(data.url)
    if (url.protocol !== 'https:' || url.username || url.password || !scope.profile.authOrigins.includes(url.origin)) {
      return { error: AUTH_ERROR }
    }
  } catch { return { error: AUTH_ERROR } }
  return { success: true, href: data.url }
}

export async function sendWaitingMagicLink(email: string): Promise<WaitingAuthResult> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }
  const scope = await readWaitingAuthScope()
  if (!scope) return { error: SCOPE_ERROR }
  const authOrigin = providerOrigin()
  if (!authOrigin || !scope.profile.authOrigins.includes(authOrigin)) {
    return { error: 'ไฟล์ข้อสอบนี้ยังไม่รองรับลิงก์เข้าสู่ระบบ กรุณาใช้อีเมลและรหัสผ่าน' }
  }
  const callback = await prepareHandoff(scope, 'magic_link')
  if (!callback) return { error: SCOPE_ERROR }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data, options: { emailRedirectTo: callback, shouldCreateUser: false },
  })
  // Keep registered/unregistered addresses indistinguishable, as in ordinary login.
  return error && isAuthRetryableFetchError(error) ? { error: CONNECTION_ERROR } : { success: true }
}

export async function completeWaitingStudentProfile(fullName: string): Promise<WaitingAuthResult> {
  const parsed = displayNameSchema.safeParse(fullName)
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }
  const scope = await readWaitingAuthScope()
  if (!scope) return { error: SCOPE_ERROR }
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user || scope.context.userId !== user.id) return { error: ACCOUNT_ERROR }
  const admin = createAdminClient()
  const result = await admin.from('users').select(PROFILE_FIELDS).eq('id', user.id).maybeSingle()
  const profile = result.data as ProfileRow | null
  if (result.error || !profile || profile.id !== user.id || profile.role !== 'student' || profile.status !== 'active'
    || !await ownsPublishedWaitingAssignment(scope.context, user.id)) return { error: ACCOUNT_ERROR }
  const href = sebExamRoutePath(scope.context, 'waiting')
  if (profile.survey_role) return { success: true, href }
  const updated = await admin.from('users').update({
    full_name: parsed.data, role: 'student', survey_role: 'student', instructor_type: null,
  }).eq('id', user.id).eq('role', 'student').eq('status', 'active').is('survey_role', null).select('id').maybeSingle()
  if (updated.error || !updated.data) return { error: 'ไม่สามารถบันทึกข้อมูลบัญชีได้ กรุณาลองใหม่' }
  const { error } = await supabase.auth.updateUser({ data: { full_name: parsed.data, role: 'student', survey_role: 'student' } })
  return error ? { error: 'ไม่สามารถบันทึกข้อมูลบัญชีได้ กรุณาลองใหม่' } : { success: true, href }
}

export type WaitingAuthCallbackState =
  | { kind: 'ordinary' }
  | { kind: 'denied'; loginHref: string | null }
  | { kind: 'waiting'; context: SebExamContextClaims }

/** Read-only pre-exchange gate: routing context alone must never authenticate a user. */
export async function inspectWaitingAuthCallback(requestUrl: string, cookieHeader: string | null): Promise<WaitingAuthCallbackState> {
  const url = new URL(requestUrl)
  const state = await readSebExamContext()
  const handoffs = url.searchParams.getAll(WAITING_AUTH_HANDOFF_QUERY)
  const rawMarkers = (cookieHeader ?? '').split(';').map(part => part.trim())
    .filter(part => part.split('=', 1)[0].trim() === SEB_EXAM_CONTEXT_COOKIE_NAME)
  if (state.status === 'absent' && handoffs.length === 0 && rawMarkers.length === 0) return { kind: 'ordinary' }
  const loginHref = state.status === 'valid' ? sebExamRoutePath(state.claims, 'login') : null
  const denied: WaitingAuthCallbackState = { kind: 'denied', loginHref }
  if (state.status !== 'valid' || handoffs.length !== 1 || url.searchParams.has('next') || url.searchParams.has('role')
    || url.searchParams.getAll('code').length > 1 || url.hash) return denied
  if (rawMarkers.length !== 1) return denied
  // An unavailable release lookup is a rejected handoff, never an ordinary callback fallback.
  const scope = await readWaitingAuthScope().catch(() => null)
  const secret = readSebSessionSecret()
  if (!scope || !secret || url.origin !== scope.profile.origin || url.pathname !== '/auth/callback') return denied
  const separator = rawMarkers[0].indexOf('=')
  if (separator < 0 || !verifySebExamContextClaims(rawMarkers[0].slice(separator + 1), secret, Date.now(), state.claims)) return denied
  const handoff = verifyWaitingAuthHandoffClaims(handoffs[0], secret, state.claims, readWaitingAuthNonceCookie(cookieHeader))
  return handoff ? { kind: 'waiting', context: state.claims } : denied
}

export async function consumeWaitingAuthNonce() {
  const jar = await cookies()
  jar.set(WAITING_AUTH_NONCE_COOKIE, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/auth/callback', expires: new Date(0), maxAge: 0,
  })
}
