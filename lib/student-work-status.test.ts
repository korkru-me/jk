import { describe, expect, it } from 'vitest'
import { studentWorkSeverity } from './student-work-status'

const now = Date.parse('2026-10-14T10:00:00+07:00')
describe('shared student card and calendar urgency', () => {
  it('completed takes precedence over an overdue deadline', () => {
    expect(studentWorkSeverity('2026-10-13T10:00:00+07:00', true, now)).toBe('done')
  })
  it('uses the same exact 48-hour boundary as the calendar', () => {
    expect(studentWorkSeverity(new Date(now - 1).toISOString(), false, now)).toBe('overdue')
    expect(studentWorkSeverity(new Date(now).toISOString(), false, now)).toBe('soon')
    expect(studentWorkSeverity(new Date(now + 2 * 86400000 - 1).toISOString(), false, now)).toBe('soon')
    expect(studentWorkSeverity(new Date(now + 2 * 86400000).toISOString(), false, now)).toBe('later')
  })
  it.each([null, 'invalid'])('work without a valid deadline remains pending', endAt => {
    expect(studentWorkSeverity(endAt, false, now)).toBe('later')
    expect(studentWorkSeverity(endAt, true, now)).toBe('done')
  })
})
