import 'server-only'
import { cookies } from 'next/headers'
import {
  RECOVERY_INTENT_SECONDS,
  createRecoveryNonce,
  recoveryIntentRecipient,
  signRecoveryIntent,
  verifyRecoveryIntent,
} from './recovery-intent'

const COOKIE = 'korkru_recovery_intent'
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/auth/callback',
}

/** The returned nonce stays inside server code and is sent only through the
 * recovery email's redirect URL, never through a Server Action response.
 */
export async function issueRecoveryIntent(email: string, expectedUserId?: string) {
  const nonce = createRecoveryNonce()
  const value = signRecoveryIntent(process.env.AUTH_FLOW_SECRET ?? '', email, nonce, Date.now(), expectedUserId)
  if (!value) return null
  const store = await cookies()
  store.set(COOKIE, value, { ...options, maxAge: RECOVERY_INTENT_SECONDS })
  return nonce
}

export async function hasRecoveryIntentNonce(nonce: string) {
  const value = (await cookies()).get(COOKIE)?.value ?? ''
  return recoveryIntentRecipient(process.env.AUTH_FLOW_SECRET ?? '', value, nonce) !== null
}

export async function consumeRecoveryIntent(nonce: string, email: string, verifiedUserId: string) {
  const store = await cookies()
  const value = store.get(COOKIE)?.value ?? ''
  if (!verifyRecoveryIntent(process.env.AUTH_FLOW_SECRET ?? '', value, nonce, email, Date.now(), verifiedUserId)) return false
  store.set(COOKIE, '', { ...options, maxAge: 0 })
  return true
}

export async function clearRecoveryIntent() {
  const store = await cookies()
  store.set(COOKIE, '', { ...options, maxAge: 0 })
}
