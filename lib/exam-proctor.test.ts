import { describe, expect, it } from 'vitest'
import { normalizeProctorEvents } from './exam-proctor'
import {
  EXAM_PROCTOR_RETENTION_DAYS,
  normalizeProctorPurgeCounts,
  totalPurgedProctorRecords,
} from './exam-proctor-retention'

describe('normalizeProctorEvents', () => {
  it('accepts only the allowlisted, minimal event shape', () => {
    expect(normalizeProctorEvents([
      { id: 'd8f57df1-7fbf-4ac3-86ec-d384045838c3', type: 'tab_hidden', clientAt: '2026-08-24T06:30:00+07:00', ignored: 'not persisted' },
    ])).toEqual([
      { id: 'd8f57df1-7fbf-4ac3-86ec-d384045838c3', type: 'tab_hidden', clientAt: '2026-08-23T23:30:00.000Z' },
    ])
  })

  it('rejects unknown event types and invalid timestamps', () => {
    const id = 'd8f57df1-7fbf-4ac3-86ec-d384045838c3'
    expect(normalizeProctorEvents([{ id, type: 'camera_photo', clientAt: new Date().toISOString() }])).toBeNull()
    // This alert is authored by the database after counting active leases;
    // a student client must not be able to forge it in an event batch.
    expect(normalizeProctorEvents([{ id, type: 'concurrent_connection', clientAt: new Date().toISOString() }])).toBeNull()
    expect(normalizeProctorEvents([{ id, type: 'tab_hidden', clientAt: 'not-a-date' }])).toBeNull()
    expect(normalizeProctorEvents([{ id: 'not-a-uuid', type: 'tab_hidden', clientAt: new Date().toISOString() }])).toBeNull()
  })

  it('rejects batches above the server limit', () => {
    expect(normalizeProctorEvents(Array.from({ length: 21 }, (_, index) => ({
      id: `d8f57df1-7fbf-4ac3-86ec-${String(index).padStart(12, '0')}`,
      type: 'window_blur',
      clientAt: new Date().toISOString(),
    })))).toBeNull()
  })
})

describe('exam proctor retention boundary', () => {
  it('publishes the 90-day product retention window', () => {
    expect(EXAM_PROCTOR_RETENTION_DAYS).toBe(90)
  })

  it('accepts only complete non-negative integer purge counts', () => {
    const counts = normalizeProctorPurgeCounts({
      eventsDeleted: 12,
      connectionsDeleted: 3,
      sessionsDeleted: 2,
      ignored: 'not exposed',
    })
    expect(counts).toEqual({ eventsDeleted: 12, connectionsDeleted: 3, sessionsDeleted: 2 })
    expect(counts && totalPurgedProctorRecords(counts)).toBe(17)

    expect(normalizeProctorPurgeCounts({ eventsDeleted: '12', connectionsDeleted: 3, sessionsDeleted: 2 })).toBeNull()
    expect(normalizeProctorPurgeCounts({ eventsDeleted: 12, connectionsDeleted: -1, sessionsDeleted: 2 })).toBeNull()
    expect(normalizeProctorPurgeCounts({ eventsDeleted: 12, connectionsDeleted: 3 })).toBeNull()
  })
})
