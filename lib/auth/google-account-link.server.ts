import 'server-only'

import { cookies } from 'next/headers'
import { createGoogleLinkChallenge, GOOGLE_LINK_CHALLENGE_SECONDS, readGoogleLinkChallenge } from './google-account-link'

const COOKIE_NAME = 'korkru_google_account_link'
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

// Issue only after the caller verifies the current password for this exact user.
// The raw nonce stays in the HttpOnly signed cookie; GIS receives only its hash.
export async function issueGoogleLinkChallenge(userId: string, email: string, accessToken: string) {
  const challenge = createGoogleLinkChallenge(process.env.AUTH_FLOW_SECRET ?? '', userId, email, accessToken)
  if (!challenge) return null
  const store = await cookies()
  store.set(COOKIE_NAME, challenge.value, { ...options, maxAge: GOOGLE_LINK_CHALLENGE_SECONDS })
  return { nonceHash: challenge.nonceHash, expiresAt: challenge.expiresAt }
}

export async function consumeGoogleLinkChallenge(userId: string, email: string, accessToken: string) {
  const store = await cookies()
  const value = store.get(COOKIE_NAME)?.value ?? ''
  // Clear on every attempt. This is browser flow hygiene, not an atomic replay
  // ledger: a copied signed cookie can still be replayed until its short expiry.
  store.set(COOKIE_NAME, '', { ...options, maxAge: 0 })
  return readGoogleLinkChallenge(process.env.AUTH_FLOW_SECRET ?? '', value, userId, email, accessToken)
}

export async function clearGoogleLinkChallenge() {
  const store = await cookies()
  store.set(COOKIE_NAME, '', { ...options, maxAge: 0 })
}
