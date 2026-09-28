import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  download: vi.fn(),
  createSignedUrl: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import {
  assignmentSebArtifactPath,
  assignmentSebSecurityModeAllowed,
  createAssignmentSebSignedDownloadUrl,
  readCurrentAssignmentSebRelease,
  registerAssignmentSebRelease,
} from '@/lib/seb-assignment-release.server'

const ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000003'
const ORG_ID = '10000000-0000-4000-8000-000000000001'
const OWNER_ID = '20000000-0000-4000-8000-000000000002'
const REVISION = 2
const BYTES = Buffer.from('assignment-specific-seb-artifact')
const ARTIFACT_HASH = createHash('sha256').update(BYTES).digest('hex')
const ARTIFACT_PATH = `assignments/${ASSIGNMENT_ID}/r${REVISION}/${ARTIFACT_HASH}.seb`
const RELEASE_ID = `asr-${ASSIGNMENT_ID.replaceAll('-', '')}-r${REVISION}-${ARTIFACT_HASH.slice(0, 16)}`
const CONFIG_KEY = 'b'.repeat(64)
const BROWSER_KEYS = [{
  platform: 'windows' as const,
  versionString: '3.10.2',
  buildNumber: '920',
  key: 'c'.repeat(64),
}]
const CREATED_AT = '2026-09-23T10:00:00.000Z'

function releaseRow(overrides: Record<string, unknown> = {}) {
  return {
    assignment_id: ASSIGNMENT_ID,
    revision: REVISION,
    org_id: ORG_ID,
    owner_id: OWNER_ID,
    release_id: RELEASE_ID,
    artifact_storage_path: ARTIFACT_PATH,
    artifact_sha256: ARTIFACT_HASH,
    artifact_size_bytes: BYTES.length,
    config_key: CONFIG_KEY,
    browser_exam_keys: BROWSER_KEYS,
    security_mode: 'x509_encrypted',
    created_at: CREATED_AT,
    ...overrides,
  }
}

function rpcRow(overrides: Record<string, unknown> = {}) {
  const { config_key: _configKey, browser_exam_keys: _browserKeys, ...safe } = releaseRow()
  return {
    ...safe,
    browser_exam_key_count: 1,
    ...overrides,
  }
}

type Result = { data: unknown; error: unknown }

function adminWith(overrides: Partial<Record<string, Result>> = {}) {
  const results: Record<string, Result> = {
    assignment_seb_config_revisions: { data: { revision: REVISION }, error: null },
    assignment_seb_config_releases: { data: releaseRow(), error: null },
    ...overrides,
  }
  return {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => results[table]),
      }
      return builder
    }),
    storage: {
      from: vi.fn(() => ({
        download: mocks.download,
        createSignedUrl: mocks.createSignedUrl,
      })),
    },
    rpc: mocks.rpc,
  }
}

