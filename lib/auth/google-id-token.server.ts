import 'server-only'

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { GoogleIdTokenVerifier } from './google-account-link'

const GOOGLE_KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  timeoutDuration: 5000,
  cooldownDuration: 30000,
  cacheMaxAge: 600000,
})

/** Dependency injection is server-only for synthetic-key tests; production uses fixed Google JWKS. */
export function createGoogleIdTokenVerifier(
  resolveKey: JWTVerifyGetKey = GOOGLE_KEYS,
  currentDate: () => Date = () => new Date(),
): GoogleIdTokenVerifier {
  return async (credential, expected) => {
    if (!credential || credential.length > 16384
      || !expected.audience || expected.audience.length > 255
      || !/^[a-f0-9]{64}$/.test(expected.nonceHash)) return null
    try {
      const { payload } = await jwtVerify(credential, resolveKey, {
        algorithms: ['RS256'],
        issuer: ['accounts.google.com', 'https://accounts.google.com'],
        audience: expected.audience,
        requiredClaims: ['sub', 'exp', 'iat', 'nonce', 'email', 'email_verified'],
        maxTokenAge: '5m',
        clockTolerance: 5,
        currentDate: currentDate(),
      })
      if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 || payload.sub.trim() !== payload.sub
        || payload.email_verified !== true || typeof payload.email !== 'string' || payload.email.length > 320
        || payload.email.trim().toLowerCase() !== expected.email
        || payload.nonce !== expected.nonceHash
        || (payload.azp !== undefined && payload.azp !== expected.audience)
        || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== expected.audience)) return null
      return { subject: payload.sub, email: expected.email }
    } catch {
      // Neither JWTs, Google claims nor upstream key-fetch details enter errors/logs.
      return null
    }
  }
}

export const verifyGoogleIdToken = createGoogleIdTokenVerifier()
