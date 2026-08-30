import { describe, expect, it } from 'vitest'
import type { ProctorEventRow } from './exam-proctor-realtime'
import {
  collapseProctorAlertEvents,
  isReviewableProctorEvent,
  isUnacknowledgedProctorEvent,
  proctorAlertSeverity,
  selectProctorDashboardEvents,
  takeUnseenReviewableProctorEvents,
} from './exam-proctor-alerts'

function event(
  id: number,
  studentId: string,
  eventType: string,
  acknowledgedAt: string | null = null,
): ProctorEventRow {
  return {
    id,
    org_id: 'org',
    assignment_id: 'assignment',
    submission_id: `submission-${studentId}`,
    student_id: studentId,
    event_type: eventType,
    occurred_at_client: '2026-08-30T08:00:00.000Z',
    created_at: `2026-08-30T08:00:0${id}.000Z`,
    acknowledged_at: acknowledgedAt,
    acknowledged_by: acknowledgedAt ? 'teacher' : null,
  }
}

describe('exam proctor alerts', () => {
  it('separates reviewable signals from recovery and lifecycle events', () => {
    expect(isReviewableProctorEvent('tab_hidden')).toBe(true)
    expect(isReviewableProctorEvent('monitoring_started')).toBe(false)
    expect(isReviewableProctorEvent('tab_visible')).toBe(false)
    expect(isUnacknowledgedProctorEvent(event(1, 'student-a', 'tab_hidden'))).toBe(true)
    expect(isUnacknowledgedProctorEvent(event(
      2,
      'student-a',
      'tab_hidden',
      '2026-08-30T08:01:00.000Z',
    ))).toBe(false)
  })

  it('treats screenshot keys and concurrent sessions as urgent', () => {
    expect(proctorAlertSeverity('screenshot_key')).toBe('urgent')
    expect(proctorAlertSeverity('concurrent_connection')).toBe('urgent')
    expect(proctorAlertSeverity('window_blur')).toBe('warning')
    expect(proctorAlertSeverity('window_focus')).toBeNull()
  })

  it('alerts an event only once across Realtime and fallback snapshots', () => {
    const historical = event(1, 'student-a', 'tab_hidden')
    const inserted = event(2, 'student-b', 'fullscreen_exited')
    const recovery = event(3, 'student-b', 'tab_visible')
    const alreadyAcknowledged = event(
      4,
      'student-c',
      'copy_attempt',
      '2026-08-30T08:02:00.000Z',
    )
    const seen = new Set([historical.id])

    expect(takeUnseenReviewableProctorEvents([inserted], seen).map(row => row.id)).toEqual([2])
    expect(takeUnseenReviewableProctorEvents([
      historical,
      inserted,
      recovery,
      alreadyAcknowledged,
    ], seen)).toEqual([])
    expect([...seen]).toEqual([1, 2, 3, 4])
  })

  it('coalesces cascaded signals per student while retaining the urgent one', () => {
    expect(collapseProctorAlertEvents([
      event(1, 'student-a', 'tab_hidden'),
      event(2, 'student-a', 'window_blur'),
      event(3, 'student-a', 'screenshot_key'),
      event(4, 'student-b', 'fullscreen_exited'),
      event(5, 'student-c', 'tab_visible'),
      event(6, 'student-d', 'copy_attempt', '2026-08-30T08:02:00.000Z'),
    ]).map(row => row.id)).toEqual([3, 4])
  })

  it('keeps older unacknowledged signals reachable beyond the recent feed', () => {
    const rows = Array.from({ length: 140 }, (_, index) => ({
      ...event(
        index + 1,
        `student-${index}`,
        index < 3 ? 'tab_hidden' : 'tab_visible',
      ),
      created_at: new Date(Date.UTC(2026, 7, 30, 8, 0, index)).toISOString(),
    }))

    const selected = selectProctorDashboardEvents(rows)
    expect(selected).toHaveLength(103)
    expect(selected.map(row => row.id)).toEqual(expect.arrayContaining([1, 2, 3]))
    expect(selected.filter(row => row.id >= 41)).toHaveLength(100)
  })
})
