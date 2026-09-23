import 'server-only'

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SebBrowserExamKeyEntry } from '@/lib/seb'

export const ASSIGNMENT_SEB_CONFIG_BUCKET = 'assignment-seb-configs'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const RELEASE_ID_PATTERN = /^asr-[0-9a-f]{32}-r[1-9][0-9]{0,9}-[0-9a-f]{16}$/
const SAFE_METADATA_PATTERN = /^[A-Za-z0-9.+-]{1,40}$/
const MAX_REVISION = 2_147_483_646
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024

type PlainRecord = Record<string, unknown>

export type AssignmentSebSecurityMode = 'x509_encrypted' | 'test_plaintext'

export type AssignmentSebReleaseMetadata = Readonly<{
  assignmentId: string
  orgId: string
  ownerId: string
  revision: number
  releaseId: string
  artifactPath: string
  artifactSha256: string
  artifactSizeBytes: number
  securityMode: AssignmentSebSecurityMode
  browserExamKeyCount: number
  createdAt: string
}>

export type AssignmentSebVerificationRelease = AssignmentSebReleaseMetadata & Readonly<{
  configKey: string
  browserExamKeys: readonly SebBrowserExamKeyEntry[]
}>

export type RegisterAssignmentSebReleaseInput = Readonly<{
  assignmentId: string
  revision: number
  artifactPath: string
  artifactSha256: string
  artifactSizeBytes: number
  configKey: string
  browserExamKeys: readonly SebBrowserExamKeyEntry[]
  securityMode: AssignmentSebSecurityMode
}>

function isPlainRecord(value: unknown): value is PlainRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: PlainRecord, expected: readonly string[]) {
  const keys = Reflect.ownKeys(value)
  if (keys.some(key => typeof key !== 'string')) return false
  const actual = (keys as string[]).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index])
}

function validRevision(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_REVISION
}

function parseBrowserExamKeys(value: unknown): readonly SebBrowserExamKeyEntry[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) return null
  const identities = new Set<string>()
  const entries: SebBrowserExamKeyEntry[] = []

  for (const candidate of value) {
    if (!isPlainRecord(candidate) || !exactKeys(candidate, ['platform', 'versionString', 'buildNumber', 'key'])) {
      return null
    }
    if (
      (candidate.platform !== 'windows' && candidate.platform !== 'macos' && candidate.platform !== 'ios')
      || typeof candidate.versionString !== 'string'
      || !SAFE_METADATA_PATTERN.test(candidate.versionString)
      || typeof candidate.buildNumber !== 'string'
      || !SAFE_METADATA_PATTERN.test(candidate.buildNumber)
      || typeof candidate.key !== 'string'
      || !SHA256_PATTERN.test(candidate.key)
    ) return null

    const identity = `${candidate.platform}:${candidate.versionString}:${candidate.buildNumber}`
    if (identities.has(identity)) return null
    identities.add(identity)
    entries.push(Object.freeze({
      platform: candidate.platform,
      versionString: candidate.versionString,
      buildNumber: candidate.buildNumber,
      key: candidate.key,
    }))
  }

  return Object.freeze(entries)
}

function parseReleaseRow(value: unknown): AssignmentSebVerificationRelease | null {
  if (!isPlainRecord(value) || !exactKeys(value, [
    'assignment_id',
    'revision',
    'org_id',
    'owner_id',
    'release_id',
    'artifact_storage_path',
    'artifact_sha256',
    'artifact_size_bytes',
    'config_key',
    'browser_exam_keys',
    'security_mode',
    'created_at',
  ])) return null

  const browserExamKeys = parseBrowserExamKeys(value.browser_exam_keys)
  if (
    typeof value.assignment_id !== 'string'
    || !UUID_PATTERN.test(value.assignment_id)
    || typeof value.org_id !== 'string'
    || !UUID_PATTERN.test(value.org_id)
    || typeof value.owner_id !== 'string'
    || !UUID_PATTERN.test(value.owner_id)
    || !validRevision(value.revision)
    || typeof value.release_id !== 'string'
    || !RELEASE_ID_PATTERN.test(value.release_id)
    || typeof value.artifact_storage_path !== 'string'
    || value.artifact_storage_path !== assignmentSebArtifactPath(
      value.assignment_id,
      value.revision,
      value.artifact_sha256,
    )
    || typeof value.artifact_sha256 !== 'string'
    || !SHA256_PATTERN.test(value.artifact_sha256)
    || !Number.isInteger(value.artifact_size_bytes)
    || (value.artifact_size_bytes as number) < 1
    || (value.artifact_size_bytes as number) > MAX_ARTIFACT_BYTES
    || typeof value.config_key !== 'string'
    || !SHA256_PATTERN.test(value.config_key)
    || !browserExamKeys
    || (value.security_mode !== 'x509_encrypted' && value.security_mode !== 'test_plaintext')
    || typeof value.created_at !== 'string'
    || !Number.isFinite(Date.parse(value.created_at))
  ) return null

  return Object.freeze({
    assignmentId: value.assignment_id,
    orgId: value.org_id,
    ownerId: value.owner_id,
    revision: value.revision,
    releaseId: value.release_id,
    artifactPath: value.artifact_storage_path,
    artifactSha256: value.artifact_sha256,
    artifactSizeBytes: value.artifact_size_bytes as number,
    configKey: value.config_key,
    browserExamKeys,
    securityMode: value.security_mode,
    browserExamKeyCount: browserExamKeys.length,
    createdAt: value.created_at,
  })
}

