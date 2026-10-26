import { describe, expect, it } from 'vitest'
import { studentDeadlineNotice, isSystemDeadlineNotice } from './student-bell'
const NOW = Date.parse('2026-10-26T12:00:00Z')
const due = (offset: number) => new Date(NOW + offset).toISOString()
const work = (offset: number) => ({ status: 'published', due_at: due(offset), end_at: due(offset + 86_400_000) })
describe('student deadline notices', () => {
  it('starts exactly 24 hours before the due time and changes phase only after the due time', () => {
    expect(studentDeadlineNotice(work(86_400_001), undefined, NOW)).toBeNull()
    expect(studentDeadlineNotice(work(86_400_000), undefined, NOW)?.kind).toBe('due-soon')
    expect(studentDeadlineNotice(work(0), undefined, NOW)?.kind).toBe('due-soon')
    expect(studentDeadlineNotice(work(-1), undefined, NOW)?.kind).toBe('overdue')
  })
  it('uses the on-time due boundary rather than the later close boundary', () => {
    expect(studentDeadlineNotice(work(-60_000), undefined, NOW)?.kind).toBe('overdue')
    expect(studentDeadlineNotice({ ...work(60_000), due_at: null }, undefined, NOW)).toBeNull()
  })
  it('honors both modern and legacy personal extensions', () => {
    expect(studentDeadlineNotice(work(-1), { extended_due_at: due(172_800_000), extended_end_at: due(259_200_000) }, NOW)).toBeNull()
    expect(studentDeadlineNotice(work(-1), { extended_due_at: null, extended_end_at: due(60_000) }, NOW)?.kind).toBe('due-soon')
  })
  it('ignores invalid/unpublished work while allowing already-published future exam windows', () => {
    for (const assignment of [
      { ...work(1), due_at: null, end_at: null }, { ...work(1), due_at: 'invalid' },
      { ...work(1), status: 'draft' }, { ...work(1), status: 'closed' },
    ]) expect(studentDeadlineNotice(assignment, undefined, NOW)).toBeNull()
    expect(studentDeadlineNotice({ ...work(1), start_at: due(1) }, undefined, NOW)?.kind).toBe('due-soon')
    expect(studentDeadlineNotice(work(1), { extended_due_at: due(10), extended_end_at: due(1) }, NOW)).toBeNull()
    expect(studentDeadlineNotice({ ...work(-1), status: 'closed' }, undefined, NOW)?.kind).toBe('overdue')
  })
  it('separates system deadline receipts from explicit teacher reminder popups', () => {
    expect(isSystemDeadlineNotice({ type: 'assignment_reminder', actor_id: null })).toBe(true)
    expect(isSystemDeadlineNotice({ type: 'assignment_reminder', actor_id: 'teacher' })).toBe(false)
    expect(isSystemDeadlineNotice({ type: 'classroom_post', actor_id: null })).toBe(false)
  })
})
