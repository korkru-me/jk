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

describe('next exam UAT step', () => {
  it('repairs malformed evidence before directing a test', () => {
    expect(nextExamUatStep({
      stagingReady: true,
      uatManifest: {},
      sebManifest: sebManifest(),
    }).id).toBe('repair-uat-evidence')
  })

  it('requires isolated staging before any external UAT', () => {
    expect(nextExamUatStep({
      stagingReady: false,
      uatManifest: uatManifest('pending'),
      sebManifest: sebManifest(false),
    }).id).toBe('prepare-staging')
  })

  it('walks responsive suites in a stable device order', () => {
    const manifest = uatManifest('pending')
    expect(nextExamUatStep({ stagingReady: true, uatManifest: manifest, sebManifest: sebManifest(false) }).id)
      .toBe('iphone-responsive')
    manifest.suites[0].status = 'passed'
    manifest.suites[0].testedAt = '2026-09-20T10:00:00.000Z'
    manifest.suites[0].testedVersion = 'ios-tested'
    expect(nextExamUatStep({ stagingReady: true, uatManifest: manifest, sebManifest: sebManifest(false) }).id)
      .toBe('ipad-responsive')
  })

  it('places authenticated and recovery drills before native SEB release gates', () => {
    const manifest = uatManifest()
    manifest.suites.find(row => row.id === 'authenticated-exam').status = 'pending'
    manifest.suites.find(row => row.id === 'authenticated-exam').testedAt = null
    manifest.suites.find(row => row.id === 'authenticated-exam').testedVersion = 'record during final UAT'
    expect(nextExamUatStep({ stagingReady: true, uatManifest: manifest, sebManifest: sebManifest(false) }).id)
      .toBe('authenticated-exam')

    manifest.suites.find(row => row.id === 'authenticated-exam').status = 'passed'
    manifest.suites.find(row => row.id === 'authenticated-exam').testedAt = '2026-09-20T10:04:00.000Z'
    manifest.suites.find(row => row.id === 'authenticated-exam').testedVersion = 'staging-build-123'
    manifest.suites.find(row => row.id === 'recovery-proctor').status = 'pending'
    manifest.suites.find(row => row.id === 'recovery-proctor').testedAt = null
    manifest.suites.find(row => row.id === 'recovery-proctor').testedVersion = 'record during final UAT'
    expect(nextExamUatStep({ stagingReady: true, uatManifest: manifest, sebManifest: sebManifest(false) }).id)
      .toBe('recovery-proctor')
  })

  it('walks SEB platforms before the final cleanup', () => {
    const manifest = uatManifest()
    manifest.suites.find(row => row.id === 'qa-data-cleanup').status = 'pending'
    manifest.suites.find(row => row.id === 'qa-data-cleanup').testedAt = null
    manifest.suites.find(row => row.id === 'qa-data-cleanup').testedVersion = 'record during final UAT'
    expect(nextExamUatStep({ stagingReady: true, uatManifest: manifest, sebManifest: sebManifest(false) }).id)
      .toBe('seb-macos')
    expect(nextExamUatStep({ stagingReady: true, uatManifest: manifest, sebManifest: sebManifest() }).id)
      .toBe('qa-data-cleanup')
  })

  it('reports completion only after all evidence is ready', () => {
    const result = nextExamUatStep({
      stagingReady: true,
      uatManifest: uatManifest(),
      sebManifest: sebManifest(),
    })
    expect(result.complete).toBe(true)
    expect(result.id).toBe('complete')
  })
})
