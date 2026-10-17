import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { emailSchema } from './validation'

export const GOOGLE_LINK_CHALLENGE_SECONDS = 300
const SIGNING_CONTEXT = 'google-account-link-v1:'
const HASH_PATTERN = /^[a-f0-9]{64}$/
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/

export type GoogleLinkUser = {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
  is_anonymous?: boolean
  identities?: Array<{
    provider: string
    id?: string
    user_id?: string
    identity_data?: Record<string, unknown>
  }> | null
}

export type GoogleLinkChallenge = {
  userId: string
  email: string
  tokenHash: string
  rawNonce: string
  nonceHash: string
  issuedAt: number
  expiresAt: number
}

export type VerifiedGoogleIdentity = { subject: string; email: string }
export type GoogleIdTokenExpectation = { audience: string; nonceHash: string; email: string }
export type GoogleIdTokenVerifier = (
  credential: string,
  expected: GoogleIdTokenExpectation,
) => Promise<VerifiedGoogleIdentity | null>

export type GoogleConnection = {
  state: 'linked' | 'unlinked' | 'conflict' | 'unknown'
  email: string | null
}

type IsolatedGoogleAuth = {
  signInWithIdToken(credentials: { provider: 'google'; token: string; nonce: string }): Promise<{
    data: { user: GoogleLinkUser | null; session: unknown | null }
    error: unknown | null
  }>
  signOut(options: { scope: 'local' }): Promise<{ error: unknown | null }>
}

export type GoogleAccountLinkResult =
  | { success: true; temporarySessionRevoked: boolean; warning?: string }
  | { error: string }

function normalizedEmail(value: unknown) {
  if (typeof value !== 'string' || value.length > 320) return null
  const parsed = emailSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function validContext(userId: string, email: string, accessToken: string, now: number) {
  return userId.length > 0 && userId.length <= 128
    && normalizedEmail(email) !== null
    && accessToken.length > 0 && accessToken.length <= 16384
    && Number.isSafeInteger(now) && now >= 0
}

/** Server-held proof of a completed password check, never a browser authorization claim. */
export function createGoogleLinkChallenge(
  secret: string,
  userId: string,
  email: string,
  accessToken: string,
  now = Date.now(),
) {
  if (secret.length < 32 || !validContext(userId, email, accessToken, now)) return null
  const rawNonce = randomBytes(32).toString('base64url')
  const expiresAt = now + GOOGLE_LINK_CHALLENGE_SECONDS * 1000
  const payload = Buffer.from(JSON.stringify({
    userId, email: normalizedEmail(email), tokenHash: hash(accessToken),
    rawNonce, issuedAt: now, expiresAt,
  })).toString('base64url')
  const signature = createHmac('sha256', secret).update(`${SIGNING_CONTEXT}${payload}`).digest('hex')
  return { value: `${payload}.${signature}`, nonceHash: hash(rawNonce), expiresAt }
}

export function readGoogleLinkChallenge(
  secret: string,
  value: string,
  userId: string,
  email: string,
  accessToken: string,
  now = Date.now(),
): GoogleLinkChallenge | null {
  if (secret.length < 32 || value.length > 4096 || !validContext(userId, email, accessToken, now)) return null
  const [payload, signature, extra] = value.split('.')
  if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload) || !signature || !HASH_PATTERN.test(signature) || extra !== undefined) return null
  const expected = createHmac('sha256', secret).update(`${SIGNING_CONTEXT}${payload}`).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data || typeof data !== 'object') return null
    const candidate = data as Record<string, unknown>
    if (candidate.userId !== userId || candidate.email !== normalizedEmail(email)
      || candidate.tokenHash !== hash(accessToken)
      || typeof candidate.rawNonce !== 'string' || !NONCE_PATTERN.test(candidate.rawNonce)
      || typeof candidate.issuedAt !== 'number' || !Number.isSafeInteger(candidate.issuedAt) || candidate.issuedAt > now
      || typeof candidate.expiresAt !== 'number' || !Number.isSafeInteger(candidate.expiresAt) || candidate.expiresAt <= now
      || candidate.expiresAt - candidate.issuedAt !== GOOGLE_LINK_CHALLENGE_SECONDS * 1000) return null
    return {
      userId, email: candidate.email as string, tokenHash: candidate.tokenHash as string,
      rawNonce: candidate.rawNonce, nonceHash: hash(candidate.rawNonce),
      issuedAt: candidate.issuedAt, expiresAt: candidate.expiresAt,
    }
  } catch {
    return null
  }
}

