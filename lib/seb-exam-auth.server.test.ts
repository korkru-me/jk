import type { User as AuthUser } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SEB_EXAM_CONTEXT_COOKIE_NAME,
  createSebExamContextClaims,
  signSebExamContextClaims,
  type SebExamContextClaims,
} from './seb-exam-context-core'
import { WAITING_AUTH_HANDOFF_QUERY, WAITING_AUTH_NONCE_COOKIE, verifyWaitingAuthHandoffClaims } from './seb-exam-auth-core'
import {
  completeWaitingStudentProfile,
  consumeWaitingAuthNonce,
  finishWaitingAuthentication,
  inspectWaitingAuthCallback,
  passwordLoginForWaiting,
  prepareWaitingGoogleLogin,
  sendWaitingMagicLink,
} from './seb-exam-auth.server'

type QueryResult = { data: Record<string, unknown> | null; error: { code?: string } | null }
type ContextState = { status: 'absent' | 'invalid' } | { status: 'valid'; claims: SebExamContextClaims }
const mocks = vi.hoisted(() => ({
  readContext: vi.fn<() => Promise<ContextState>>(), bindContext: vi.fn(), readRelease: vi.fn(), waitingProfile: vi.fn(), readSecret: vi.fn(),
  cookieSet: vi.fn(), from: vi.fn(), rpc: vi.fn(), roster: vi.fn(),
  auth: { signInWithPassword: vi.fn(), signInWithOAuth: vi.fn(), signInWithOtp: vi.fn(), getUser: vi.fn(), updateUser: vi.fn() },
  profile: null as Record<string, unknown> | null,
  userReads: [] as QueryResult[], created: null as QueryResult | null, updated: null as QueryResult | null,
  assignment: null as QueryResult | null,
  operations: [] as { table: string; method: string; args: unknown[] }[],
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mocks.cookieSet }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: mocks.auth }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock('@/lib/auth/assignment-access', () => ({ studentHasAssignment: mocks.roster }))
vi.mock('@/lib/seb', () => ({ readSebSessionSecret: mocks.readSecret }))
vi.mock('@/lib/seb-assignment-release.server', () => ({ readCurrentAssignmentSebRelease: mocks.readRelease }))
vi.mock('@/lib/seb-waiting-release-policy', () => ({ readWaitingSebProfile: mocks.waitingProfile }))
vi.mock('@/lib/seb-exam-context.server', () => ({ readSebExamContext: mocks.readContext, bindSebExamContextUser: mocks.bindContext }))

const now = 1_800_000_000_000
const secret = 'test-only-waiting-auth-server-signing-secret'
const scope = { assignmentId: '11111111-1111-4111-8111-111111111111', revision: 7, releaseId: 'asr-11111111111141118111111111111111-r7-abcdef0123456789' }
const userId = '22222222-2222-4222-8222-222222222222'
const user: AuthUser = { id: userId, email: 'student@example.test', user_metadata: { full_name: 'นักเรียนทดสอบ' }, app_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' }
const context = createSebExamContextClaims(scope, { now })
const bound = { ...context, userId }
const base = `/exam/${scope.assignmentId}/r/7`
const origin = 'https://korkru-seb-uat.vercel.app'
const profile = { ...scope, origin, authOrigins: ['https://auth.example.test', 'https://accounts.google.com'] }

function query(table: string) {
  let mode = 'read'
  const chain = {
    select: (...args: unknown[]) => { mocks.operations.push({ table, method: 'select', args }); return chain },
    eq: (...args: unknown[]) => { mocks.operations.push({ table, method: 'eq', args }); return chain },
    is: (...args: unknown[]) => { mocks.operations.push({ table, method: 'is', args }); return chain },
    insert: (...args: unknown[]) => { mode = 'insert'; mocks.operations.push({ table, method: mode, args }); return chain },
    update: (...args: unknown[]) => { mode = 'update'; mocks.operations.push({ table, method: mode, args }); return chain },
    maybeSingle: async () => {
      if (table === 'assignments') return mocks.assignment
      if (mode === 'insert') return mocks.created
      if (mode === 'update') return mocks.updated
      return mocks.userReads.shift() ?? { data: mocks.profile, error: null }
    },
  }
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth.example.test')
  mocks.readContext.mockResolvedValue({ status: 'valid', claims: context })
  mocks.readRelease.mockResolvedValue(scope)
  mocks.waitingProfile.mockReturnValue(profile)
  mocks.readSecret.mockReturnValue(secret)
  mocks.bindContext.mockResolvedValue(bound)
  mocks.profile = { id: userId, full_name: 'นักเรียนทดสอบ', role: 'student', survey_role: 'student', status: 'active' }
  mocks.userReads = []; mocks.operations = []
  mocks.created = { data: { ...mocks.profile, survey_role: null }, error: null }
  mocks.updated = { data: { id: userId }, error: null }
  mocks.assignment = { data: { id: scope.assignmentId, type: 'exam', mode: 'online', status: 'published', secure_browser_mode: 'seb_required' }, error: null }
  mocks.from.mockImplementation(query)
  mocks.rpc.mockResolvedValue({ error: null })
  mocks.roster.mockResolvedValue(true)
  mocks.auth.signInWithPassword.mockResolvedValue({ data: { user }, error: null })
  mocks.auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://auth.example.test/auth/v1/authorize' }, error: null })
  mocks.auth.signInWithOtp.mockResolvedValue({ error: null })
  mocks.auth.getUser.mockResolvedValue({ data: { user }, error: null })
  mocks.auth.updateUser.mockResolvedValue({ error: null })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('scoped password and account binding', () => {
  it('validates input and registered waiting scope before password authentication', async () => {
    expect(await passwordLoginForWaiting({ email: 'bad', password: '' })).toHaveProperty('error')
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled()
    mocks.readContext.mockResolvedValue({ status: 'invalid' })
    expect(await passwordLoginForWaiting({ email: user.email!, password: 'valid' })).toHaveProperty('error')
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(mocks.readRelease).not.toHaveBeenCalled()
  })

  it('binds exact authenticated active student and published roster without SEB/timer authority', async () => {
    expect(await passwordLoginForWaiting({ email: ' STUDENT@EXAMPLE.TEST ', password: 'valid' })).toEqual({ success: true, href: `${base}/waiting` })
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'student@example.test', password: 'valid' })
    expect(mocks.bindContext).toHaveBeenCalledWith(userId)
    expect(mocks.roster.mock.calls[0].slice(1)).toEqual([scope.assignmentId, userId])
    expect(mocks.operations.filter(op => op.method === 'insert')).toEqual([])
  })

  it.each(['teacher', 'admin', 'suspended', 'outside_roster', 'closed', 'wrong_revision', 'feature_disabled', 'account_substitution'])('rejects %s without binding', async failure => {
    if (failure === 'teacher' || failure === 'admin') mocks.profile = { ...mocks.profile, role: failure }
    if (failure === 'suspended') mocks.profile = { ...mocks.profile, status: 'suspended' }
    if (failure === 'outside_roster') mocks.roster.mockResolvedValue(false)
    if (failure === 'closed') mocks.assignment = { data: { ...mocks.assignment!.data, status: 'closed' }, error: null }
    if (failure === 'wrong_revision') mocks.readRelease.mockResolvedValue({ ...scope, revision: 8 })
    if (failure === 'feature_disabled') mocks.waitingProfile.mockReturnValue(null)
    if (failure === 'account_substitution') mocks.readContext.mockResolvedValue({ status: 'valid', claims: { ...bound, userId: '33333333-3333-4333-8333-333333333333' } })
    expect(await finishWaitingAuthentication(user, 'password')).toHaveProperty('error')
    expect(mocks.bindContext).not.toHaveBeenCalled()
  })

  it('recovers only this actual user orphan profile and personal organization then routes to profile', async () => {
    mocks.profile = null
    expect(await finishWaitingAuthentication(user, 'callback')).toEqual({ success: true, href: `${base}/profile` })
    const insertion = mocks.operations.find(op => op.method === 'insert')?.args[0]
    expect(insertion).toMatchObject({ id: userId, email: user.email, role: 'student', survey_role: null })
    expect(mocks.rpc).toHaveBeenCalledWith('ensure_personal_organization', { p_user_id: userId, p_display_name: 'นักเรียนทดสอบ' })
  })

  it('returns a generic authentication error rather than provider error details', async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: 'sensitive-provider-token' } })
    expect(await passwordLoginForWaiting({ email: user.email!, password: 'valid' })).toEqual({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
  })
})