function safeMetadata(release: AssignmentSebVerificationRelease): AssignmentSebReleaseMetadata {
  const {
    assignmentId,
    orgId,
    ownerId,
    revision,
    releaseId,
    artifactPath,
    artifactSha256,
    artifactSizeBytes,
    securityMode,
    browserExamKeyCount,
    createdAt,
  } = release
  return Object.freeze({
    assignmentId,
    orgId,
    ownerId,
    revision,
    releaseId,
    artifactPath,
    artifactSha256,
    artifactSizeBytes,
    securityMode,
    browserExamKeyCount,
    createdAt,
  })
}

function parseSiteUrl(environment: Record<string, string | undefined>) {
  try {
    return new URL(environment.NEXT_PUBLIC_SITE_URL ?? '')
  } catch {
    return null
  }
}

/**
 * Plaintext assignment configs are an explicit isolated-Staging escape hatch.
 * They never become publishable merely because NODE_ENV is production (as a
 * hosted Staging build is); both the opt-in and the staging hostname must be
 * exact. Production remains X.509-only.
 */
export function assignmentSebSecurityModeAllowed(
  securityMode: AssignmentSebSecurityMode,
  environment: Record<string, string | undefined> = process.env,
) {
  if (securityMode === 'x509_encrypted') return true
  const siteUrl = parseSiteUrl(environment)
  return environment.SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS === 'true'
    && siteUrl?.protocol === 'https:'
    && siteUrl.hostname === 'staging.korkru.com'
}

export function assignmentSebArtifactPath(
  assignmentId: string,
  revision: number,
  artifactSha256: unknown,
) {
  if (!UUID_PATTERN.test(assignmentId) || !validRevision(revision)) return ''
  if (typeof artifactSha256 !== 'string' || !SHA256_PATTERN.test(artifactSha256)) return ''
  return `assignments/${assignmentId}/r${revision}/${artifactSha256}.seb`
}

const RELEASE_SELECT = [
  'assignment_id',
  'revision',
  'org_id',
  'owner_id',
  'release_id',
  'artifact_storage_path',
  'artifact_sha256',
  'artifact_size_bytes',
  'config_key',
  'browser_exam_keys',
  'security_mode',
  'created_at',
].join(', ')

export async function readAssignmentSebRelease(
  assignmentId: string,
  revision: number,
  environment: Record<string, string | undefined> = process.env,
): Promise<AssignmentSebVerificationRelease | null> {
  if (!UUID_PATTERN.test(assignmentId) || !validRevision(revision)) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('assignment_seb_config_releases')
    .select(RELEASE_SELECT)
    .eq('assignment_id', assignmentId)
    .eq('revision', revision)
    .maybeSingle()
  if (error || !data) return null
  const release = parseReleaseRow(data)
  return release && assignmentSebSecurityModeAllowed(release.securityMode, environment)
    ? release
    : null
}

