import { describe, expect, it } from 'vitest'
import {
  isAssignmentReminderId, latestAssignmentReminderRecords, missingSubmissionStudentIds,
  reminderAssignmentIsPublished, type AssignmentReminderRecord,
} from './assignment-reminders'

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const reminder = (n: number, change: Partial<AssignmentReminderRecord> = {}): AssignmentReminderRecord => ({
  id: id(n), related_assignment_id: id(100), related_classroom_id: id(200),
  is_read: false, created_at: '2026-10-20T02:00:00Z', ...change,
})

describe('missing-hand-in reminder rules', () => {
  it('excludes any submitted or graded attempt, even when a newer attempt is unfinished', () => {
    expect(missingSubmissionStudentIds([id(1), id(2), id(3), id(4), id(4)], [
      { student_id: id(1), status: 'submitted' }, { student_id: id(1), status: 'in_progress' },
      { student_id: id(2), status: 'graded' }, { student_id: id(3), status: 'in_progress' },
      { student_id: id(99), status: 'submitted' },
    ])).toEqual([id(3), id(4)])
  })

  it('an acknowledged latest reminder suppresses older unread duplicates', () => {
    expect(latestAssignmentReminderRecords([
      reminder(1), reminder(2, { created_at: '2026-10-20T03:00:00Z', is_read: true }),
    ])).toEqual([])
  })

  it('a subsequent explicit reminder may appear after the previous one was acknowledged', () => {
    const newer = reminder(3, { created_at: '2026-10-20T04:00:00Z' })
    expect(latestAssignmentReminderRecords([
      reminder(2, { created_at: '2026-10-20T03:00:00Z', is_read: true }), newer,
    ])).toEqual([newer])
  })

  it('deduplicates across classrooms by assignment and orders the newest notifications first', () => {
    const first = reminder(1, { related_assignment_id: id(101) })
    const second = reminder(2, { related_classroom_id: id(201), created_at: '2026-10-20T03:00:00Z' })
    expect(latestAssignmentReminderRecords([first, reminder(3), second])).toEqual([second, first])
  })

  it('uses the same deterministic ID tie-break as its ordered database history', () => {
    expect(latestAssignmentReminderRecords([reminder(1), reminder(2, { is_read: true })])).toEqual([])
  })

  it.each([
    { id: 'not-a-uuid' }, { related_assignment_id: null }, { related_classroom_id: null },
    { created_at: 'invalid-date' },
  ])('discards malformed own notification metadata (%j)', change => {
    expect(latestAssignmentReminderRecords([reminder(1, change)])).toEqual([])
  })

  it.each(['exercise', 'exam'])('allows a published online %s', type => {
    expect(reminderAssignmentIsPublished({ type, mode: 'online', status: 'published' })).toBe(true)
  })

  it.each([
    { type: 'survey', mode: 'online', status: 'published' },
    { type: 'exercise', mode: 'offline', status: 'published' },
    { type: 'exercise', mode: 'online', status: 'closed' },
    { type: 'exam', mode: 'online', status: 'draft' },
  ])('does not send a reminder for an ineligible assignment (%j)', row => {
    expect(reminderAssignmentIsPublished(row)).toBe(false)
  })

  it('validates runtime IDs without coercing objects or route text', () => {
    expect(isAssignmentReminderId(id(1))).toBe(true)
    for (const value of [null, undefined, {}, '', '../take', '10000000-0000-4000-8000-000000000001?x=1']) {
      expect(isAssignmentReminderId(value)).toBe(false)
    }
  })
})