describe('finite Google and Magic Link handoff', () => {
  it('sets a host-only HttpOnly Lax nonce and sends a signed exact callback without next/role', async () => {
    expect(await prepareWaitingGoogleLogin()).toEqual({ success: true, href: 'https://auth.example.test/auth/v1/authorize' })
    const oauth = mocks.auth.signInWithOAuth.mock.calls[0][0]
    const callback = new URL(oauth.options.redirectTo)
    expect(callback.origin).toBe(origin)
    expect(callback.pathname).toBe('/auth/callback')
    expect([...callback.searchParams.keys()]).toEqual([WAITING_AUTH_HANDOFF_QUERY])
    const [name, nonce, options] = mocks.cookieSet.mock.calls[0]
    expect(name).toBe(WAITING_AUTH_NONCE_COOKIE)
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/auth/callback', maxAge: 600 })
    expect(options).not.toHaveProperty('domain')
    expect(verifyWaitingAuthHandoffClaims(callback.searchParams.get(WAITING_AUTH_HANDOFF_QUERY)!, secret, context, nonce, now)?.method).toBe('google')
  })

  it('rejects unsupported auth origins and unexpected provider target URLs gracefully', async () => {
    mocks.waitingProfile.mockReturnValue({ ...profile, authOrigins: ['https://auth.example.test'] })
    expect(await prepareWaitingGoogleLogin()).toHaveProperty('error')
    expect(mocks.auth.signInWithOAuth).not.toHaveBeenCalled()
    mocks.waitingProfile.mockReturnValue(profile)
    mocks.auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://evil.test/authorize' }, error: null })
    expect(await prepareWaitingGoogleLogin()).toHaveProperty('error')
  })

  it('keeps Magic Link registration disabled and registered/unknown address responses identical', async () => {
    expect(await sendWaitingMagicLink(' STUDENT@EXAMPLE.TEST ')).toEqual({ success: true })
    const call = mocks.auth.signInWithOtp.mock.calls[0][0]
    expect(call.email).toBe('student@example.test')
    expect(call.options.shouldCreateUser).toBe(false)
    expect(new URL(call.options.emailRedirectTo).searchParams.has(WAITING_AUTH_HANDOFF_QUERY)).toBe(true)
    mocks.auth.signInWithOtp.mockResolvedValue({ error: { message: 'unregistered-address' } })
    expect(await sendWaitingMagicLink('unknown@example.test')).toEqual({ success: true })
  })
})

