import { describe, expect, it } from 'vitest'
import {
  formatSebReleaseRegistryReport,
  inspectSebReleaseRegistry,
} from './check-seb-release-registry-core.mjs'

const DIGEST = 'a'.repeat(64)
const REVISION = `production-v1-${DIGEST}`

function readyRegistry() {
  return {
    schemaVersion: 1,
    candidateRevision: REVISION,
    productionRevision: null,
    revisions: [{
      revision: REVISION,
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
        startUrl: 'approved',
        navigationFilters: 'approved',
        uploads: 'approved',
        quitPassword: 'approved',
        adminPassword: 'approved',
        distribution: 'approved',
      },
      builds: [
        ['macos', 'macos'],
        ['ipados', 'ios'],
        ['ios', 'ios'],
        ['windows', 'windows'],
      ].map(([target, runtimePlatform]) => ({
        id: `${target}-3.7-100`,
        target,
        runtimePlatform,
        osVersion: 'tested-os',
        versionString: '3.7',
        buildNumber: '100',
        approval: 'approved',
      })),
    }],
  }
}

describe('SEB release registry', () => {
  it('passes an exact artifact and approved four-platform matrix', () => {
    expect(inspectSebReleaseRegistry(readyRegistry(), {
      candidateArtifactSha256: DIGEST,
    }).ready).toBe(true)
  })

  it('blocks a changed artifact and pending policy without echoing metadata', () => {
    const manifest = readyRegistry()
    manifest.revisions[0].policy.uploads = 'pending'
    const result = inspectSebReleaseRegistry(manifest, {
      candidateArtifactSha256: 'b'.repeat(64),
    })
    expect(result.ready).toBe(false)
    const report = formatSebReleaseRegistryReport(result.checks)
    expect(report).not.toContain(REVISION)
    expect(report).not.toContain(DIGEST)
  })

  it('rejects unknown fields, duplicate targets, and approved placeholders', () => {
    const manifest = readyRegistry()
    manifest.extra = 'not allowed'
    manifest.revisions[0].builds[1].target = 'macos'
    manifest.revisions[0].builds[2].buildNumber = 'record during final UAT'
    expect(inspectSebReleaseRegistry(manifest, {
      candidateArtifactSha256: DIGEST,
    }).ready).toBe(false)
  })
})
