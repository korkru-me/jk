import { describe, expect, it } from 'vitest'
import {
  applyProctorEventChanges,
  applyProctorSessionChanges,
  proctorDashboardConnectionMode,
  proctorSignalRetryDelay,
  type ProctorEventRow,
  type ProctorSessionRow,
} from './exam-proctor-realtime'

function session(submissionId: string, lastSeenAt: string): ProctorSessionRow {
  return {
    submission_id: submissionId,
    org_id: 'org',
    assignment_id: 'assignment',
    student_id: `student-${submissionId}`,
    started_monitoring_at: lastSeenAt,
    last_seen_at: lastSeenAt,
    is_online: true,
    is_tab_visible: true,
    is_fullscreen: true,
    completed_at: null,
    tab_switch_count: 0,
    fullscreen_exit_count: 0,
    window_blur_count: 0,
    clipboard_attempt_count: 0,
    screenshot_key_count: 0,
    active_connection_count: 1,
    concurrent_connection_count: 0,
    last_event_type: null,
    last_event_at: null,
    created_at: lastSeenAt,
    updated_at: lastSeenAt,
  }
}

function event(id: number, createdAt: string): ProctorEventRow {
  return {
    id,
    org_id: 'org',
    assignment_id: 'assignment',
    submission_id: `submission-${id}`,
    student_id: `student-${id}`,
    event_type: 'tab_hidden',
    occurred_at_client: createdAt,
    created_at: createdAt,
  }
}

describe('exam proctor realtime reconciliation', () => {
  it('replays upserts and deletes delivered while a session snapshot is loading', () => {
    const rows = applyProctorSessionChanges(
      [
        session('a', '2026-08-24T07:00:00.000Z'),
        session('b', '2026-08-24T07:01:00.000Z'),
      ],
      [
        { type: 'upsert', row: session('a', '2026-08-24T07:03:00.000Z') },
        { type: 'delete', submissionId: 'b' },
        { type: 'upsert', row: session('c', '2026-08-24T07:02:00.000Z') },
      ],
    )

    expect(rows.map(row => row.submission_id)).toEqual(['a', 'c'])
    expect(rows[0].last_seen_at).toBe('2026-08-24T07:03:00.000Z')
  })

  it('deduplicates, orders, limits, and deletes event rows after a snapshot', () => {
    const rows = applyProctorEventChanges(
      [event(1, '2026-08-24T07:00:00.000Z'), event(2, '2026-08-24T07:01:00.000Z')],
      [
        { type: 'delete', eventId: 1 },
        { type: 'upsert', row: event(2, '2026-08-24T07:02:00.000Z') },
        { type: 'upsert', row: event(3, '2026-08-24T07:03:00.000Z') },
      ],
      2,
    )

    expect(rows.map(row => row.id)).toEqual([3, 2])
    expect(rows[1].created_at).toBe('2026-08-24T07:02:00.000Z')
  })

  it('maps channel failures to polling fallback without treating setup as failure', () => {
    expect(proctorDashboardConnectionMode('SUBSCRIBED')).toBe('live')
    expect(proctorDashboardConnectionMode('CHANNEL_ERROR')).toBe('fallback')
    expect(proctorDashboardConnectionMode('TIMED_OUT')).toBe('fallback')
    expect(proctorDashboardConnectionMode('CLOSED')).toBe('fallback')
    expect(proctorDashboardConnectionMode('JOINING')).toBe('connecting')
  })

  it('backs signal retries off and caps them at 30 seconds', () => {
    expect([0, 1, 2, 3, 4, 5, Number.NaN].map(proctorSignalRetryDelay)).toEqual([
      1_000,
      1_000,
      3_000,
      10_000,
      30_000,
      30_000,
      1_000,
    ])
  })
})
