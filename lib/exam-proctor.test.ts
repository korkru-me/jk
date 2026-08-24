import { describe, expect, it } from 'vitest'
import { normalizeProctorEvents } from './exam-proctor'

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
