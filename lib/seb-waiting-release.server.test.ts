import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), download: vi.fn(), signedUrl: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { readWaitingSebProfile, WAITING_SEB_RELEASE_PROFILE_ID } from '@/lib/seb-waiting-release-policy'
import { loadWaitingSebArtifact } from '@/lib/seb-waiting-release.server'
import {
  createWaitingSebArtifactPolicy,
  materializeWaitingSebInitialArtifact,
  materializeWaitingSebTerminalArtifact,
} from '../scripts/seb-waiting-artifact-core.mjs'

const ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000003'
const ORG_ID = '10000000-0000-4000-8000-000000000001'
const OWNER_ID = '20000000-0000-4000-8000-000000000002'
const ORIGIN = 'https://korkru-seb-uat.vercel.app'
const TEACHER_HASH = 'b'.repeat(64)
const ADMIN_HASH = 'e'.repeat(64)
const REVISION = 3
const policy = createWaitingSebArtifactPolicy({ origin: ORIGIN, assignmentId: ASSIGNMENT_ID, revision: REVISION })
const template = Buffer.from(`<?xml version="1.0" encoding="utf-8"?><plist version="1.0"><dict>
<key>hashedAdminPassword</key><string>${'c'.repeat(64)}</string>
<key>hashedQuitPassword</key><string>${'a'.repeat(64)}</string>
</dict></plist>`)
const INITIAL = materializeWaitingSebInitialArtifact(template, policy, TEACHER_HASH, {
  randomBytes: (size: number) => Buffer.alloc(size, 9),
  hashedAdminPassword: ADMIN_HASH,
})
const TERMINAL = materializeWaitingSebTerminalArtifact(INITIAL, policy, { expectedQuitHash: TEACHER_HASH })

function ref(bytes: Buffer) {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return { sha256, sizeBytes: bytes.length, path: `assignments/${ASSIGNMENT_ID}/r${REVISION}/${sha256}.seb` }
}
function manifest(initial = INITIAL, terminal = TERMINAL) {
  const source = ref(initial)
  return {
    assignmentId: ASSIGNMENT_ID, revision: REVISION,
    releaseId: `asr-${ASSIGNMENT_ID.replaceAll('-', '')}-r${REVISION}-${source.sha256.slice(0, 16)}`,
    origin: ORIGIN, profileId: WAITING_SEB_RELEASE_PROFILE_ID,
    initial: source, terminal: ref(terminal),
  }
}
function environment(initial = INITIAL, terminal = TERMINAL) {
  return {
    SEB_EXAM_WAITING_ENABLED: 'true', SEB_EXAM_WAITING_RELEASES: JSON.stringify([manifest(initial, terminal)]),
    SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS: 'true',
    KORKRU_DEPLOYMENT_ENV: 'staging', EXAM_QA_ENVIRONMENT: 'staging', VERCEL_ENV: 'production',
    SEB_UAT_ISOLATED_PROJECT: 'true', NEXT_PUBLIC_SITE_URL: ORIGIN,
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'korkru-seb-uat.vercel.app',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic-staging.supabase.co',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://synthetic-production.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-fixture-not-real',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-fixture-not-real',
  }
}
function releaseRow(initial = INITIAL, overrides: Record<string, unknown> = {}) {
  const source = manifest(initial)
  return {
    assignment_id: ASSIGNMENT_ID, revision: REVISION, org_id: ORG_ID, owner_id: OWNER_ID,
    release_id: source.releaseId, artifact_storage_path: source.initial.path,
    artifact_sha256: source.initial.sha256, artifact_size_bytes: source.initial.sizeBytes,
    config_key: 'c'.repeat(64), security_mode: 'test_plaintext',
    browser_exam_keys: [{ platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: 'd'.repeat(64) }],
    created_at: '2026-10-09T01:00:00.000Z', ...overrides,
  }
}
function metadata(initial = INITIAL) {
  const row = releaseRow(initial)
  return {
    assignmentId: row.assignment_id, revision: row.revision, orgId: row.org_id, ownerId: row.owner_id,
    releaseId: row.release_id, artifactPath: row.artifact_storage_path,
    artifactSha256: row.artifact_sha256, artifactSizeBytes: row.artifact_size_bytes,
    securityMode: 'test_plaintext' as const, browserExamKeyCount: 1, createdAt: row.created_at,
  }
}
function adminWith(overrides: Record<string, { data: unknown; error: unknown }> = {}) {
  const results = {
    assignment_seb_config_releases: { data: releaseRow(), error: null },
    assignment_seb_config_revisions: { data: {
      assignment_id: ASSIGNMENT_ID, revision: REVISION, org_id: ORG_ID, owner_id: OWNER_ID,
      hashed_quit_password: TEACHER_HASH,
    }, error: null },
    ...overrides,
  }
  const builders: Record<string, { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn> }> = {}
  const admin = {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder), eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => results[table as keyof typeof results]),
      }
      builders[table] = builder
      return builder
    }),
    storage: { from: vi.fn(() => ({ download: mocks.download, createSignedUrl: mocks.signedUrl })) },
  }
  return { admin, builders }
}
function stored(initial = INITIAL, terminal = TERMINAL) {
  mocks.download.mockImplementation(async (path: string) => {
    const bytes = path === ref(initial).path ? initial : path === ref(terminal).path ? terminal : null
    return { data: bytes && new Blob([bytes]), error: null }
  })
}

