import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const m = vi.hoisted(() => ({ manage: vi.fn(), client: vi.fn() }))
vi.mock('@/lib/auth/assignment-access', () => ({ canManageAssignment: m.manage, studentHasAssignment: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.client }))
import { exerciseGroupResultSource, exerciseGroupTeacherAnswerSource } from './exercise-group.server'

const receipt = { id: 'member-receipt', assignment_id: 'assignment', group_source_submission_id: 'source' }
let rows: Array<Record<string, unknown>>
let members: Array<Record<string, unknown>>
let filters: Array<[string, unknown]>
beforeEach(() => {
  vi.clearAllMocks(); m.manage.mockResolvedValue(true); filters = []; members = []
  rows = [{ id: 'source', assignment_id: 'assignment', group_source_submission_id: null }]
  m.client.mockImplementation(() => ({ from: (table: string) => {
    const localFilters: Array<[string, unknown]> = []
    const filter = (key: string, value: unknown) => { filters.push([key, value]); localFilters.push([key, value]); return query }
    const query = { select: () => query,
      eq: filter, is: filter,
      maybeSingle: async () => ({ data: (table === 'exercise_group_members' ? members : rows)
        .find(row => localFilters.every(([key, value]) => row[key] === value)) ?? null, error: null }),
    }; return query
  } }))
})
describe('student access to a common answer source', () => {
  beforeEach(() => {
    rows = [{ ...receipt, student_id: 'member' }, { id: 'source', assignment_id: 'assignment', student_id: 'sender', group_source_submission_id: null }]
    members = [{ submission_id: 'source', student_id: 'member', assignment_id: 'assignment' }]
  })
  it('resolves an owned receipt only through matching registered membership', async () => {
    expect(await exerciseGroupResultSource('member-receipt', 'member')).toEqual({ id: 'source', ownerId: 'sender' })
  })
  it('does not resolve a source from another assignment or another group', async () => {
    members[0].assignment_id = 'foreign-assignment'
    expect(await exerciseGroupResultSource('member-receipt', 'member')).toEqual({ id: 'member-receipt', ownerId: 'member' })
    expect(await exerciseGroupResultSource('source', 'outsider')).toEqual({ id: 'source', ownerId: 'outsider' })
  })
  it('preserves a solo owner without a group-membership read', async () => {
    expect(await exerciseGroupResultSource('source', 'sender')).toEqual({ id: 'source', ownerId: 'sender' })
    expect(filters).not.toContainEqual(['submission_id', 'source'])
  })
})
describe('teacher access to a group member result', () => {
  it('authorizes the exact assignment before resolving canonical answers', async () => {
    expect(await exerciseGroupTeacherAnswerSource(receipt, 'manager')).toBe('source')
    expect(m.manage).toHaveBeenCalledWith('assignment', 'manager')
    expect(filters).toContainEqual(['assignment_id', 'assignment'])
  })
  it('does not read canonical data for an unrelated teacher or student', async () => {
    m.manage.mockResolvedValue(false)
    expect(await exerciseGroupTeacherAnswerSource(receipt, 'outsider')).toBeNull()
    expect(m.client).not.toHaveBeenCalled()
  })
  it('rejects a source belonging to another assignment or another receipt', async () => {
    rows[0].assignment_id = 'foreign-assignment'
    expect(await exerciseGroupTeacherAnswerSource(receipt, 'manager')).toBeNull()
    rows[0].assignment_id = 'assignment'; rows[0].group_source_submission_id = 'nested-source'; filters = []
    expect(await exerciseGroupTeacherAnswerSource(receipt, 'manager')).toBeNull()
  })
  it('preserves authorized solo navigation without an extra source query', async () => {
    expect(await exerciseGroupTeacherAnswerSource({ ...receipt, group_source_submission_id: null }, 'manager')).toBe('member-receipt')
    expect(m.client).not.toHaveBeenCalled()
  })
})
