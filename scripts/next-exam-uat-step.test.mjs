import { describe, expect, it } from 'vitest'
import {
  inspectNextExamUatStagingEnvironment,
  nextExamUatStep,
} from './next-exam-uat-step-core.mjs'

const UAT_IDS = [
  ['iphone-responsive', 'iPhone responsive UI'],
  ['ipad-responsive', 'iPad responsive UI'],
  ['mac-responsive', 'Mac responsive UI'],
  ['windows-responsive', 'Windows responsive UI'],
  ['authenticated-exam', 'Authenticated staging exam'],
  ['recovery-proctor', 'Recovery and proctor drill'],
  ['qa-data-cleanup', 'QA data cleanup'],
]

function uatManifest(status = 'passed') {
  return {
    schemaVersion: 1,
    runId: 'release-2026-09',
    suites: UAT_IDS.map(([id, label], index) => ({
      id,
      label,
      status,
      testedAt: status === 'passed'
        ? new Date(Date.UTC(2026, 8, 20, 10, index)).toISOString()
        : null,
      testedVersion: status === 'passed' ? 'staging-build-123' : 'record during final UAT',
    })),
  }
}

function sebManifest(ready = true) {
  return {
    schemaVersion: 1,
    configId: 'production-v1',
    platforms: ['macos', 'ipados', 'ios', 'windows'].map(id => ({
      id,
      label: id,
      osVersion: 'tested-os',
      sebVersion: 'tested-seb',
      nativeCore: 'passed',
      productionBek: ready ? 'registered' : 'unverified',
      stagingMockExam: ready ? 'passed' : 'pending',
      physicalUat: ready ? 'passed' : 'pending',
    })),
  }
}

function candidateManifest(ready = true) {
  return {
    schemaVersion: 1,
    candidateId: 'release-2026-09',
    sourceRevision: ready ? 'a'.repeat(40) : 'pending',
    stagingBuild: ready ? 'staging-build-123' : 'pending',
    sebConfigId: 'production-v1',
    lockedAt: ready ? '2026-09-20T09:00:00.000Z' : null,
  }
}

function context(overrides = {}) {
  return {
    stagingReady: true,
    candidateManifest: candidateManifest(),
    uatManifest: uatManifest(),
    sebManifest: sebManifest(),
    ...overrides,
  }
}

function stagingEnvironment() {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    VERCEL_ENV: 'preview',
    EXAM_QA_ENVIRONMENT: 'staging',
    NEXT_PUBLIC_SITE_URL: 'https://staging.example.test',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://www.example.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://staging-project.supabase.co',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-long-enough-for-qa',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-long-enough-for-qa',
  }
}

describe('next exam UAT staging environment', () => {
  it('accepts injected staging variables when .env.qa.local is absent', () => {
    expect(inspectNextExamUatStagingEnvironment('', stagingEnvironment()).ready).toBe(true)
  })

  it('fails closed when an env file is malformed', () => {
    expect(inspectNextExamUatStagingEnvironment('BROKEN LINE', stagingEnvironment()).ready).toBe(false)
  })
})

describe('next exam UAT step', () => {
  it('repairs malformed evidence before directing a test', () => {
    expect(nextExamUatStep(context({
      uatManifest: {},
    })).id).toBe('repair-uat-evidence')
  })

  it('requires isolated staging before any external UAT', () => {
    expect(nextExamUatStep(context({
      stagingReady: false,
      candidateManifest: candidateManifest(false),
      uatManifest: uatManifest('pending'),
      sebManifest: sebManifest(false),
    })).id).toBe('prepare-staging')
  })

  it('locks the release candidate after staging and before device UAT', () => {
    expect(nextExamUatStep(context({
      candidateManifest: candidateManifest(false),
      uatManifest: uatManifest('pending'),
      sebManifest: sebManifest(false),
    }))).toEqual(expect.objectContaining({ id: 'lock-release-candidate' }))
  })

  it('walks responsive suites in a stable device order', () => {
    const manifest = uatManifest('pending')
    expect(nextExamUatStep(context({ uatManifest: manifest, sebManifest: sebManifest(false) })).id)
      .toBe('iphone-responsive')
    manifest.suites[0].status = 'passed'
    manifest.suites[0].testedAt = '2026-09-20T10:00:00.000Z'
    manifest.suites[0].testedVersion = 'ios-tested'
    expect(nextExamUatStep(context({ uatManifest: manifest, sebManifest: sebManifest(false) })).id)
      .toBe('ipad-responsive')
  })

  it('places authenticated and recovery drills before native SEB release gates', () => {
    const manifest = uatManifest()
    manifest.suites.find(row => row.id === 'authenticated-exam').status = 'pending'
    manifest.suites.find(row => row.id === 'authenticated-exam').testedAt = null
    manifest.suites.find(row => row.id === 'authenticated-exam').testedVersion = 'record during final UAT'
    expect(nextExamUatStep(context({ uatManifest: manifest, sebManifest: sebManifest(false) })).id)
      .toBe('authenticated-exam')

    manifest.suites.find(row => row.id === 'authenticated-exam').status = 'passed'
    manifest.suites.find(row => row.id === 'authenticated-exam').testedAt = '2026-09-20T10:04:00.000Z'
    manifest.suites.find(row => row.id === 'authenticated-exam').testedVersion = 'staging-build-123'
    manifest.suites.find(row => row.id === 'recovery-proctor').status = 'pending'
    manifest.suites.find(row => row.id === 'recovery-proctor').testedAt = null
    manifest.suites.find(row => row.id === 'recovery-proctor').testedVersion = 'record during final UAT'
    expect(nextExamUatStep(context({ uatManifest: manifest, sebManifest: sebManifest(false) })).id)
      .toBe('recovery-proctor')
  })

  it('walks SEB platforms before the final cleanup', () => {
    const manifest = uatManifest()
    manifest.suites.find(row => row.id === 'qa-data-cleanup').status = 'pending'
    manifest.suites.find(row => row.id === 'qa-data-cleanup').testedAt = null
    manifest.suites.find(row => row.id === 'qa-data-cleanup').testedVersion = 'record during final UAT'
    expect(nextExamUatStep(context({ uatManifest: manifest, sebManifest: sebManifest(false) })).id)
      .toBe('seb-macos')
    expect(nextExamUatStep(context({ uatManifest: manifest, sebManifest: sebManifest() })).id)
      .toBe('qa-data-cleanup')
  })

  it('reports completion only after all evidence is ready', () => {
    const result = nextExamUatStep(context())
    expect(result.complete).toBe(true)
    expect(result.id).toBe('complete')
  })
})
