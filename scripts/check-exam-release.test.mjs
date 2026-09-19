import { describe, expect, it } from 'vitest'
import {
  formatExamReleaseReadinessReport,
  inspectExamReleaseReadiness,
} from './check-exam-release-core.mjs'

describe('exam release gate', () => {
  it('passes only when staging and every SEB platform are ready', () => {
    expect(inspectExamReleaseReadiness({
      stagingReady: true,
      sebPlatformsReady: true,
    }).ready).toBe(true)
  })

  it('reports each external blocker independently', () => {
    const result = inspectExamReleaseReadiness({
      stagingReady: false,
      sebPlatformsReady: false,
    })
    expect(result.ready).toBe(false)
    expect(result.checks.filter(check => check.status === 'blocker')).toHaveLength(2)
    expect(formatExamReleaseReadinessReport(result.checks)).toContain('NOT READY: 2 external release blocker(s)')
  })
})
