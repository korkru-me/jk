import 'server-only'
import { cookies } from 'next/headers'
import { RECOVERY_GRANT_SECONDS, signRecoveryGrant, verifyRecoveryGrant } from './recovery-grant'

const COOKIE = 'korkru_password_recovery'
const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/reset-password' }

export async function issueRecoveryGrant(userId: string, accessToken: string) {
  const grant = signRecoveryGrant(process.env.AUTH_FLOW_SECRET ?? '', userId, accessToken)
  if (!grant) return false
  const store = await cookies()
  store.set(COOKIE, grant, { ...options, maxAge: RECOVERY_GRANT_SECONDS })
  return true
}

export async function hasRecoveryGrant(userId: string, accessToken: string) {
  const value = (await cookies()).get(COOKIE)?.value ?? ''
  return verifyRecoveryGrant(process.env.AUTH_FLOW_SECRET ?? '', value, userId, accessToken)
}

export async function clearRecoveryGrant() {
  const store = await cookies()
  store.set(COOKIE, '', { ...options, maxAge: 0 })
}
