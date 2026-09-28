import { describe, expect, it } from 'vitest'
import { nextExamUatStep } from './next-exam-uat-step-core.mjs'

const UAT_IDS = [
  ['iphone-responsive', 'iPhone responsive UI'],
  ['ipad-responsive', 'iPad responsive UI'],
  ['mac-responsive', 'Mac responsive UI'],
  ['windows-responsive', 'Windows responsive UI'],
  ['authenticated-exam', 'Authenticated staging exam'],
  ['recovery-proctor', 'Recovery and proctor drill'],
  ['qa-data-cleanup', 'QA data cleanup'],
]
const DIGEST = 'b'.repeat(64)
const CONFIG_REVISION = `production-v1-${DIGEST}`

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
    schemaVersion: 2,
    configId: 'production-v1',
    configRevision: CONFIG_REVISION,
    platforms: ['macos', 'ipados', 'ios', 'windows'].map(id => ({
      id,
      label: id,
      buildId: `${id}-tested-build`,
      nativeCore: 'passed',
      productionBek: ready ? 'registered' : 'unverified',
      stagingMockExam: ready ? 'passed' : 'pending',
      physicalUat: ready ? 'passed' : 'pending',
    })),
  }
}

function sebRegistryManifest(ready = true) {
  return {
    schemaVersion: 1,
    candidateRevision: CONFIG_REVISION,
    productionRevision: null,
    revisions: [{
      revision: CONFIG_REVISION,
      configId: 'production-v1',
      lifecycle: 'candidate',
      artifactPath: '/exam/production-v1.seb',
      artifactSha256: DIGEST,
      canonicalStartUrl: 'https://www.example.test/assignments',
      supersedes: null,
      rollbackRevision: null,
      rollbackStrategy: 'restore-deployment-and-secrets',
      retiredAt: null,
      policy: {
        startUrl: ready ? 'approved' : 'pending',
        navigationFilters: ready ? 'approved' : 'pending',
        uploads: ready ? 'approved' : 'pending',
        quitPassword: ready ? 'approved' : 'pending',
        adminPassword: ready ? 'approved' : 'pending',
        distribution: ready ? 'approved' : 'pending',
      },
      builds: ['macos', 'ipados', 'ios', 'windows'].map(id => ({
        id: `${id}-tested-build`,
        target: id,
        runtimePlatform: id === 'ipados' || id === 'ios' ? 'ios' : id,
        osVersion: 'tested-os',
        versionString: '3.7',
        buildNumber: '100',
        approval: ready ? 'approved' : 'pending',
      })),
    }],
  }
}

function candidateManifest(ready = true) {
  return {
    schemaVersion: 2,
    candidateId: 'release-2026-09',
    sourceRevision: ready ? 'a'.repeat(40) : 'pending',
    stagingBuild: ready ? 'staging-build-123' : 'pending',
    sebConfigId: 'production-v1',
    sebConfigRevision: CONFIG_REVISION,
    lockedAt: ready ? '2026-09-20T09:00:00.000Z' : null,
  }
}

function context(overrides = {}) {
  return {
    stagingReady: true,
    candidateManifest: candidateManifest(),
    uatManifest: uatManifest(),
    sebManifest: sebManifest(),
    sebRegistryManifest: sebRegistryManifest(),
    candidateArtifactSha256: DIGEST,
    ...overrides,
  }
}

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

  it('requires the versioned SEB registry before staging UAT', () => {
    expect(nextExamUatStep(context({
      sebRegistryManifest: sebRegistryManifest(false),
    })).id).toBe('confirm-seb-registry')
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
