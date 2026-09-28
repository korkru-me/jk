import { describe, expect, it, vi } from 'vitest'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  assignmentSebArtifactIdentity,
  enrollAssignmentSebStagingArtifact,
  inspectAssignmentSebOperatorEnvironment,
  inspectAssignmentSebPlaintextArtifact,
  inspectAssignmentSebPlaintextTemplate,
  materializeAssignmentSebPlaintextSeed,
  parseNativeSebEvidence,
  parseOperatorArguments,
} from './seb-assignment-artifact-core.mjs'

const ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000003'
const REVISION = 2
const OLD_HASH = 'a'.repeat(64)
const CURRENT_HASH = 'b'.repeat(64)
const CONFIG_KEY = 'c'.repeat(64)
const BROWSER_KEY = 'd'.repeat(64)

function validEnvironment(overrides = {}) {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://www.korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'staging-anon-key-long-enough',
    SUPABASE_SERVICE_ROLE_KEY: 'staging-service-role-long-enough',
    SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS: 'true',
    ...overrides,
  }
}

function plist({ quitHash = OLD_HASH, sendKey = false, startUrl, quitUrl } = {}) {
  return Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<plist version="1.0"><dict>
  <key>startURL</key><string>${startUrl ?? 'https://staging.korkru.com/assignments'}</string>
  <key>quitURL</key><string>${quitUrl ?? 'https://staging.korkru.com/exam/quit'}</string>
  <key>sebConfigPurpose</key><integer>0</integer>
  <key>allowQuit</key><true />
  <key>downloadAndOpenSebConfig</key><false />
  <key>examSessionReconfigureAllow</key><false />
  <key>hashedAdminPassword</key><string>${'e'.repeat(64)}</string>
  <key>hashedQuitPassword</key><string>${quitHash}</string>
  <key>sendBrowserExamKey</key><${sendKey ? 'true' : 'false'} />
  <key>examKeySalt</key><data>${Buffer.alloc(32, 1).toString('base64')}</data>
  <key>browserExamKey</key><string />
</dict></plist>`)
}

function evidence(overrides = {}) {
  return {
    schemaVersion: 1,
    assignmentId: ASSIGNMENT_ID,
    revision: REVISION,
    configKey: CONFIG_KEY,
    browserExamKeys: [{
      platform: 'windows',
      versionString: '3.10.2',
      buildNumber: '920',
      key: BROWSER_KEY,
    }],
    ...overrides,
  }
}

describe('assignment SEB artifact operator core', () => {
  it('allows only the exact isolated Staging environment and explicit plaintext gate', () => {
    expect(inspectAssignmentSebOperatorEnvironment(validEnvironment()).ready).toBe(true)
    expect(inspectAssignmentSebOperatorEnvironment(validEnvironment({
      KORKRU_DEPLOYMENT_ENV: 'production',
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'https://www.korkru.com',
    })).ready).toBe(false)
    expect(inspectAssignmentSebOperatorEnvironment(validEnvironment({
      SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS: 'false',
    })).ready).toBe(false)
    expect(inspectAssignmentSebOperatorEnvironment(validEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: 'https://production-project.supabase.co',
      EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://decoy-project.supabase.co',
    })).ready).toBe(false)
  })

  it('prepares a revision-bound seed without calculating CK or BEK', () => {
    const bytes = materializeAssignmentSebPlaintextSeed(
      plist(),
      CURRENT_HASH,
      () => Buffer.alloc(32, 7),
    )
    expect(() => inspectAssignmentSebPlaintextArtifact(bytes, CURRENT_HASH)).not.toThrow()
    const xml = bytes.toString('utf8')
    expect(xml).toContain(`<string>${CURRENT_HASH}</string>`)
    expect(xml).toContain('<key>sendBrowserExamKey</key><true />')
    expect(xml).toContain(`<data>${Buffer.alloc(32, 7).toString('base64')}</data>`)
    expect(xml).toContain('<key>browserExamKey</key><string></string>')
    expect(xml).not.toContain(CONFIG_KEY)
    expect(xml).not.toContain(BROWSER_KEY)
  })

  it('preserves the passwordless gzip container used by native SEB', () => {
    const bytes = materializeAssignmentSebPlaintextSeed(
      gzipSync(plist()),
      CURRENT_HASH,
      () => Buffer.alloc(32, 8),
    )
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))
    expect(() => inspectAssignmentSebPlaintextArtifact(bytes, CURRENT_HASH)).not.toThrow()
    expect(gunzipSync(bytes).toString('utf8')).toContain(`<string>${CURRENT_HASH}</string>`)
  })

  it('unwraps and preserves the standard outer-gzip plnd inner-gzip container', () => {
    const template = gzipSync(Buffer.concat([Buffer.from('plnd'), gzipSync(plist())]))
    const bytes = materializeAssignmentSebPlaintextSeed(
      template,
      CURRENT_HASH,
      () => Buffer.alloc(32, 10),
    )
    const outer = gunzipSync(bytes)
    expect(outer.subarray(0, 4).toString('utf8')).toBe('plnd')
    expect(gunzipSync(outer.subarray(4)).toString('utf8')).toContain(
      `<string>${CURRENT_HASH}</string>`,
    )
    expect(() => inspectAssignmentSebPlaintextArtifact(bytes, CURRENT_HASH)).not.toThrow()
  })

  it('rejects malformed plnd wrappers and bounded decompression bombs', () => {
    expect(() => inspectAssignmentSebPlaintextTemplate(
      gzipSync(Buffer.from('plnd-not-an-inner-gzip')),
    )).toThrowError('SEB_ARTIFACT_NOT_PLAINTEXT_XML')
    expect(() => inspectAssignmentSebPlaintextTemplate(
      gzipSync(Buffer.alloc(2 * 1024 * 1024 + 1, 0x20)),
    )).toThrowError('SEB_ARTIFACT_NOT_PLAINTEXT_XML')
  })

  it('rejects a stale revision, disabled key sending, or non-canonical URLs', () => {
    expect(() => inspectAssignmentSebPlaintextArtifact(plist({ sendKey: true }), CURRENT_HASH))
      .toThrowError('SEB_ARTIFACT_REVISION_MISMATCH')
    expect(() => inspectAssignmentSebPlaintextArtifact(plist({ quitHash: CURRENT_HASH }), CURRENT_HASH))
      .toThrowError('SEB_ARTIFACT_POLICY_INVALID')
    expect(() => materializeAssignmentSebPlaintextSeed(
      plist({ startUrl: 'https://staging.korkru.com/assignments?wrong=1' }),
      CURRENT_HASH,
    )).toThrowError('SEB_ARTIFACT_POLICY_INVALID')
  })

  it('rejects comment-only policy decoys and identical admin/quit passwords', () => {
    const commentDecoy = Buffer.from(`<?xml version="1.0"?>
<plist version="1.0"><dict><!--
  <key>startURL</key><string>https://staging.korkru.com/assignments</string>
  <key>quitURL</key><string>https://staging.korkru.com/exam/quit</string>
  <key>sebConfigPurpose</key><integer>0</integer>
  <key>allowQuit</key><true />
  <key>downloadAndOpenSebConfig</key><false />
  <key>examSessionReconfigureAllow</key><false />
  <key>hashedAdminPassword</key><string>${'e'.repeat(64)}</string>
  <key>hashedQuitPassword</key><string>${CURRENT_HASH}</string>
  <key>sendBrowserExamKey</key><true />
  <key>examKeySalt</key><data>${Buffer.alloc(32, 1).toString('base64')}</data>
  <key>browserExamKey</key><string></string>
--></dict></plist>`)
    expect(() => inspectAssignmentSebPlaintextArtifact(commentDecoy, CURRENT_HASH))
      .toThrowError('SEB_ARTIFACT_POLICY_INVALID')
    expect(() => inspectAssignmentSebPlaintextArtifact(
      plist({ quitHash: 'e'.repeat(64), sendKey: true }),
      'e'.repeat(64),
    )).toThrowError('SEB_ARTIFACT_REVISION_MISMATCH')
  })

  it('accepts only native evidence for the exact Windows build and target revision', () => {
    expect(parseNativeSebEvidence(evidence(), ASSIGNMENT_ID, REVISION)).toEqual({
      configKey: CONFIG_KEY,
      browserExamKeys: [{
        platform: 'windows',
        versionString: '3.10.2',
        buildNumber: '920',
        key: BROWSER_KEY,
      }],
    })
    expect(() => parseNativeSebEvidence(evidence({ revision: 3 }), ASSIGNMENT_ID, REVISION))
      .toThrowError('SEB_NATIVE_EVIDENCE_INVALID')
    const wrongBuild = evidence()
    wrongBuild.browserExamKeys[0].buildNumber = '921'
    expect(() => parseNativeSebEvidence(wrongBuild, ASSIGNMENT_ID, REVISION))
      .toThrowError('SEB_NATIVE_EVIDENCE_INVALID')
  })

  it('defaults commands to dry-run and provides no CK/BEK argv option', () => {
    const parsed = parseOperatorArguments([
      '--assignment', ASSIGNMENT_ID,
      '--revision', String(REVISION),
      '--artifact', 'final.seb',
    ], 'enroll')
    expect(parsed.apply).toBe(false)
    expect(() => parseOperatorArguments([
      '--assignment', ASSIGNMENT_ID,
      '--revision', String(REVISION),
      '--artifact', 'final.seb',
      '--config-key', CONFIG_KEY,
    ], 'enroll')).toThrowError('SEB_OPERATOR_ARGUMENTS_INVALID')
  })

  it('uploads immutable bytes, verifies the download, registers once, and returns no CK/BEK', async () => {
    const artifactBytes = materializeAssignmentSebPlaintextSeed(
      plist(),
      CURRENT_HASH,
      () => Buffer.alloc(32, 9),
    )
    const identity = assignmentSebArtifactIdentity(artifactBytes, ASSIGNMENT_ID, REVISION)
    const upload = vi.fn().mockResolvedValue({ data: {}, error: null })
    const download = vi.fn().mockResolvedValue({ data: new Blob([artifactBytes]), error: null })
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        assignment_id: ASSIGNMENT_ID,
        revision: REVISION,
        release_id: 'release-id',
        artifact_storage_path: identity.storagePath,
        artifact_sha256: identity.sha256,
        artifact_size_bytes: identity.sizeBytes,
        security_mode: 'test_plaintext',
        browser_exam_key_count: 1,
        created_at: '2026-09-23T10:00:00.000Z',
      }],
      error: null,
    })
    const admin = {
      storage: { from: vi.fn(() => ({ upload, download })) },
      rpc,
    }

    const result = await enrollAssignmentSebStagingArtifact({
      admin,
      context: {
        assignmentId: ASSIGNMENT_ID,
        revision: REVISION,
        hashedQuitPassword: CURRENT_HASH,
        existingRelease: null,
      },
      artifactBytes,
      evidence: JSON.stringify(evidence()),
      environment: validEnvironment(),
    })

    expect(upload).toHaveBeenCalledWith(identity.storagePath, artifactBytes, {
      contentType: 'application/seb',
      upsert: false,
    })
    expect(download).toHaveBeenCalledWith(identity.storagePath)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(result.release).toMatchObject({ assignmentId: ASSIGNMENT_ID, revision: REVISION })
    expect(JSON.stringify(result)).not.toContain(CONFIG_KEY)
    expect(JSON.stringify(result)).not.toContain(BROWSER_KEY)
  })
})
