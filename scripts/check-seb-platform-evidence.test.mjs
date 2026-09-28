import { describe, expect, it } from 'vitest'
import {
  formatSebPlatformEvidenceReport,
  inspectSebPlatformEvidence,
} from './check-seb-platform-evidence-core.mjs'

function readyManifest() {
  return {
    schemaVersion: 2,
    configId: 'production-v1',
    configRevision: 'production-v1-revision',
    platforms: ['macos', 'ipados', 'ios', 'windows'].map(id => ({
      id,
      label: id,
      buildId: `${id}-tested-build`,
      nativeCore: 'passed',
      productionBek: 'registered',
      stagingMockExam: 'passed',
      physicalUat: 'passed',
    })),
  }
}

function readyRegistry() {
  return {
    candidateRevision: 'production-v1-revision',
    revisions: [{
      revision: 'production-v1-revision',
      configId: 'production-v1',
      builds: ['macos', 'ipados', 'ios', 'windows'].map(id => ({
        id: `${id}-tested-build`,
        target: id,
        approval: 'approved',
      })),
    }],
  }
}

describe('SEB platform evidence', () => {
  it('passes only when every required platform clears every release gate', () => {
    expect(inspectSebPlatformEvidence(readyManifest(), {
      releaseRegistry: readyRegistry(),
    }).ready).toBe(true)
  })

  it('blocks a pending platform without leaking a BEK value', () => {
    const manifest = readyManifest()
    manifest.platforms[0].productionBek = 'unverified'
    const result = inspectSebPlatformEvidence(manifest, { releaseRegistry: readyRegistry() })
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'macos release gate',
      status: 'blocker',
    }))
    expect(formatSebPlatformEvidenceReport(result.checks)).not.toContain('unverified')
  })

  it('blocks missing, duplicate, and malformed platform evidence', () => {
    const manifest = readyManifest()
    manifest.platforms.pop()
    manifest.platforms.push({ ...manifest.platforms[0] })
    manifest.platforms[1].buildId = ''
    const result = inspectSebPlatformEvidence(manifest, { releaseRegistry: readyRegistry() })
    expect(result.ready).toBe(false)
    expect(result.checks.filter(check => check.status === 'blocker').length).toBeGreaterThanOrEqual(3)
  })

  it('rejects manifest fields intended to store secrets', () => {
    const manifest = { ...readyManifest(), notes: 'do-not-store-this' }
    const result = inspectSebPlatformEvidence(manifest, { releaseRegistry: readyRegistry() })
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'evidence schema',
      status: 'blocker',
    }))
  })

  it('rejects evidence copied from another config revision or build', () => {
    const manifest = readyManifest()
    manifest.configRevision = 'another-revision'
    manifest.platforms[0].buildId = 'another-build'
    const result = inspectSebPlatformEvidence(manifest, { releaseRegistry: readyRegistry() })
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'release registry linkage',
      status: 'blocker',
    }))
  })
})
