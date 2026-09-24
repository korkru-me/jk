import { createHmac, timingSafeEqual } from 'node:crypto'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i
const SAFE_REVISION_PATTERN = /^[A-Za-z0-9._-]{1,120}$/
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function validConfigRevision(value) {
  return typeof value === 'string' && SAFE_REVISION_PATTERN.test(value.trim())
}

function validAssignmentConfigRevision(value) {
  return Number.isInteger(value)
    && value >= 1
    && value <= MAX_ASSIGNMENT_CONFIG_REVISION
}

function validVersion(value) {
  if (typeof value !== 'string' || value.length < 5 || value.length > 240) return false
  const match = value.match(/_(Windows|macOS|iOS)_([A-Za-z0-9.+-]+)_([A-Za-z0-9.+-]+)_[^\s]+$/)
  return match !== null
}

function encodeClaims(claims) {
  return Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
}

function tokenSignature(encodedClaims, secret) {
  return createHmac('sha256', secret).update(encodedClaims, 'utf8').digest('base64url')
}

/** Shared production/QA signing primitive. It never logs or returns the secret. */
export function signSebClaimsCore(claims, secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('SEB session secret is too short')
  }
  const encodedClaims = encodeClaims(claims)
  return `${encodedClaims}.${tokenSignature(encodedClaims, secret)}`
}

/**
 * Verify the exact SEB claim contract used by the application. The Staging
 * expiry capability imports this function directly so it exercises the same
 * expiry boundary without exposing a signing endpoint or changing wall time.
 */
export function verifySebClaimsCore(token, secret, now = Date.now()) {
  if (typeof token !== 'string'
    || typeof secret !== 'string'
    || secret.length < 32
    || token.length > 2_000) return null
  const [encodedClaims, receivedSignature, extra] = token.split('.')
  if (!encodedClaims || !receivedSignature || extra) return null
  if (!safeEqual(receivedSignature, tokenSignature(encodedClaims, secret))) return null

  try {
    const parsed = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'))
    if (
      !parsed
      || typeof parsed !== 'object'
      || Array.isArray(parsed)
      || (parsed.kind !== 'seb_challenge' && parsed.kind !== 'seb_session')
      || !UUID_PATTERN.test(parsed.userId ?? '')
      || !UUID_PATTERN.test(parsed.assignmentId ?? '')
      || !Number.isInteger(parsed.issuedAt)
      || !Number.isInteger(parsed.expiresAt)
      || parsed.issuedAt > now + 60_000
      || parsed.expiresAt <= now
      || parsed.expiresAt <= parsed.issuedAt
      || !validConfigRevision(parsed.configRevision)
      || !validAssignmentConfigRevision(parsed.assignmentConfigRevision)
    ) return null

    if (parsed.kind === 'seb_challenge') {
      if (
        (parsed.purpose !== 'take' && parsed.purpose !== 'system_check')
        || typeof parsed.nonce !== 'string'
        || !/^[0-9a-f]{32}$/.test(parsed.nonce)
      ) return null
      return parsed
    }

    if (
      (parsed.platform !== 'windows' && parsed.platform !== 'macos' && parsed.platform !== 'ios')
      || !validVersion(parsed.version)
      || (parsed.platform === 'windows' && !parsed.version.includes('_Windows_'))
      || (parsed.platform === 'macos' && !parsed.version.includes('_macOS_'))
      || (parsed.platform === 'ios' && !parsed.version.includes('_iOS_'))
    ) return null
    return parsed
  } catch {
    return null
  }
}

export function isSebSha256Hex(value) {
  return typeof value === 'string' && SHA256_HEX_PATTERN.test(value)
}