describe('private experimental waiting-room artifact loader', () => {
  beforeEach(() => {
    mocks.createAdminClient.mockReset().mockReturnValue(adminWith().admin)
    mocks.download.mockReset()
    mocks.signedUrl.mockReset()
    stored()
  })

  it.each(['initial', 'terminal'] as const)('returns exact verified frozen envelope for %s without signed URLs or keys', async phase => {
    const env = environment()
    const profile = readWaitingSebProfile(metadata(), env)!
    const result = await loadWaitingSebArtifact(profile, phase, env)
    const expected = phase === 'initial' ? INITIAL : TERMINAL
    expect(result).toMatchObject({ ok: true, sha256: ref(expected).sha256, sizeBytes: expected.length })
    expect(result).not.toHaveProperty('path')
    if (!result.ok) throw new Error('unexpected fixture failure')
    expect(Buffer.from(result.bytes).equals(expected)).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(result).not.toHaveProperty('configKey')
    expect(result).not.toHaveProperty('browserExamKeys')
    expect(result).not.toHaveProperty('hashedQuitPassword')
    expect(mocks.signedUrl).not.toHaveBeenCalled()
    expect(mocks.download).toHaveBeenCalledWith(ref(INITIAL).path)
    if (phase === 'terminal') expect(mocks.download).toHaveBeenCalledWith(ref(TERMINAL).path)
  })

  it('checks the exact immutable release and tenant/revision before private downloads', async () => {
    const { admin, builders } = adminWith()
    mocks.createAdminClient.mockReturnValue(admin)
    const env = environment()
    await loadWaitingSebArtifact(readWaitingSebProfile(metadata(), env)!, 'terminal', env)
    expect(builders.assignment_seb_config_releases.eq.mock.calls).toEqual([
      ['assignment_id', ASSIGNMENT_ID], ['revision', REVISION],
    ])
    expect(builders.assignment_seb_config_revisions.eq.mock.calls).toEqual([
      ['assignment_id', ASSIGNMENT_ID], ['revision', REVISION], ['org_id', ORG_ID], ['owner_id', OWNER_ID],
    ])
  })

  it('never caches verified bytes or returns shared mutable bytes', async () => {
    const env = environment()
    const profile = readWaitingSebProfile(metadata(), env)!
    const first = await loadWaitingSebArtifact(profile, 'terminal', env)
    if (!first.ok) throw new Error('unexpected fixture failure')
    first.bytes.fill(0)
    const second = await loadWaitingSebArtifact(profile, 'terminal', env)
    expect(second.ok && Buffer.from(second.bytes).equals(TERMINAL)).toBe(true)
    expect(mocks.download).toHaveBeenCalledTimes(4)
  })

  it('fails closed before admin on disabled feature and before download on forged or missing release', async () => {
    const env = environment()
    const profile = readWaitingSebProfile(metadata(), env)!
    expect(await loadWaitingSebArtifact(profile, 'terminal', { ...env, SEB_EXAM_WAITING_ENABLED: 'false' }))
      .toEqual({ ok: false, code: 'SEB_WAITING_DISABLED' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(await loadWaitingSebArtifact({ ...profile, terminal: { ...profile.terminal, sha256: 'f'.repeat(64) } }, 'terminal', env))
      .toEqual({ ok: false, code: 'SEB_WAITING_RELEASE_MISMATCH' })
    mocks.createAdminClient.mockReturnValue(adminWith({
      assignment_seb_config_releases: { data: null, error: null },
    }).admin)
    expect(await loadWaitingSebArtifact(profile, 'terminal', env)).toEqual({ ok: false, code: 'SEB_WAITING_RELEASE_MISMATCH' })
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('requires exact revision tenant, teacher hash, size and SHA rather than trusting metadata alone', async () => {
    const env = environment()
    const profile = readWaitingSebProfile(metadata(), env)!
    mocks.createAdminClient.mockReturnValue(adminWith({
      assignment_seb_config_revisions: { data: { assignment_id: ASSIGNMENT_ID, revision: REVISION, org_id: ORG_ID,
        owner_id: OWNER_ID, hashed_quit_password: 'f'.repeat(64) }, error: null },
    }).admin)
    expect(await loadWaitingSebArtifact(profile, 'initial', env)).toEqual({ ok: false, code: 'SEB_WAITING_PROFILE_INVALID' })
    mocks.createAdminClient.mockReturnValue(adminWith().admin)
    mocks.download.mockResolvedValue({ data: new Blob(['wrong-size']), error: null })
    expect(await loadWaitingSebArtifact(profile, 'initial', env)).toEqual({ ok: false, code: 'SEB_WAITING_ARTIFACT_MISMATCH' })
    mocks.download.mockResolvedValue({ data: new Blob([Buffer.alloc(INITIAL.length)]), error: null })
    expect(await loadWaitingSebArtifact(profile, 'initial', env)).toEqual({ ok: false, code: 'SEB_WAITING_ARTIFACT_MISMATCH' })
    mocks.createAdminClient.mockReturnValue(adminWith({
      assignment_seb_config_revisions: { data: { assignment_id: ASSIGNMENT_ID, revision: REVISION, org_id: OWNER_ID,
        owner_id: OWNER_ID, hashed_quit_password: TEACHER_HASH }, error: null },
    }).admin)
    expect(await loadWaitingSebArtifact(profile, 'terminal', env)).toEqual({ ok: false, code: 'SEB_WAITING_REVISION_MISMATCH' })
  })

  it('rejects changed terminal admin/teacher, broad filters or initial quit even with matching manifest digests', async () => {
    for (const [initial, terminal] of [
      [INITIAL, Buffer.from(TERMINAL.toString().replace(ADMIN_HASH, 'f'.repeat(64)))],
      [INITIAL, Buffer.from(TERMINAL.toString().replace(TEACHER_HASH, 'f'.repeat(64)))],
      [INITIAL, Buffer.from(TERMINAL.toString().replace('<key>URLFilterEnableContentFilter</key><true/>', '<key>URLFilterEnableContentFilter</key><false/>'))],
      [Buffer.from(INITIAL.toString().replace('<key>quitURL</key><string></string>', '<key>quitURL</key><string>https://escape.test</string>')), TERMINAL],
    ]) {
      const env = environment(initial, terminal)
      mocks.createAdminClient.mockReturnValue(adminWith({
        assignment_seb_config_releases: { data: releaseRow(initial), error: null },
      }).admin)
      stored(initial, terminal)
      const profile = readWaitingSebProfile(metadata(initial), env)!
      expect(await loadWaitingSebArtifact(profile, 'terminal', env)).toEqual({ ok: false, code: 'SEB_WAITING_PROFILE_INVALID' })
    }
  })

  it('returns only fixed safe codes for missing storage, SDK exceptions and encrypted unsupported bytes', async () => {
    const env = environment()
    const profile = readWaitingSebProfile(metadata(), env)!
    mocks.download.mockResolvedValue({ data: null, error: { message: 'sensitive-storage-detail' } })
    expect(await loadWaitingSebArtifact(profile, 'terminal', env)).toEqual({ ok: false, code: 'SEB_WAITING_ARTIFACT_UNAVAILABLE' })
    mocks.download.mockRejectedValue(new Error('sensitive-storage-detail'))
    expect(await loadWaitingSebArtifact(profile, 'terminal', env)).toEqual({ ok: false, code: 'SEB_WAITING_STORAGE_FAILED' })
    const encrypted = Buffer.from('synthetic-x509-ciphertext-not-plaintext')
    const encryptedEnv = environment(encrypted)
    mocks.createAdminClient.mockReturnValue(adminWith({
      assignment_seb_config_releases: { data: releaseRow(encrypted, { security_mode: 'x509_encrypted' }), error: null },
    }).admin)
    stored(encrypted)
    expect(await loadWaitingSebArtifact(readWaitingSebProfile(metadata(encrypted), encryptedEnv)!, 'initial', encryptedEnv))
      .toEqual({ ok: false, code: 'SEB_WAITING_PROFILE_INVALID' })
  })
})
