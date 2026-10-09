import { describe, expect, it } from 'vitest'
import type { AssignmentSebReleaseMetadata } from '@/lib/seb-assignment-release.server'
import {
  WAITING_SEB_MAX_ARTIFACT_BYTES,
  WAITING_SEB_RELEASE_PROFILE_ID,
  parseWaitingSebReleaseManifest,
  readWaitingSebProfile,
  waitingSebFeatureEnabled,
} from '@/lib/seb-waiting-release-policy'

const ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000003'
const ORIGIN = 'https://korkru-seb-uat.vercel.app'
const INITIAL_SHA = 'a'.repeat(64)
const TERMINAL_SHA = 'b'.repeat(64)
const RELEASE_ID = `asr-${ASSIGNMENT_ID.replaceAll('-', '')}-r3-${INITIAL_SHA.slice(0, 16)}`

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    assignmentId: ASSIGNMENT_ID, revision: 3, releaseId: RELEASE_ID,
    origin: ORIGIN, profileId: WAITING_SEB_RELEASE_PROFILE_ID,
    initial: { sha256: INITIAL_SHA, sizeBytes: 123, path: `assignments/${ASSIGNMENT_ID}/r3/${INITIAL_SHA}.seb` },
    terminal: { sha256: TERMINAL_SHA, sizeBytes: 456, path: `assignments/${ASSIGNMENT_ID}/r3/${TERMINAL_SHA}.seb` },
    ...overrides,
  }
}

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    SEB_EXAM_WAITING_ENABLED: 'true',
    SEB_EXAM_WAITING_RELEASES: JSON.stringify([candidate()]),
    KORKRU_DEPLOYMENT_ENV: 'staging', VERCEL_ENV: 'production',
    EXAM_QA_ENVIRONMENT: 'staging', SEB_UAT_ISOLATED_PROJECT: 'true',
    NEXT_PUBLIC_SITE_URL: ORIGIN,
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'korkru-seb-uat.vercel.app',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic-staging.supabase.co',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://synthetic-production.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-fixture-not-real',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-fixture-not-real',
    ...overrides,
  }
}

function release(overrides: Partial<AssignmentSebReleaseMetadata> = {}): AssignmentSebReleaseMetadata {
  const source = candidate()
  return {
    assignmentId: ASSIGNMENT_ID, revision: 3, releaseId: RELEASE_ID,
    orgId: '10000000-0000-4000-8000-000000000001', ownerId: '20000000-0000-4000-8000-000000000002',
    artifactSha256: source.initial.sha256, artifactSizeBytes: source.initial.sizeBytes,
    artifactPath: source.initial.path, securityMode: 'test_plaintext', browserExamKeyCount: 1,
    createdAt: '2026-10-09T01:00:00.000Z', ...overrides,
  }
}

