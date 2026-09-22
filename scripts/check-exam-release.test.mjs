import { describe, expect, it } from 'vitest'
import {
  formatExamReleaseReadinessReport,
  inspectExamReleaseReadiness,
} from './check-exam-release-core.mjs'

describe('exam release gate', () => {
  it('passes only when staging and every SEB platform are ready', () => {
    expect(inspectExamReleaseReadiness({
      stagingReady: true,
      sebRegistryReady: true,
      releaseCandidateReady: true,
      sebPlatformsReady: true,
      externalUatReady: true,
    }).ready).toBe(true)
  })

  it('reports each external blocker independently', () => {
    const result = inspectExamReleaseReadiness({
      stagingReady: false,
      sebRegistryReady: false,
      releaseCandidateReady: false,
      sebPlatformsReady: false,
      externalUatReady: false,
    })
    expect(result.ready).toBe(false)
    expect(result.checks.filter(check => check.status === 'blocker')).toHaveLength(5)
    expect(formatExamReleaseReadinessReport(result.checks)).toContain('NOT READY: 5 external release blocker(s)')
  })
})