describe('assignment-specific SEB artifact release boundary', () => {
  beforeEach(() => {
    mocks.download.mockReset().mockResolvedValue({
      data: new Blob([BYTES]),
      error: null,
    })
    mocks.createSignedUrl.mockReset().mockResolvedValue({
      data: { signedUrl: 'https://storage.example/signed-artifact' },
      error: null,
    })
    mocks.rpc.mockReset().mockResolvedValue({ data: [rpcRow()], error: null })
    mocks.createAdminClient.mockReset().mockReturnValue(adminWith())
  })

  it('allows plaintext artifacts only behind the exact isolated Staging opt-in', () => {
    expect(assignmentSebSecurityModeAllowed('x509_encrypted', {})).toBe(true)
    expect(assignmentSebSecurityModeAllowed('test_plaintext', {
      SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS: 'true',
      NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    })).toBe(true)
    expect(assignmentSebSecurityModeAllowed('test_plaintext', {
      SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS: 'true',
      NEXT_PUBLIC_SITE_URL: 'https://korkru.com',
    })).toBe(false)
    expect(assignmentSebSecurityModeAllowed('test_plaintext', {
      NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    })).toBe(false)
  })

  it('loads only the release for the newest password revision', async () => {
    await expect(readCurrentAssignmentSebRelease(ASSIGNMENT_ID)).resolves.toMatchObject({
      assignmentId: ASSIGNMENT_ID,
      revision: REVISION,
      releaseId: RELEASE_ID,
      browserExamKeyCount: 1,
    })

    mocks.createAdminClient.mockReturnValue(adminWith({
      assignment_seb_config_releases: { data: releaseRow({ revision: 1 }), error: null },
    }))
    await expect(readCurrentAssignmentSebRelease(ASSIGNMENT_ID)).resolves.toBeNull()
  })

  it('builds one canonical private path and one short-lived signed download', async () => {
    expect(assignmentSebArtifactPath(ASSIGNMENT_ID, REVISION, ARTIFACT_HASH)).toBe(ARTIFACT_PATH)
    expect(assignmentSebArtifactPath(ASSIGNMENT_ID, 0, ARTIFACT_HASH)).toBe('')

    const release = await readCurrentAssignmentSebRelease(ASSIGNMENT_ID)
    expect(release).not.toBeNull()
    await expect(createAssignmentSebSignedDownloadUrl(release!)).resolves.toBe(
      'https://storage.example/signed-artifact',
    )
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(ARTIFACT_PATH, 300, {
      download: `korkru-seb-${ASSIGNMENT_ID}-r${REVISION}.seb`,
    })
  })

  it('verifies the exact stored bytes before registering and returns no CK/BEK', async () => {
    const result = await registerAssignmentSebRelease({
      assignmentId: ASSIGNMENT_ID,
      revision: REVISION,
      artifactPath: ARTIFACT_PATH,
      artifactSha256: ARTIFACT_HASH,
      artifactSizeBytes: BYTES.length,
      configKey: CONFIG_KEY,
      browserExamKeys: BROWSER_KEYS,
      securityMode: 'x509_encrypted',
    })

    expect(mocks.rpc).toHaveBeenCalledWith('register_assignment_seb_config_release', {
      p_assignment_id: ASSIGNMENT_ID,
      p_revision: REVISION,
      p_artifact_storage_path: ARTIFACT_PATH,
      p_artifact_sha256: ARTIFACT_HASH,
      p_artifact_size_bytes: BYTES.length,
      p_config_key: CONFIG_KEY,
      p_browser_exam_keys: BROWSER_KEYS,
      p_security_mode: 'x509_encrypted',
    })
    expect(result).toMatchObject({ releaseId: RELEASE_ID, revision: REVISION })
    expect(result).not.toHaveProperty('configKey')
    expect(result).not.toHaveProperty('browserExamKeys')
    expect(JSON.stringify(result)).not.toContain(CONFIG_KEY)
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('rejects byte mismatch, malformed registry, and blocked plaintext before persistence', async () => {
    const base = {
      assignmentId: ASSIGNMENT_ID,
      revision: REVISION,
      artifactPath: ARTIFACT_PATH,
      artifactSha256: ARTIFACT_HASH,
      artifactSizeBytes: BYTES.length,
      configKey: CONFIG_KEY,
      browserExamKeys: BROWSER_KEYS,
      securityMode: 'x509_encrypted' as const,
    }

    mocks.download.mockResolvedValueOnce({ data: new Blob(['wrong']), error: null })
    await expect(registerAssignmentSebRelease(base)).rejects.toThrow(
      'SEB_ASSIGNMENT_RELEASE_ARTIFACT_MISMATCH',
    )
    expect(mocks.rpc).not.toHaveBeenCalled()

    await expect(registerAssignmentSebRelease({
      ...base,
      browserExamKeys: [...BROWSER_KEYS, { ...BROWSER_KEYS[0] }],
    })).rejects.toThrow('SEB_ASSIGNMENT_RELEASE_INVALID')

    await expect(registerAssignmentSebRelease({
      ...base,
      securityMode: 'test_plaintext',
    })).rejects.toThrow('SEB_ASSIGNMENT_RELEASE_SECURITY_MODE_BLOCKED')
  })
})