describe('experimental waiting-room release manifest', () => {
  it('returns only deeply frozen exact scope and byte references, with empty auth origins by default', () => {
    const profiles = parseWaitingSebReleaseManifest(JSON.stringify([candidate()]))!
    expect(profiles[0]).toEqual({ ...candidate(), authOrigins: [] })
    expect(Object.isFrozen(profiles)).toBe(true)
    expect(Object.isFrozen(profiles[0])).toBe(true)
    expect(Object.isFrozen(profiles[0].initial)).toBe(true)
    expect(Object.isFrozen(profiles[0].authOrigins)).toBe(true)
    expect(parseWaitingSebReleaseManifest('[]')).toEqual([])
    expect(JSON.stringify(profiles)).not.toMatch(/password|configKey|browserExamKeys/i)
  })

  it.each([
    { assignmentId: ASSIGNMENT_ID.toUpperCase().replace('3000', 'ABCD') },
    { assignmentId: '../exam' }, { revision: 0 }, { revision: 2_147_483_647 }, { revision: 3.5 },
    { releaseId: 'asr-unregistered' }, { origin: 'https://korkru.com' }, { origin: `${ORIGIN}/` },
    { profileId: 'legacy-r2' }, { configKey: 'secret' }, { hashedQuitPassword: 'secret' },
    { authOrigins: null }, { authOrigins: ['https://*.example.test'] },
    { authOrigins: ['https://provider.test/auth/v1'] }, { authOrigins: ['https://user:pass@provider.test'] },
    { authOrigins: [ORIGIN] }, { authOrigins: ['https://provider.test', 'https://provider.test'] },
    { authOrigins: Array.from({ length: 9 }, (_, i) => `https://provider${i}.test`) },
  ])('rejects unsupported or ambiguous profile fields: %j', overrides => {
    expect(parseWaitingSebReleaseManifest(JSON.stringify([candidate(overrides)]))).toBeNull()
  })

  it.each([
    { sha256: INITIAL_SHA.toUpperCase() }, { sha256: 'a'.repeat(63) }, { sizeBytes: 0 },
    { sizeBytes: WAITING_SEB_MAX_ARTIFACT_BYTES + 1 }, { sizeBytes: '123' },
    { sizeBytes: 1.5 }, { path: 'assignments/other/r3/file.seb' },
    { path: `assignments/${ASSIGNMENT_ID}/r3/../${INITIAL_SHA}.seb` }, { bucket: 'public' },
  ])('rejects malformed byte reference: %j', overrides => {
    expect(parseWaitingSebReleaseManifest(JSON.stringify([candidate({
      initial: { ...candidate().initial, ...overrides },
    })]))).toBeNull()
  })

  it('rejects identical phases, duplicate scopes, invalid JSON and duplicate escaped keys', () => {
    expect(parseWaitingSebReleaseManifest(JSON.stringify([candidate({ terminal: candidate().initial })]))).toBeNull()
    expect(parseWaitingSebReleaseManifest(JSON.stringify([candidate(), candidate()]))).toBeNull()
    expect(parseWaitingSebReleaseManifest(JSON.stringify([candidate(), candidate({ origin: 'https://staging.korkru.com' })]))).toBeNull()
    expect(parseWaitingSebReleaseManifest(JSON.stringify(Array(65).fill(candidate())))).toBeNull()
    for (const raw of ['', '[', 'null', '{}', ' '.repeat(65 * 1024)]) {
      expect(parseWaitingSebReleaseManifest(raw)).toBeNull()
    }
    const raw = JSON.stringify([candidate()])
    expect(parseWaitingSebReleaseManifest(raw.replace('"revision":3', '"revision":1,"revision":3'))).toBeNull()
    expect(parseWaitingSebReleaseManifest(raw.replace('"revision":3', '"rev\\u0069sion":1,"revision":3'))).toBeNull()
    expect(parseWaitingSebReleaseManifest(raw.replace('"sizeBytes":123', '"sizeBytes":1,"sizeBytes":123'))).toBeNull()
  })

  it('records only explicit canonical provider origins, never blanket provider access', () => {
    const profiles = parseWaitingSebReleaseManifest(JSON.stringify([candidate({
      authOrigins: ['https://provider-b.test', 'https://provider-a.test'],
    })]))!
    expect(profiles[0].authOrigins).toEqual(['https://provider-a.test', 'https://provider-b.test'])
  })
})

describe('waiting-room isolated Staging feature gate', () => {
  it('requires the exact flag, ready staging deployment and exact configured origin', () => {
    expect(waitingSebFeatureEnabled(environment())).toBe(true)
    expect(waitingSebFeatureEnabled(environment({
      NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com', VERCEL_ENV: 'preview',
    }))).toBe(true)
    for (const override of [
      { SEB_EXAM_WAITING_ENABLED: undefined }, { SEB_EXAM_WAITING_ENABLED: 'TRUE' },
      { SEB_EXAM_WAITING_ENABLED: ' true' }, { KORKRU_DEPLOYMENT_ENV: 'production' },
      { KORKRU_DEPLOYMENT_ENV: 'local' }, { SEB_UAT_ISOLATED_PROJECT: 'false' },
      { EXAM_QA_ENVIRONMENT: 'production' }, { NEXT_PUBLIC_SITE_URL: 'https://korkru.com' },
      { NEXT_PUBLIC_SITE_URL: `${ORIGIN}/` }, { SUPABASE_SERVICE_ROLE_KEY: '' },
      { EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://synthetic-staging.supabase.co' },
    ]) expect(waitingSebFeatureEnabled(environment(override))).toBe(false)
  })

  it('matches the exact registered initial artifact; malformed or partial manifests never enable a release', () => {
    expect(readWaitingSebProfile(release(), environment())).toMatchObject({ releaseId: RELEASE_ID })
    for (const override of [
      { assignmentId: '40000000-0000-4000-8000-000000000004' }, { revision: 4 },
      { releaseId: `${RELEASE_ID}-fake` }, { artifactPath: 'public/file.seb' },
      { artifactSha256: TERMINAL_SHA }, { artifactSizeBytes: 122 },
    ]) expect(readWaitingSebProfile(release(override), environment())).toBeNull()
    expect(readWaitingSebProfile(release(), environment({ SEB_EXAM_WAITING_RELEASES: '[' }))).toBeNull()
    expect(readWaitingSebProfile(release(), environment({ SEB_EXAM_WAITING_ENABLED: 'false' }))).toBeNull()
    expect(readWaitingSebProfile(release(), environment({ NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com', VERCEL_ENV: 'preview' }))).toBeNull()
  })
})