export async function readCurrentAssignmentSebRelease(
  assignmentId: string,
  environment: Record<string, string | undefined> = process.env,
): Promise<AssignmentSebVerificationRelease | null> {
  if (!UUID_PATTERN.test(assignmentId)) return null
  const admin = createAdminClient()
  const { data: revisionRow, error: revisionError } = await admin
    .from('assignment_seb_config_revisions')
    .select('revision')
    .eq('assignment_id', assignmentId)
    .order('revision', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (revisionError || !validRevision(revisionRow?.revision)) return null

  const { data, error } = await admin
    .from('assignment_seb_config_releases')
    .select(RELEASE_SELECT)
    .eq('assignment_id', assignmentId)
    .eq('revision', revisionRow.revision)
    .maybeSingle()
  if (error || !data) return null
  const release = parseReleaseRow(data)
  return release && assignmentSebSecurityModeAllowed(release.securityMode, environment)
    ? release
    : null
}

export async function hasCurrentAssignmentSebRelease(assignmentId: string) {
  return await readCurrentAssignmentSebRelease(assignmentId) !== null
}

export async function createAssignmentSebSignedDownloadUrl(
  release: AssignmentSebVerificationRelease,
) {
  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(ASSIGNMENT_SEB_CONFIG_BUCKET)
    .createSignedUrl(release.artifactPath, 5 * 60, {
      download: `korkru-seb-${release.assignmentId}-r${release.revision}.seb`,
    })
  return error ? null : data.signedUrl
}

function parseRegisterInput(value: unknown): RegisterAssignmentSebReleaseInput {
  if (!isPlainRecord(value) || !exactKeys(value, [
    'assignmentId',
    'revision',
    'artifactPath',
    'artifactSha256',
    'artifactSizeBytes',
    'configKey',
    'browserExamKeys',
    'securityMode',
  ])) throw new Error('SEB_ASSIGNMENT_RELEASE_INVALID')

  const browserExamKeys = parseBrowserExamKeys(value.browserExamKeys)
  if (
    typeof value.assignmentId !== 'string'
    || !UUID_PATTERN.test(value.assignmentId)
    || !validRevision(value.revision)
    || typeof value.artifactSha256 !== 'string'
    || !SHA256_PATTERN.test(value.artifactSha256)
    || typeof value.artifactPath !== 'string'
    || value.artifactPath !== assignmentSebArtifactPath(value.assignmentId, value.revision, value.artifactSha256)
    || !Number.isInteger(value.artifactSizeBytes)
    || (value.artifactSizeBytes as number) < 1
    || (value.artifactSizeBytes as number) > MAX_ARTIFACT_BYTES
    || typeof value.configKey !== 'string'
    || !SHA256_PATTERN.test(value.configKey)
    || !browserExamKeys
    || (value.securityMode !== 'x509_encrypted' && value.securityMode !== 'test_plaintext')
  ) throw new Error('SEB_ASSIGNMENT_RELEASE_INVALID')

  return Object.freeze({
    assignmentId: value.assignmentId,
    revision: value.revision,
    artifactPath: value.artifactPath,
    artifactSha256: value.artifactSha256,
    artifactSizeBytes: value.artifactSizeBytes as number,
    configKey: value.configKey,
    browserExamKeys,
    securityMode: value.securityMode,
  })
}

/**
 * Internal operator/pipeline boundary. It verifies the exact private Storage
 * object before crossing the service-only registration RPC. No CK, BEK or
 * password-derived material is returned.
 */
export async function registerAssignmentSebRelease(
  input: unknown,
): Promise<AssignmentSebReleaseMetadata> {
  const parsed = parseRegisterInput(input)
  if (!assignmentSebSecurityModeAllowed(parsed.securityMode)) {
    throw new Error('SEB_ASSIGNMENT_RELEASE_SECURITY_MODE_BLOCKED')
  }
  const admin = createAdminClient()
  const { data: artifact, error: artifactError } = await admin.storage
    .from(ASSIGNMENT_SEB_CONFIG_BUCKET)
    .download(parsed.artifactPath)
  if (artifactError || !artifact) throw new Error('SEB_ASSIGNMENT_RELEASE_ARTIFACT_MISSING')

  const bytes = Buffer.from(await artifact.arrayBuffer())
  if (
    bytes.length !== parsed.artifactSizeBytes
    || createHash('sha256').update(bytes).digest('hex') !== parsed.artifactSha256
  ) throw new Error('SEB_ASSIGNMENT_RELEASE_ARTIFACT_MISMATCH')

  const { data, error } = await admin.rpc('register_assignment_seb_config_release', {
    p_assignment_id: parsed.assignmentId,
    p_revision: parsed.revision,
    p_artifact_storage_path: parsed.artifactPath,
    p_artifact_sha256: parsed.artifactSha256,
    p_artifact_size_bytes: parsed.artifactSizeBytes,
    p_config_key: parsed.configKey,
    p_browser_exam_keys: parsed.browserExamKeys,
    p_security_mode: parsed.securityMode,
  })
  if (error || !Array.isArray(data) || data.length !== 1 || !isPlainRecord(data[0])) {
    throw new Error('SEB_ASSIGNMENT_RELEASE_PERSISTENCE_FAILED')
  }

  const row = data[0]
  if (!exactKeys(row, [
    'assignment_id',
    'org_id',
    'owner_id',
    'revision',
    'release_id',
    'artifact_storage_path',
    'artifact_sha256',
    'artifact_size_bytes',
    'security_mode',
    'browser_exam_key_count',
    'created_at',
  ])) throw new Error('SEB_ASSIGNMENT_RELEASE_PERSISTENCE_FAILED')

  const { browser_exam_key_count: browserExamKeyCount, ...releaseRow } = row
  const release = parseReleaseRow({
    ...releaseRow,
    config_key: parsed.configKey,
    browser_exam_keys: parsed.browserExamKeys,
  })
  if (
    !release
    || release.assignmentId !== parsed.assignmentId
    || release.revision !== parsed.revision
    || release.artifactPath !== parsed.artifactPath
    || release.artifactSha256 !== parsed.artifactSha256
    || release.artifactSizeBytes !== parsed.artifactSizeBytes
    || release.securityMode !== parsed.securityMode
    || browserExamKeyCount !== parsed.browserExamKeys.length
  ) throw new Error('SEB_ASSIGNMENT_RELEASE_PERSISTENCE_FAILED')

  return safeMetadata(release)
}
