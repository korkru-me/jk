import { inspectDeploymentEnvironment } from '@/lib/deployment-environment.mjs'
import type { AssignmentSebReleaseMetadata } from '@/lib/seb-assignment-release.server'

export const WAITING_SEB_RELEASE_PROFILE_ID = 'waiting-room-completion-experimental-v1'
export const WAITING_SEB_MAX_ARTIFACT_BYTES = 2 * 1024 * 1024

const ORIGINS = new Set(['https://korkru-seb-uat.vercel.app', 'https://staging.korkru.com'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^[0-9a-f]{64}$/
const MAX_REVISION = 2_147_483_646
const MAX_MANIFEST_LENGTH = 64 * 1024
const MAX_RELEASES = 64

export type WaitingSebEnvironment = Readonly<Record<string, string | undefined>>
export type WaitingSebArtifactReference = Readonly<{
  sha256: string
  sizeBytes: number
  path: string
}>
export type WaitingSebProfile = Readonly<{
  assignmentId: string
  revision: number
  releaseId: string
  origin: string
  profileId: typeof WAITING_SEB_RELEASE_PROFILE_ID
  authOrigins: readonly string[]
  initial: WaitingSebArtifactReference
  terminal: WaitingSebArtifactReference
}>

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], optional: readonly string[] = []) {
  const actual = Reflect.ownKeys(value)
  return keys.every(key => Object.hasOwn(value, key))
    && actual.every(key => typeof key === 'string' && (keys.includes(key) || optional.includes(key)))
}

function canonicalAuthOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 200) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      && !url.hostname.includes('*') && url.origin === value
  } catch { return false }
}

function reference(value: unknown, assignmentId: string, revision: number): WaitingSebArtifactReference | null {
  if (!record(value) || !exactKeys(value, ['sha256', 'sizeBytes', 'path'])
    || typeof value.sha256 !== 'string' || !SHA256.test(value.sha256)
    || typeof value.sizeBytes !== 'number' || !Number.isInteger(value.sizeBytes)
    || value.sizeBytes < 1 || value.sizeBytes > WAITING_SEB_MAX_ARTIFACT_BYTES
    || value.path !== `assignments/${assignmentId}/r${revision}/${value.sha256}.seb`) return null
  return Object.freeze({ sha256: value.sha256, sizeBytes: value.sizeBytes, path: value.path as string })
}

// JSON.parse accepts repeated object keys. Refuse that ambiguity, including
// escaped spellings, before interpreting a security-sensitive manifest.
function uniqueJsonKeys(raw: string) {
  let offset = 0
  const whitespace = () => { while (/\s/.test(raw[offset] ?? '') && offset < raw.length) offset += 1 }
  const string = (): string => {
    const start = offset++
    while (offset < raw.length) {
      if (raw[offset] === '\\') { offset += 2; continue }
      if (raw[offset++] === '"') return JSON.parse(raw.slice(start, offset)) as string
    }
    throw new Error('invalid')
  }
  const value = (depth: number): void => {
    if (depth > 5) throw new Error('invalid')
    whitespace()
    if (raw[offset] === '"') { string(); return }
    if (raw[offset] === '{' || raw[offset] === '[') {
      const object = raw[offset++] === '{'
      const close = object ? '}' : ']'
      const keys = new Set<string>()
      whitespace()
      if (raw[offset] === close) { offset += 1; return }
      while (offset < raw.length) {
        if (object) {
          whitespace()
          const key = string()
          if (keys.has(key)) throw new Error('invalid')
          keys.add(key)
          whitespace()
          offset += 1 // ':'; JSON.parse has already checked the grammar.
        }
        value(depth + 1)
        whitespace()
        if (raw[offset++] === close) return
      }
      throw new Error('invalid')
    }
    while (offset < raw.length && !/[\s,\]}]/.test(raw[offset])) offset += 1
  }
  try { value(0); whitespace(); return offset === raw.length } catch { return false }
}