describe('student-only completion', () => {
  it('updates exact active student only with survey_role NULL after auth and roster', async () => {
    mocks.readContext.mockResolvedValue({ status: 'valid', claims: bound })
    mocks.profile = { ...mocks.profile, survey_role: null }
    expect(await completeWaitingStudentProfile(' นักเรียนคนเดิม ')).toEqual({ success: true, href: `${base}/waiting` })
    expect(mocks.operations.find(op => op.method === 'update')?.args[0]).toEqual({ full_name: 'นักเรียนคนเดิม', role: 'student', survey_role: 'student', instructor_type: null })
    expect(mocks.operations).toContainEqual({ table: 'users', method: 'eq', args: ['id', userId] })
    expect(mocks.operations).toContainEqual({ table: 'users', method: 'is', args: ['survey_role', null] })
  })

  it('cannot complete another account, teacher, pending scope or unrelated roster', async () => {
    expect(await completeWaitingStudentProfile('นักเรียนคนเดิม')).toHaveProperty('error')
    mocks.readContext.mockResolvedValue({ status: 'valid', claims: bound })
    mocks.profile = { ...mocks.profile, role: 'teacher', survey_role: null }
    expect(await completeWaitingStudentProfile('นักเรียนคนเดิม')).toHaveProperty('error')
    mocks.profile = { ...mocks.profile, role: 'student' }
    mocks.roster.mockResolvedValue(false)
    expect(await completeWaitingStudentProfile('นักเรียนคนเดิม')).toHaveProperty('error')
    expect(mocks.operations.some(op => op.method === 'update')).toBe(false)
  })
})

