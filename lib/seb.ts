import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

export type SebPlatform = 'windows' | 'macos' | 'ios'
export type SebChallengePurpose = 'take' | 'system_check'

export interface SebVersionInfo {
  platform: SebPlatform
  version: string
}

export interface SebChallengeClaims {
  kind: 'seb_challenge'
  userId: string
  assignmentId: string
  purpose: SebChallengePurpose
  nonce: string
  issuedAt: number
  expiresAt: number
}

export interface SebSessionClaims {
  kind: 'seb_session'
  userId: string
  assignmentId: string
  platform: SebPlatform
  version: string
  issuedAt: number
  expiresAt: number
}

type SebClaims = SebChallengeClaims | SebSessionClaims

export interface SebEnvironment {
  sessionSecret: string
  configKey: string
  browserExamKeys: string[]
}

export interface SebReadiness {
  publishReady: boolean
  sessionSecretReady: boolean
  configKeyReady: boolean
  browserExamKeyCount: number
  siteUrlReady: boolean
  configFileStatus: 'ready' | 'manual' | 'invalid'
}

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_VERSION_LENGTH = 240

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function validHex(value: string | undefined) {
  const trimmed = value?.trim() ?? ''
  return SHA256_HEX_PATTERN.test(trimmed) ? trimmed : null
}

function normalizedHash(value: string | undefined) {
  return validHex(value)?.toLowerCase() ?? null
}

function parseHttpUrl(value: string | undefined) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

/** Public-safe deployment status. It intentionally returns no key or secret values. */
export function inspectSebReadiness(
  environment: Record<string, string | undefined> = process.env,
): SebReadiness {
  const production = environment.NODE_ENV === 'production'
  const sessionSecretReady = (environment.SEB_SESSION_SECRET?.trim().length ?? 0) >= 32
  const configKeyReady = validHex(environment.SEB_CONFIG_KEY) !== null
  const browserExamKeyCount = new Set(
    (environment.SEB_BROWSER_EXAM_KEYS ?? '')
      .split(/[\s,;]+/)
      .map(key => validHex(key))
      .filter((key): key is string => key !== null),
  ).size

  const siteUrlRaw = environment.NEXT_PUBLIC_SITE_URL
  const siteUrlValue = siteUrlRaw?.trim()
  const siteUrl = parseHttpUrl(siteUrlValue)
  const siteUrlReady = siteUrl !== null
    && (!production || siteUrl.protocol === 'https:')
    && siteUrl.username === ''
    && siteUrl.password === ''
    && siteUrl.pathname === '/'
    && siteUrl.search === ''
    && siteUrl.hash === ''
    && siteUrlRaw === siteUrl.origin

  const configUrlValue = environment.NEXT_PUBLIC_SEB_CONFIG_URL?.trim()
  const configUrl = parseHttpUrl(configUrlValue)
  const configFileStatus: SebReadiness['configFileStatus'] = !configUrlValue
    ? 'manual'
    : configUrl
      && (!production || configUrl.protocol === 'https:')
      && configUrl.username === ''
      && configUrl.password === ''
      && configUrl.pathname.toLowerCase().endsWith('.seb')
        ? 'ready'
        : 'invalid'

  return {
    publishReady: sessionSecretReady
      && configKeyReady
      && browserExamKeyCount > 0
      && siteUrlReady,
    sessionSecretReady,
    configKeyReady,
    browserExamKeyCount,
    siteUrlReady,
    configFileStatus,
  }
}

export function readSebEnvironment(
  environment: Record<string, string | undefined> = process.env,
): SebEnvironment | null {
  const sessionSecret = environment.SEB_SESSION_SECRET?.trim() ?? ''
  const configKey = validHex(environment.SEB_CONFIG_KEY)
  const browserExamKeys = (environment.SEB_BROWSER_EXAM_KEYS ?? '')
    .split(/[\s,;]+/)
    .map(key => validHex(key))
    .filter((key): key is string => key !== null)

  if (sessionSecret.length < 32 || !configKey || browserExamKeys.length === 0) return null

  return {
    sessionSecret,
    configKey,
    browserExamKeys: [...new Set(browserExamKeys)],
  }
}

/** SEB hashes the exact requested URL without a possible fragment. */
export function normalizeSebRequestUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Unsupported SEB request URL protocol')
  }
  url.hash = ''
  return url.toString()
}

export function createSebRequestHash(requestUrl: string, rawKey: string) {
  const key = validHex(rawKey)
  if (!key) throw new Error('Invalid SEB key')
  return createHash('sha256')
    .update(`${normalizeSebRequestUrl(requestUrl)}${key}`, 'utf8')
    .digest('hex')
}