/** Strict, bounded, value-redacting parser. An invalid entry blocks the whole manifest. */
export function parseWaitingSebReleaseManifest(raw: unknown): readonly WaitingSebProfile[] | null {
  if (typeof raw !== 'string' || raw.length > MAX_MANIFEST_LENGTH || raw.trim() === '') return null
  let decoded: unknown
  try { decoded = JSON.parse(raw) } catch { return null }
  if (!uniqueJsonKeys(raw) || !Array.isArray(decoded) || decoded.length > MAX_RELEASES) return null
  const scopes = new Set<string>()
  const profiles: WaitingSebProfile[] = []
  for (const candidate of decoded) {
    if (!record(candidate) || !exactKeys(candidate,
      ['assignmentId', 'revision', 'releaseId', 'origin', 'profileId', 'initial', 'terminal'], ['authOrigins'])
      || typeof candidate.assignmentId !== 'string' || !UUID.test(candidate.assignmentId)
      || typeof candidate.revision !== 'number' || !Number.isInteger(candidate.revision)
      || candidate.revision < 1 || candidate.revision > MAX_REVISION
      || typeof candidate.origin !== 'string' || !ORIGINS.has(candidate.origin)
      || candidate.profileId !== WAITING_SEB_RELEASE_PROFILE_ID) return null
    const initial = reference(candidate.initial, candidate.assignmentId, candidate.revision)
    const terminal = reference(candidate.terminal, candidate.assignmentId, candidate.revision)
    const authOrigins = Object.hasOwn(candidate, 'authOrigins') ? candidate.authOrigins : []
    if (!initial || !terminal || initial.sha256 === terminal.sha256
      || candidate.releaseId !== `asr-${candidate.assignmentId.replaceAll('-', '')}-r${candidate.revision}-${initial.sha256.slice(0, 16)}`
      || !Array.isArray(authOrigins) || authOrigins.length > 8
      || !authOrigins.every(value => canonicalAuthOrigin(value) && value !== candidate.origin)
      || new Set(authOrigins).size !== authOrigins.length) return null
    // One pair per assignment/revision: not multiple competing origins/releases.
    const scope = `${candidate.assignmentId}:${candidate.revision}`
    if (scopes.has(scope)) return null
    scopes.add(scope)
    profiles.push(Object.freeze({
      assignmentId: candidate.assignmentId,
      revision: candidate.revision,
      releaseId: candidate.releaseId,
      origin: candidate.origin,
      profileId: WAITING_SEB_RELEASE_PROFILE_ID,
      authOrigins: Object.freeze([...authOrigins].sort() as string[]),
      initial,
      terminal,
    }))
  }
  return Object.freeze(profiles)
}

export function waitingSebFeatureEnabled(environment: WaitingSebEnvironment): boolean {
  if (environment.SEB_EXAM_WAITING_ENABLED !== 'true'
    || !ORIGINS.has(environment.NEXT_PUBLIC_SITE_URL ?? '')) return false
  const deployment = inspectDeploymentEnvironment(environment)
  return deployment.tier === 'staging' && deployment.ready
}

/** Metadata matching is configuration selection, never student/attempt authority. */
export function readWaitingSebProfile(
  release: AssignmentSebReleaseMetadata,
  environment: WaitingSebEnvironment = process.env,
): WaitingSebProfile | null {
  if (!waitingSebFeatureEnabled(environment) || !release) return null
  const profiles = parseWaitingSebReleaseManifest(environment.SEB_EXAM_WAITING_RELEASES)
  return profiles?.find(profile => profile.assignmentId === release.assignmentId
    && profile.revision === release.revision && profile.releaseId === release.releaseId
    && profile.origin === environment.NEXT_PUBLIC_SITE_URL
    && profile.initial.sha256 === release.artifactSha256
    && profile.initial.sizeBytes === release.artifactSizeBytes
    && profile.initial.path === release.artifactPath) ?? null
}
