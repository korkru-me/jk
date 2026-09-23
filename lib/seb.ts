import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import sebReleaseRegistry from '@/config/seb-release-registry.json'

export type SebPlatform = 'windows' | 'macos' | 'ios'
export type SebChallengePurpose = 'take' | 'system_check'

export interface SebVersionInfo {
  platform: SebPlatform
  version: string
  versionString: string
  buildNumber: string
}

export interface SebChallengeClaims {
  kind: 'seb_challenge'
  userId: string
  assignmentId: string
  configRevision: string
  assignmentConfigRevision: number
  purpose: SebChallengePurpose
  nonce: string
  issuedAt: number
  expiresAt: number
}

export interface SebSessionClaims {
  kind: 'seb_session'
  userId: string
  assignmentId: string
  configRevision: string
  assignmentConfigRevision: number
  platform: SebPlatform
  version: string
  issuedAt: number
  expiresAt: number
}

type SebClaims = SebChallengeClaims | SebSessionClaims

export interface SebEnvironment {
  sessionSecret: string
  configKey: string
  configRevision: string
  browserExamKeys: SebBrowserExamKeyEntry[]
}

export interface SebBrowserExamKeyEntry {
  platform: SebPlatform
  versionString: string
  buildNumber: string
  key: string
}

export interface SebReadiness {
  publishReady: boolean
  sessionSecretReady: boolean
  configKeyReady: boolean
  configRevisionReady: boolean
  releaseRegistryReady: boolean
  browserExamKeyRegistryReady: boolean
  browserExamKeyCoverageReady: boolean
  browserExamKeyCount: number
  siteUrlReady: boolean
  configFileStatus: 'ready' | 'manual' | 'invalid'
}

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_VERSION_LENGTH = 240
const SAFE_METADATA_PATTERN = /^[A-Za-z0-9.+-]{1,40}$/
const SAFE_REVISION_PATTERN = /^[A-Za-z0-9._-]{1,120}$/
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646
const SEB_KEY_REGISTRY_FIELDS = new Set(['schemaVersion', 'configRevision', 'entries'])
const SEB_KEY_ENTRY_FIELDS = new Set(['platform', 'versionString', 'buildNumber', 'key'])

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

function validConfigRevision(value: string | undefined) {
  const trimmed = value?.trim() ?? ''
  return SAFE_REVISION_PATTERN.test(trimmed) ? trimmed : null
}

function validAssignmentConfigRevision(value: unknown): value is number {
  return Number.isInteger(value)
    && (value as number) >= 1
    && (value as number) <= MAX_ASSIGNMENT_CONFIG_REVISION
}

/** Session signing is shared infrastructure; assignment CK/BEKs are not. */
export function readSebSessionSecret(
  environment: Record<string, string | undefined> = process.env,
) {
  const secret = environment.SEB_SESSION_SECRET?.trim() ?? ''
  return secret.length >= 32 ? secret : null
}

function parseSebBrowserExamKeyRegistry(
  rawValue: string | undefined,
  expectedConfigRevision: string | null,
): SebBrowserExamKeyEntry[] | null {
  if (!rawValue || rawValue.length > 24_000 || !expectedConfigRevision) return null

  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const registry = parsed as Record<string, unknown>
    if (
      Object.keys(registry).some(field => !SEB_KEY_REGISTRY_FIELDS.has(field))
      || registry.schemaVersion !== 1
      || registry.configRevision !== expectedConfigRevision
      || !Array.isArray(registry.entries)
      || registry.entries.length === 0
      || registry.entries.length > 32
    ) return null

    const entries: SebBrowserExamKeyEntry[] = []
    const identities = new Set<string>()
    for (const candidate of registry.entries) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
      const entry = candidate as Record<string, unknown>
      if (Object.keys(entry).some(field => !SEB_KEY_ENTRY_FIELDS.has(field))) return null
      if (
        (entry.platform !== 'windows' && entry.platform !== 'macos' && entry.platform !== 'ios')
        || typeof entry.versionString !== 'string'
        || !SAFE_METADATA_PATTERN.test(entry.versionString)
        || typeof entry.buildNumber !== 'string'
        || !SAFE_METADATA_PATTERN.test(entry.buildNumber)
        || typeof entry.key !== 'string'
      ) return null
      const key = validHex(entry.key)
      if (!key) return null
      const identity = `${entry.platform}:${entry.versionString}:${entry.buildNumber}`
      if (identities.has(identity)) return null
      identities.add(identity)
      entries.push({
        platform: entry.platform,
        versionString: entry.versionString,
        buildNumber: entry.buildNumber,
        key,
      })
    }
    return entries
  } catch {
    return null
  }
}

