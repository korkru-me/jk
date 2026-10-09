import 'server-only'

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ASSIGNMENT_SEB_CONFIG_BUCKET, readAssignmentSebRelease } from '@/lib/seb-assignment-release.server'
import {
  readWaitingSebProfile,
  waitingSebFeatureEnabled,
  type WaitingSebArtifactReference,
  type WaitingSebEnvironment,
  type WaitingSebProfile,
} from '@/lib/seb-waiting-release-policy'
import { assignmentSebPlistHelpers } from '../scripts/seb-assignment-artifact-core.mjs'
import {
  createWaitingSebArtifactPolicy,
  freezeWaitingSebArtifact,
  readFrozenWaitingSebArtifact,
} from '../scripts/seb-waiting-artifact-core.mjs'

export type WaitingSebArtifactPhase = 'initial' | 'terminal'
export type WaitingSebArtifactErrorCode =
  | 'SEB_WAITING_DISABLED'
  | 'SEB_WAITING_RELEASE_MISMATCH'
  | 'SEB_WAITING_REVISION_MISMATCH'
  | 'SEB_WAITING_ARTIFACT_UNAVAILABLE'
  | 'SEB_WAITING_ARTIFACT_MISMATCH'
  | 'SEB_WAITING_PROFILE_INVALID'
  | 'SEB_WAITING_STORAGE_FAILED'
export type WaitingSebArtifactResult =
  | Readonly<{ ok: true; bytes: Uint8Array; sha256: string; sizeBytes: number }>
  | Readonly<{ ok: false; code: WaitingSebArtifactErrorCode }>

function failure(code: WaitingSebArtifactErrorCode): WaitingSebArtifactResult {
  return Object.freeze({ ok: false, code })
}

function sameProfile(left: WaitingSebProfile, right: WaitingSebProfile) {
  return left.assignmentId === right.assignmentId && left.revision === right.revision
    && left.releaseId === right.releaseId && left.origin === right.origin && left.profileId === right.profileId
    && JSON.stringify(left.authOrigins) === JSON.stringify(right.authOrigins)
    && ['initial', 'terminal'].every(phase => {
      const a = left[phase as WaitingSebArtifactPhase]
      const b = right[phase as WaitingSebArtifactPhase]
      return a?.sha256 === b.sha256 && a.sizeBytes === b.sizeBytes && a.path === b.path
    })
}

async function download(
  admin: ReturnType<typeof createAdminClient>,
  expected: WaitingSebArtifactReference,
): Promise<Buffer | WaitingSebArtifactErrorCode> {
  const { data, error } = await admin.storage.from(ASSIGNMENT_SEB_CONFIG_BUCKET).download(expected.path)
  if (error || !data) return 'SEB_WAITING_ARTIFACT_UNAVAILABLE'
  if (data.size !== expected.sizeBytes) return 'SEB_WAITING_ARTIFACT_MISMATCH'
  const bytes = Buffer.from(await data.arrayBuffer())
  if (bytes.length !== expected.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) {
    return 'SEB_WAITING_ARTIFACT_MISMATCH'
  }
  return bytes
}

/**
 * Private, Node-only byte verification; no cache, signed URL, CK/BEK response,
 * session creation or completion authority. The route must independently
 * authenticate/authorize its exact scope and confirm committed submit before
 * calling this helper for terminal bytes. W7 native behavior remains pending.
 */
export async function loadWaitingSebArtifact(
  supplied: WaitingSebProfile,
  phase: WaitingSebArtifactPhase,
  environment: WaitingSebEnvironment = process.env,
): Promise<WaitingSebArtifactResult> {
  if (!waitingSebFeatureEnabled(environment)) return failure('SEB_WAITING_DISABLED')
  if (!supplied || (phase !== 'initial' && phase !== 'terminal')) return failure('SEB_WAITING_PROFILE_INVALID')
  try {
    // A forged manifest/metadata object cannot replace the immutable registry.
    const release = await readAssignmentSebRelease(supplied.assignmentId, supplied.revision, environment)
    const profile = release && readWaitingSebProfile(release, environment)
    if (!profile || !sameProfile(supplied, profile)) return failure('SEB_WAITING_RELEASE_MISMATCH')
    const admin = createAdminClient()
    const { data: revision, error } = await admin.from('assignment_seb_config_revisions')
      .select('assignment_id, revision, org_id, owner_id, hashed_quit_password')
      .eq('assignment_id', release.assignmentId)
      .eq('revision', release.revision)
      .eq('org_id', release.orgId)
      .eq('owner_id', release.ownerId)
      .maybeSingle()
    if (error || !revision || revision.assignment_id !== release.assignmentId
      || revision.revision !== release.revision || revision.org_id !== release.orgId
      || revision.owner_id !== release.ownerId || typeof revision.hashed_quit_password !== 'string'
      || !/^[0-9a-f]{64}$/.test(revision.hashed_quit_password)) return failure('SEB_WAITING_REVISION_MISMATCH')

    const initialBytes = await download(admin, profile.initial)
    if (typeof initialBytes === 'string') return failure(initialBytes)
    let terminalBytes: Buffer | undefined
    if (phase === 'terminal') {
      const downloaded = await download(admin, profile.terminal)
      if (typeof downloaded === 'string') return failure(downloaded)
      terminalBytes = downloaded
    }
    try {
      const policy = createWaitingSebArtifactPolicy({
        origin: profile.origin, assignmentId: profile.assignmentId,
        revision: profile.revision, authOrigins: [...profile.authOrigins],
      })
      const expectedQuitHash = revision.hashed_quit_password
      const initial = freezeWaitingSebArtifact(initialBytes, policy, { phase: 'initial', expectedQuitHash })
      if (phase === 'initial') return Object.freeze({ ok: true, ...readFrozenWaitingSebArtifact(initial) })
      // The revision schema has no admin hash. Retention is proven against the
      // registered, digest-verified initial artifact; never against caller data.
      const decoded = assignmentSebPlistHelpers.decode(initialBytes)
      const expectedAdminHash = assignmentSebPlistHelpers.parse(decoded.xml).get('hashedAdminPassword')?.value
      if (typeof expectedAdminHash !== 'string' || !/^[0-9a-f]{64}$/i.test(expectedAdminHash)) {
        return failure('SEB_WAITING_PROFILE_INVALID')
      }
      const terminal = freezeWaitingSebArtifact(terminalBytes, policy, {
        phase: 'terminal', expectedQuitHash, expectedAdminHash,
      })
      return Object.freeze({ ok: true, ...readFrozenWaitingSebArtifact(terminal) })
    } catch { return failure('SEB_WAITING_PROFILE_INVALID') }
  } catch { return failure('SEB_WAITING_STORAGE_FAILED') }
}