/** Use only identities from a server-verified getUser response, never user/app metadata hints. */
export function deriveGoogleConnection(user: GoogleLinkUser): GoogleConnection {
  if (!Array.isArray(user.identities)) return { state: 'unknown', email: null }
  const identities = user.identities.filter((identity) => identity.provider === 'google')
  if (identities.length === 0) return { state: 'unlinked', email: null }
  const emails = identities.map((identity) => normalizedEmail(identity.identity_data?.email))
  const email = emails[0] ?? null
  const currentEmail = normalizedEmail(user.email)
  if (!currentEmail || emails.some((value) => !value)) return { state: 'unknown', email }
  if (emails.some((value) => value !== currentEmail)
    || identities.some((identity) => identity.user_id !== undefined && identity.user_id !== user.id)) {
    return { state: 'conflict', email }
  }
  return { state: 'linked', email }
}

function matchesGoogleIdentity(user: GoogleLinkUser, verified: VerifiedGoogleIdentity) {
  return user.identities?.some((identity) => {
    if (identity.provider !== 'google' || identity.user_id !== user.id) return false
    const subject = typeof identity.identity_data?.sub === 'string' ? identity.identity_data.sub : identity.id
    return subject === verified.subject
      && normalizedEmail(identity.identity_data?.email) === verified.email
      && identity.identity_data?.email_verified === true
  }) === true
}

const expiredChallengeMessage = 'การยืนยันหมดอายุหรือบัญชีเปลี่ยนไป กรุณายืนยันรหัสผ่านแล้วเชื่อม Google อีกครั้ง'
const rejectedGoogleMessage = 'ยังเชื่อม Google ไม่ได้ กรุณาเลือกบัญชี Google ที่ยืนยันแล้วและใช้อีเมลเดียวกับบัญชี KorKru'
const retryMessage = 'ยังยืนยันการเชื่อม Google ไม่ได้ กรุณาตรวจสอบสถานะบัญชีแล้วลองใหม่'

/**
 * Verify the Google credential BEFORE Supabase can create/link an identity. The
 * injected auth client must have no cookie/storage persistence and no original
 * session; its temporary sign-in is always revoked without replacing that session.
 */
export async function completeGoogleAccountLink({
  user, accessToken, challenge, credential, audience, verifyIdToken, createAuth, now = Date.now(),
}: {
  user: GoogleLinkUser
  accessToken: string
  challenge: GoogleLinkChallenge | null
  credential: string
  audience: string
  verifyIdToken: GoogleIdTokenVerifier
  createAuth: () => IsolatedGoogleAuth
  now?: number
}): Promise<GoogleAccountLinkResult> {
  const email = normalizedEmail(user.email)
  if (!email || !user.email_confirmed_at || !Number.isFinite(Date.parse(user.email_confirmed_at)) || user.is_anonymous) {
    return { error: 'กรุณายืนยันอีเมลของบัญชี KorKru ก่อนเชื่อม Google' }
  }
  if (!challenge || !validContext(user.id, email, accessToken, now)
    || challenge.userId !== user.id || challenge.email !== email || challenge.tokenHash !== hash(accessToken)
    || challenge.issuedAt > now || challenge.expiresAt <= now
    || challenge.expiresAt - challenge.issuedAt !== GOOGLE_LINK_CHALLENGE_SECONDS * 1000
    || !NONCE_PATTERN.test(challenge.rawNonce) || challenge.nonceHash !== hash(challenge.rawNonce)) {
    return { error: expiredChallengeMessage }
  }
  if (!credential || credential.length > 16384 || !audience || audience.length > 255) return { error: rejectedGoogleMessage }

  let verified: VerifiedGoogleIdentity | null
  try {
    verified = await verifyIdToken(credential, { audience, nonceHash: challenge.nonceHash, email })
  } catch {
    return { error: rejectedGoogleMessage }
  }
  if (!verified || verified.email !== email || !verified.subject || verified.subject.length > 255) {
    return { error: rejectedGoogleMessage }
  }

  let auth: IsolatedGoogleAuth
  try {
    auth = createAuth()
  } catch {
    return { error: retryMessage }
  }

  let matched = false
  let revoked = false
  try {
    const result = await auth.signInWithIdToken({ provider: 'google', token: credential, nonce: challenge.rawNonce })
    const linked = result.data.user
    matched = result.error === null && Boolean(result.data.session) && linked !== null
      && linked.id === user.id && normalizedEmail(linked.email) === email
      && matchesGoogleIdentity(linked, verified) && deriveGoogleConnection(linked).state === 'linked'
  } catch {
    // The response may be lost after Auth commits. Never expose the credential or
    // claim that the original session changed; the caller can refresh status.
  } finally {
    try {
      revoked = (await auth.signOut({ scope: 'local' })).error === null
    } catch {
      revoked = false
    }
  }
  if (!matched) return { error: retryMessage }
  if (!revoked) {
    return {
      success: true,
      temporarySessionRevoked: false,
      warning: 'เชื่อม Google แล้ว แต่ยังยุติเซสชันยืนยันชั่วคราวไม่สำเร็จ กรุณาออกจากระบบทุกอุปกรณ์หากสงสัยว่าบัญชีถูกเข้าถึง',
    }
  }
  return { success: true, temporarySessionRevoked: true }
}
