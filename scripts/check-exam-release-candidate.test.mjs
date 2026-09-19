import { describe, expect, it } from 'vitest'
import {
  formatExamReleaseCandidateReport,
  inspectExamReleaseCandidate,
} from './check-exam-release-candidate-core.mjs'

function readyCandidate() {
  return {
    schemaVersion: 1,
    candidateId: 'release-2026-09',
    sourceRevision: 'a'.repeat(40),
    stagingBuild: 'staging-build-123',
    sebConfigId: 'production-v1',
    lockedAt: '2026-09-20T10:00:00.000Z',
  }
}

const linkage = { uatRunId: 'release-2026-09', sebConfigId: 'production-v1' }

describe('exam release candidate', () => {
  it('passes a frozen candidate linked to the same UAT run and SEB config', () => {
    expect(inspectExamReleaseCandidate(readyCandidate(), linkage).ready).toBe(true)
  })

  it('blocks pending revision, build, and lock time without printing their values', () => {
    const manifest = {
      ...readyCandidate(),
      sourceRevision: 'pending',
      stagingBuild: 'pending',
      lockedAt: null,
    }
    const result = inspectExamReleaseCandidate(manifest, linkage)
    expect(result.ready).toBe(false)
    expect(result.checks.filter(check => check.status === 'blocker')).toHaveLength(3)
    const report = formatExamReleaseCandidateReport(result.checks)
    expect(report).not.toContain(manifest.candidateId)
    expect(report).not.toContain(manifest.sebConfigId)
  })

  it('blocks evidence copied from another candidate or SEB config', () => {
    const result = inspectExamReleaseCandidate(readyCandidate(), {
      uatRunId: 'another-release',
      sebConfigId: 'another-config',
    })
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'UAT candidate linkage',
      status: 'blocker',
    }))
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'SEB candidate linkage',
      status: 'blocker',
    }))
  })

  it('rejects non-canonical revision/time and unsafe staging metadata', () => {
    for (const patch of [
      { sourceRevision: 'A'.repeat(40) },
      { lockedAt: '20/09/2026' },
      { stagingBuild: 'https://staging.example.test' },
      { stagingBuild: 'a'.repeat(64) },
    ]) {
      expect(inspectExamReleaseCandidate({ ...readyCandidate(), ...patch }, linkage).ready).toBe(false)
    }
  })

  it('rejects extra fields rather than accepting notes or credentials', () => {
    const result = inspectExamReleaseCandidate({
      ...readyCandidate(),
      notes: 'do not store this',
    }, linkage)
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'candidate schema',
      status: 'blocker',
    }))
  })
})