describe('read-only callback pre-exchange guard', () => {
  async function preparedCallback() {
    await prepareWaitingGoogleLogin()
    const callback = new URL(mocks.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo)
    callback.searchParams.set('code', 'one-time-code')
    const nonce = mocks.cookieSet.mock.calls[0][1] as string
    const cookie = `${SEB_EXAM_CONTEXT_COOKIE_NAME}=${signSebExamContextClaims(context, secret)}; ${WAITING_AUTH_NONCE_COOKIE}=${nonce}`
    return { callback, cookie }
  }

  it('requires signed context + nonce + registered exact origin before any exchange', async () => {
    const { callback, cookie } = await preparedCallback()
    expect(await inspectWaitingAuthCallback(callback.toString(), cookie)).toEqual({ kind: 'waiting', context })
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(await inspectWaitingAuthCallback(callback.toString(), `${cookie}; ${WAITING_AUTH_NONCE_COOKIE}=bad`)).toEqual({ kind: 'denied', loginHref: `${base}/login` })
    expect(await inspectWaitingAuthCallback(callback.toString(), cookie.replace(signSebExamContextClaims(context, secret), 'bad'))).toEqual({ kind: 'denied', loginHref: `${base}/login` })
    callback.searchParams.set('next', '/dashboard')
    expect(await inspectWaitingAuthCallback(callback.toString(), cookie)).toEqual({ kind: 'denied', loginHref: `${base}/login` })
  })

  it('preserves ordinary callback only without a marker/handoff and rejects missing-context exam handoff', async () => {
    const { callback, cookie } = await preparedCallback()
    mocks.readContext.mockResolvedValue({ status: 'absent' })
    expect(await inspectWaitingAuthCallback(`${origin}/auth/callback?code=normal&next=/reset-password`, null)).toEqual({ kind: 'ordinary' })
    expect(await inspectWaitingAuthCallback(callback.toString(), cookie)).toEqual({ kind: 'denied', loginHref: null })
    expect(await inspectWaitingAuthCallback(`${origin}/auth/callback?code=normal`, SEB_EXAM_CONTEXT_COOKIE_NAME)).toEqual({ kind: 'denied', loginHref: null })
    mocks.readContext.mockResolvedValue({ status: 'invalid' })
    expect(await inspectWaitingAuthCallback(`${origin}/auth/callback?code=normal`, null)).toEqual({ kind: 'denied', loginHref: null })
  })

  it('clears nonce at the same host-only path without extending or minting context', async () => {
    await consumeWaitingAuthNonce()
    expect(mocks.cookieSet).toHaveBeenCalledWith(WAITING_AUTH_NONCE_COOKIE, '', {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/auth/callback', expires: new Date(0), maxAge: 0,
    })
    expect(mocks.bindContext).not.toHaveBeenCalled()
  })
})
