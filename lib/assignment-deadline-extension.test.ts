import { describe, expect, it } from 'vitest'
import {
  assignmentDeadlineExtensionInputSchema,
  validateAssignmentDeadlineExtension,
  type AssignmentDeadlineExtensionRow,
} from './assignment-deadline-extension'

const NOW = Date.parse('2026-10-19T12:00:00.000Z')
const END = '2026-10-20T09:00:30.000Z'
const NEXT = '2026-10-21T09:00:00.000Z'
const row: AssignmentDeadlineExtensionRow = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'งาน', classroom_id: null, type: 'exercise', mode: 'online', status: 'published',
  start_at: '2026-10-18T09:00:00.000Z', due_at: null, late_bands: [],
  end_at: END, duration_minutes: 30, updated_at: '2026-10-19T09:00:00.000Z',
}

describe('assignment-wide closing-time validation', () => {
  it('normalizes an offset instant without changing schedule, timer, or input', () => {
    const original = structuredClone(row)
    expect(validateAssignmentDeadlineExtension(row, '2026-10-21T16:00:00+07:00', NOW)).toEqual({ endAt: NEXT })
    expect(row).toEqual(original)
  })

  it.each(['exam', 'exercise'])('accepts the online %s assignment type', type => {
    expect(validateAssignmentDeadlineExtension({ ...row, type }, NEXT, NOW)).toEqual({ endAt: NEXT })
  })

  it('can extend an elapsed published closing time without reopening closed attempts', () => {
    expect(validateAssignmentDeadlineExtension({ ...row, end_at: '2026-10-18T09:00:00Z' }, NEXT, NOW)).toEqual({ endAt: NEXT })
  })

  it.each([undefined, null, '', 'tomorrow', '2026-10-21T09:00', '2026-02-30T09:00:00Z', Infinity])('rejects malformed or unzoned dates (%s)', value => {
    expect(validateAssignmentDeadlineExtension(row, value, NOW)).toHaveProperty('error')
  })

  it.each(['2026-10-20T09:00:29.999Z', END])('rejects a shortened or unchanged close including seconds', value => {
    expect(validateAssignmentDeadlineExtension(row, value, NOW)).toHaveProperty('error')
  })

  it('rejects a new deadline at or before the server clock', () => {
    expect(validateAssignmentDeadlineExtension({ ...row, end_at: '2026-10-18T09:00:00Z' }, '2026-10-19T12:00:00Z', NOW)).toHaveProperty('error')
  })

  it.each([
    { status: 'draft' }, { status: 'closed' }, { mode: 'offline' },
    { type: 'survey' }, { end_at: null },
  ])('does not publish, reopen, or add limits to an ineligible assignment (%j)', change => {
    expect(validateAssignmentDeadlineExtension({ ...row, ...change }, NEXT, NOW)).toHaveProperty('error')
  })

  it('checks that the closing time is after start even without a late policy', () => {
    expect(validateAssignmentDeadlineExtension({ ...row, start_at: NEXT }, NEXT, NOW)).toHaveProperty('error')
  })

  it('checks the complete due/band policy and preserves it verbatim', () => {
    const policy = {
      ...row, due_at: '2026-10-19T09:00:00.000Z', late_bands: [
        { id: '20000000-0000-4000-8000-000000000001', starts_at: '2026-10-19T09:00:00.000Z', label: 'ส่งช้า', color: 'amber' },
        { id: '20000000-0000-4000-8000-000000000002', starts_at: '2026-10-20T10:00:00.000Z', label: 'ส่งช้ามาก', color: 'red' },
      ],
    }
    const original = structuredClone(policy)
    expect(validateAssignmentDeadlineExtension(policy, NEXT, NOW)).toEqual({ endAt: NEXT })
    expect(policy).toEqual(original)
    expect(validateAssignmentDeadlineExtension(policy, '2026-10-20T10:00:00Z', NOW)).toHaveProperty('error')
    expect(validateAssignmentDeadlineExtension({ ...policy, due_at: NEXT }, NEXT, NOW)).toHaveProperty('error')
  })

  it('refuses a malformed historical policy rather than dropping it', () => {
    expect(validateAssignmentDeadlineExtension({ ...row, late_bands: [{ arbitrary: 'data' }] }, NEXT, NOW)).toHaveProperty('error')
  })

  it('accepts only the closing-time and CAS input fields', () => {
    const input = { endAt: NEXT, expectedEndAt: END, expectedUpdatedAt: row.updated_at }
    expect(assignmentDeadlineExtensionInputSchema.safeParse(input).success).toBe(true)
    expect(assignmentDeadlineExtensionInputSchema.safeParse({ ...input, studentId: row.id }).success).toBe(false)
    expect(assignmentDeadlineExtensionInputSchema.safeParse({ ...input, due_at: NEXT }).success).toBe(false)
    expect(assignmentDeadlineExtensionInputSchema.safeParse({ endAt: NEXT }).success).toBe(false)
  })
})