function inspectReleaseRegistryBinding(
  releaseRegistry: unknown,
  configRevision: string | null,
  browserExamKeys: SebBrowserExamKeyEntry[] | null,
) {
  const empty = {
    configRevisionReady: false,
    releaseRegistryReady: false,
    browserExamKeyRegistryReady: false,
    browserExamKeyCoverageReady: false,
  }
  if (!configRevision || !releaseRegistry || typeof releaseRegistry !== 'object') return empty
  const registry = releaseRegistry as { revisions?: unknown }
  if (!Array.isArray(registry.revisions)) return empty
  const revision = registry.revisions.find(candidate => {
    return candidate && typeof candidate === 'object'
      && (candidate as { revision?: unknown }).revision === configRevision
  }) as {
    lifecycle?: unknown
    policy?: unknown
    builds?: unknown
  } | undefined
  if (!revision || (revision.lifecycle !== 'candidate' && revision.lifecycle !== 'active')) return empty

  const builds = Array.isArray(revision.builds) ? revision.builds : []
  const targets = new Set<string>()
  const declaredIdentities = new Set<string>()
  let buildsApproved = builds.length === 4
  for (const candidate of builds) {
    if (!candidate || typeof candidate !== 'object') {
      buildsApproved = false
      continue
    }
    const build = candidate as Record<string, unknown>
    if (typeof build.target === 'string') targets.add(build.target)
    const expectedRuntime = build.target === 'ipados' || build.target === 'ios'
      ? 'ios'
      : build.target
    const metadataReady = (build.runtimePlatform === 'windows'
      || build.runtimePlatform === 'macos'
      || build.runtimePlatform === 'ios')
      && build.runtimePlatform === expectedRuntime
      && typeof build.versionString === 'string'
      && SAFE_METADATA_PATTERN.test(build.versionString)
      && typeof build.buildNumber === 'string'
      && SAFE_METADATA_PATTERN.test(build.buildNumber)
    if (metadataReady) {
      declaredIdentities.add(`${build.runtimePlatform}:${build.versionString}:${build.buildNumber}`)
    }
    if (!metadataReady || build.approval !== 'approved') buildsApproved = false
  }
  const requiredTargetsReady = ['macos', 'ipados', 'ios', 'windows']
    .every(target => targets.has(target))
  const policy = revision.policy && typeof revision.policy === 'object'
    ? revision.policy as Record<string, unknown>
    : {}
  const policiesReady = Object.keys(policy).length === 6
    && Object.values(policy).every(value => value === 'approved')
  const receivedIdentities = new Set(
    (browserExamKeys ?? []).map(entry => `${entry.platform}:${entry.versionString}:${entry.buildNumber}`),
  )
  const entriesDeclared = browserExamKeys !== null
    && receivedIdentities.size > 0
    && [...receivedIdentities].every(identity => declaredIdentities.has(identity))
  const coverageReady = entriesDeclared
    && requiredTargetsReady
    && declaredIdentities.size > 0
    && [...declaredIdentities].every(identity => receivedIdentities.has(identity))

  return {
    configRevisionReady: true,
    releaseRegistryReady: requiredTargetsReady && buildsApproved && policiesReady,
    browserExamKeyRegistryReady: entriesDeclared,
    browserExamKeyCoverageReady: coverageReady,
  }
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
  releaseRegistry: unknown = sebReleaseRegistry,
): SebReadiness {
  const production = environment.NODE_ENV === 'production'
  const sessionSecretReady = (environment.SEB_SESSION_SECRET?.trim().length ?? 0) >= 32
  const configKeyReady = validHex(environment.SEB_CONFIG_KEY) !== null
  const configRevision = validConfigRevision(environment.SEB_CONFIG_REVISION)
  const browserExamKeys = parseSebBrowserExamKeyRegistry(
    environment.SEB_BROWSER_EXAM_KEY_REGISTRY,
    configRevision,
  )
  const registryBinding = inspectReleaseRegistryBinding(
    releaseRegistry,
    configRevision,
    browserExamKeys,
  )
  const {
    configRevisionReady,
    releaseRegistryReady,
    browserExamKeyRegistryReady,
    browserExamKeyCoverageReady,
  } = registryBinding
  const browserExamKeyCount = browserExamKeys?.length ?? 0

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
      && configRevisionReady
      && releaseRegistryReady
      && browserExamKeyRegistryReady
      && browserExamKeyCoverageReady
      && browserExamKeyCount > 0
      && siteUrlReady,
    sessionSecretReady,
    configKeyReady,
    configRevisionReady,
    releaseRegistryReady,
    browserExamKeyRegistryReady,
    browserExamKeyCoverageReady,
    browserExamKeyCount,
    siteUrlReady,
    configFileStatus,
  }
}

