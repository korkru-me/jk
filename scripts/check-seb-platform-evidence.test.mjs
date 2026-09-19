import { describe, expect, it } from 'vitest'
import {
  formatSebPlatformEvidenceReport,
  inspectSebPlatformEvidence,
} from './check-seb-platform-evidence-core.mjs'

function readyManifest() {
  return {
    schemaVersion: 1,
    configId: 'production-v1',
    platforms: ['macos', 'ipados', 'ios', 'windows'].map(id => ({
      id,
      label: id,
      osVersion: 'tested-os',
      sebVersion: 'tested-seb',
      nativeCore: 'passed',
      productionBek: 'registered',
      stagingMockExam: 'passed',
      physicalUat: 'passed',
    })),
  }
}

describe('SEB platform evidence', () => {
  it('passes only when every required platform clears every release gate', () => {
    expect(inspectSebPlatformEvidence(readyManifest()).ready).toBe(true)
  })

  it('blocks a pending platform without leaking a BEK value', () => {
    const manifest = readyManifest()
    manifest.platforms[0].productionBek = 'unverified'
    const result = inspectSebPlatformEvidence(manifest)
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
    manifest.platforms[1].sebVersion = ''
    const result = inspectSebPlatformEvidence(manifest)
    expect(result.ready).toBe(false)
    expect(result.checks.filter(check => check.status === 'blocker').length).toBeGreaterThanOrEqual(3)
  })

  it('rejects manifest fields intended to store secrets', () => {
    const manifest = { ...readyManifest(), configKey: 'do-not-store-this' }
    const result = inspectSebPlatformEvidence(manifest)
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'secret hygiene',
      status: 'blocker',
    }))
  })
})

