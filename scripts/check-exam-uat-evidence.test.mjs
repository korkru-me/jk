import { describe, expect, it } from 'vitest'
import {
  formatExamUatEvidenceReport,
  inspectExamUatEvidence,
} from './check-exam-uat-evidence-core.mjs'

const REQUIRED_IDS = [
  'iphone-responsive',
  'ipad-responsive',
  'mac-responsive',
  'windows-responsive',
  'authenticated-exam',
  'recovery-proctor',
  'qa-data-cleanup',
]

function readyManifest() {
  return {
    schemaVersion: 1,
    runId: 'release-2026-09',
    suites: REQUIRED_IDS.map(id => ({
      id,
      label: {
        'iphone-responsive': 'iPhone responsive UI',
        'ipad-responsive': 'iPad responsive UI',
        'mac-responsive': 'Mac responsive UI',
        'windows-responsive': 'Windows responsive UI',
        'authenticated-exam': 'Authenticated staging exam',
        'recovery-proctor': 'Recovery and proctor drill',
        'qa-data-cleanup': 'QA data cleanup',
      }[id],
      status: 'passed',
      testedAt: '2026-09-20T10:00:00.000Z',
      testedVersion: 'staging-build-123',
    })),
  }
}

describe('exam UAT evidence', () => {
  it('passes only when every required suite has dated version evidence', () => {
    expect(inspectExamUatEvidence(readyManifest()).ready).toBe(true)
  })

  it('blocks failed suites without printing version values in the report', () => {
    const manifest = readyManifest()
    manifest.suites[0].status = 'failed'
    manifest.suites[0].testedVersion = 'private-build-reference'
    const result = inspectExamUatEvidence(manifest)
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'iphone-responsive release gate',
      status: 'blocker',
    }))
    expect(formatExamUatEvidenceReport(result.checks)).not.toContain('private-build-reference')
  })

  it('blocks missing and duplicate suites', () => {
    const manifest = readyManifest()
    manifest.suites.pop()
    manifest.suites.push({ ...manifest.suites[0] })
    const result = inspectExamUatEvidence(manifest)
    expect(result.ready).toBe(false)
    expect(result.checks.filter(check => check.status === 'blocker').length).toBeGreaterThanOrEqual(2)
  })

  it('rejects extra fields so secrets or personal notes cannot enter the manifest', () => {
    const manifest = { ...readyManifest(), notes: 'must not be stored here' }
    manifest.suites[0].studentEmail = 'must-not-be-stored@example.test'
    const result = inspectExamUatEvidence(manifest)
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'top-level schema',
      status: 'blocker',
    }))
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'iphone-responsive evidence',
      status: 'blocker',
    }))
  })

  it('rejects extra suites even when required suites remain intact', () => {
    const manifest = readyManifest()
    manifest.suites.push({
      id: 'private-observations',
      label: 'must not be stored here',
      status: 'pending',
      testedAt: null,
      testedVersion: 'private',
    })
    const result = inspectExamUatEvidence(manifest)
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'suite schema',
      status: 'blocker',
    }))
  })

  it('requires a canonical ISO timestamp and non-placeholder tested version when passed', () => {
    const manifest = readyManifest()
    manifest.suites[0].testedAt = '20/09/2026'
    manifest.suites[1].testedVersion = 'record during final UAT'
    const result = inspectExamUatEvidence(manifest)
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'iphone-responsive evidence',
      status: 'blocker',
    }))
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'ipad-responsive evidence',
      status: 'blocker',
    }))
  })

  it('rejects URLs, account-like values, and key-like hashes in version metadata', () => {
    for (const unsafeValue of [
      'https://staging.example.test/build/123',
      'student@example.test',
      'a'.repeat(64),
    ]) {
      const manifest = readyManifest()
      manifest.suites[0].testedVersion = unsafeValue
      expect(inspectExamUatEvidence(manifest).ready).toBe(false)
    }
  })

  it('does not accept cleanup evidence captured before the other UAT suites', () => {
    const manifest = readyManifest()
    manifest.suites.find(row => row.id === 'iphone-responsive').testedAt = '2026-09-20T11:00:00.000Z'
    manifest.suites.find(row => row.id === 'qa-data-cleanup').testedAt = '2026-09-20T10:30:00.000Z'
    const result = inspectExamUatEvidence(manifest)
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'qa-data-cleanup ordering',
      status: 'blocker',
    }))
  })

  it('does not accept cleanup while another required suite is still pending', () => {
    const manifest = readyManifest()
    manifest.suites.find(row => row.id === 'recovery-proctor').status = 'pending'
    manifest.suites.find(row => row.id === 'recovery-proctor').testedAt = null
    manifest.suites.find(row => row.id === 'recovery-proctor').testedVersion = 'record during final UAT'
    const result = inspectExamUatEvidence(manifest)
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'qa-data-cleanup ordering',
      status: 'blocker',
    }))
  })

  it('rejects stale tested metadata on pending rows and missing metadata on failed rows', () => {
    const pendingWithStaleEvidence = readyManifest()
    pendingWithStaleEvidence.suites[0].status = 'pending'
    expect(inspectExamUatEvidence(pendingWithStaleEvidence).ready).toBe(false)

    const failedWithoutEvidence = readyManifest()
    failedWithoutEvidence.suites[0].status = 'failed'
    failedWithoutEvidence.suites[0].testedAt = null
    failedWithoutEvidence.suites[0].testedVersion = 'record during final UAT'
    expect(inspectExamUatEvidence(failedWithoutEvidence).ready).toBe(false)
  })
})