export function readSebEnvironment(
  environment: Record<string, string | undefined> = process.env,
  releaseRegistry: unknown = sebReleaseRegistry,
): SebEnvironment | null {
  const sessionSecret = environment.SEB_SESSION_SECRET?.trim() ?? ''
  const configKey = validHex(environment.SEB_CONFIG_KEY)
  const configRevision = validConfigRevision(environment.SEB_CONFIG_REVISION)
  const browserExamKeys = parseSebBrowserExamKeyRegistry(
    environment.SEB_BROWSER_EXAM_KEY_REGISTRY,
    configRevision,
  )

  const registryBinding = inspectReleaseRegistryBinding(
    releaseRegistry,
    configRevision,
    browserExamKeys,
  )
  if (
    sessionSecret.length < 32
    || !configKey
    || !configRevision
    || !browserExamKeys
    || !registryBinding.configRevisionReady
    || !registryBinding.browserExamKeyRegistryReady
  ) return null

  return {
    sessionSecret,
    configKey,
    configRevision,
    browserExamKeys,
  }
}

export function selectSebBrowserExamKeys(
  entries: readonly SebBrowserExamKeyEntry[],
  version: SebVersionInfo,
) {
  return entries
    .filter(entry => entry.platform === version.platform
      && entry.versionString === version.versionString
      && entry.buildNumber === version.buildNumber)
    .map(entry => entry.key)
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

  const versionMatch = value.match(/_(Windows|macOS|iOS)_([A-Za-z0-9.+-]+)_([A-Za-z0-9.+-]+)_[^\s]+$/)
  if (!versionMatch) return null

  const platform: SebPlatform = versionMatch[1] === 'Windows'
    ? 'windows'
    : versionMatch[1] === 'macOS'
      ? 'macos'
      : 'ios'

  return {
    platform,
    version: value,
    versionString: versionMatch[2],
    buildNumber: versionMatch[3],
  }
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
        || !validConfigRevision(parsed.configRevision)
        || !validAssignmentConfigRevision(parsed.assignmentConfigRevision)
      ) return null
      return parsed as SebChallengeClaims
    }

    const sessionClaims = parsed as Partial<SebSessionClaims>
    const sessionVersion = parseSebVersion(sessionClaims.version)
    if (
      (sessionClaims.platform !== 'windows' && sessionClaims.platform !== 'macos' && sessionClaims.platform !== 'ios')
      || !validConfigRevision(sessionClaims.configRevision)
      || !validAssignmentConfigRevision(sessionClaims.assignmentConfigRevision)
      || !sessionVersion
      || sessionVersion.platform !== sessionClaims.platform
    ) return null
    return sessionClaims as SebSessionClaims
  } catch {
    return null
  }
}

export function createSebChallengeClaims(
  userId: string,
  assignmentId: string,
  configRevision: string,
  assignmentConfigRevision: number,
  purpose: SebChallengePurpose = 'take',
  now = Date.now(),
): SebChallengeClaims {
  return {
    kind: 'seb_challenge',
    userId,
    assignmentId,
    configRevision,
    assignmentConfigRevision,
    purpose,
    nonce: randomBytes(16).toString('hex'),
    issuedAt: now,
    expiresAt: now + 5 * 60_000,
  }
}

export function createSebSessionClaims(input: {
  userId: string
  assignmentId: string
  configRevision: string
  assignmentConfigRevision: number
  platform: SebPlatform
  version: string
  now?: number
}): SebSessionClaims {
  const now = input.now ?? Date.now()
  return {
    kind: 'seb_session',
    userId: input.userId,
    assignmentId: input.assignmentId,
    configRevision: input.configRevision,
    assignmentConfigRevision: input.assignmentConfigRevision,
    platform: input.platform,
    version: input.version,
    issuedAt: now,
    expiresAt: now + 12 * 60 * 60_000,
  }
}