export function verifySebRequestHashes(input: {
  requestUrl: string
  configKeyHash: string
  browserExamKeyHash: string
  configKey: string
  browserExamKeys: string[]
}) {
  const receivedConfigHash = normalizedHash(input.configKeyHash)
  const receivedBrowserHash = normalizedHash(input.browserExamKeyHash)
  if (!receivedConfigHash || !receivedBrowserHash) return false

  const expectedConfigHash = createSebRequestHash(input.requestUrl, input.configKey)
  if (!safeEqual(receivedConfigHash, expectedConfigHash)) return false

  return input.browserExamKeys.some(key => {
    const expectedBrowserHash = createSebRequestHash(input.requestUrl, key)
    return safeEqual(receivedBrowserHash, expectedBrowserHash)
  })
}

export function parseSebVersion(value: unknown): SebVersionInfo | null {
  if (
    typeof value !== 'string'
    || value.length < 5
    || value.length > MAX_VERSION_LENGTH
    || /[\u0000-\u001f\u007f]/.test(value)
  ) return null

  const osMatch = value.match(/_(Windows|macOS|iOS)_/)
  if (!osMatch) return null

  const platform: SebPlatform = osMatch[1] === 'Windows'
    ? 'windows'
    : osMatch[1] === 'macOS'
      ? 'macos'
      : 'ios'

  return { platform, version: value }
}

function encodeClaims(claims: SebClaims) {
  return Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
}

function tokenSignature(encodedClaims: string, secret: string) {
  return createHmac('sha256', secret).update(encodedClaims, 'utf8').digest('base64url')
}

export function signSebClaims(claims: SebClaims, secret: string) {
  if (secret.length < 32) throw new Error('SEB session secret is too short')
  const encodedClaims = encodeClaims(claims)
  return `${encodedClaims}.${tokenSignature(encodedClaims, secret)}`
}

export function verifySebClaims(token: string, secret: string, now = Date.now()): SebClaims | null {
  if (secret.length < 32 || token.length > 2_000) return null
  const [encodedClaims, receivedSignature, extra] = token.split('.')
  if (!encodedClaims || !receivedSignature || extra) return null
  if (!safeEqual(receivedSignature, tokenSignature(encodedClaims, secret))) return null

  try {
    const parsed = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8')) as Partial<SebClaims>
    if (
      (parsed.kind !== 'seb_challenge' && parsed.kind !== 'seb_session')
      || !UUID_PATTERN.test(parsed.userId ?? '')
      || !UUID_PATTERN.test(parsed.assignmentId ?? '')
      || !Number.isInteger(parsed.issuedAt)
      || !Number.isInteger(parsed.expiresAt)
      || (parsed.issuedAt as number) > now + 60_000
      || (parsed.expiresAt as number) <= now
      || (parsed.expiresAt as number) <= (parsed.issuedAt as number)
    ) return null

    if (parsed.kind === 'seb_challenge') {
      if (
        (parsed.purpose !== 'take' && parsed.purpose !== 'system_check')
        || typeof parsed.nonce !== 'string'
        || !/^[0-9a-f]{32}$/.test(parsed.nonce)
      ) return null
      return parsed as SebChallengeClaims
    }

    const sessionClaims = parsed as Partial<SebSessionClaims>
    if (
      (sessionClaims.platform !== 'windows' && sessionClaims.platform !== 'macos' && sessionClaims.platform !== 'ios')
      || !parseSebVersion(sessionClaims.version)
    ) return null
    return sessionClaims as SebSessionClaims
  } catch {
    return null
  }
}

export function createSebChallengeClaims(
  userId: string,
  assignmentId: string,
  purpose: SebChallengePurpose = 'take',
  now = Date.now(),
): SebChallengeClaims {
  return {
    kind: 'seb_challenge',
    userId,
    assignmentId,
    purpose,
    nonce: randomBytes(16).toString('hex'),
    issuedAt: now,
    expiresAt: now + 5 * 60_000,
  }
}

export function createSebSessionClaims(input: {
  userId: string
  assignmentId: string
  platform: SebPlatform
  version: string
  now?: number
}): SebSessionClaims {
  const now = input.now ?? Date.now()
  return {
    kind: 'seb_session',
    userId: input.userId,
    assignmentId: input.assignmentId,
    platform: input.platform,
    version: input.version,
    issuedAt: now,
    expiresAt: now + 12 * 60 * 60_000,
  }
}
