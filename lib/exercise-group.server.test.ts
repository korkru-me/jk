import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const m = vi.hoisted(() => ({ manage: vi.fn(), client: vi.fn() }))
vi.mock('@/lib/auth/assignment-access', () => ({ canManageAssignment: m.manage, studentHasAssignment: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.client }))
import { exerciseGroupTeacherAnswerSource } from './exercise-group.server'

const receipt = { id: 'member-receipt', assignment_id: 'assignment', group_source_submission_id: 'source' }
let rows: Array<{ id: string; assignment_id: string; group_source_submission_id: string | null }>
let filters: Array<[string, unknown]>
beforeEach(() => {
  vi.clearAllMocks(); m.manage.mockResolvedValue(true); filters = []
  rows = [{ id: 'source', assignment_id: 'assignment', group_source_submission_id: null }]
  m.client.mockImplementation(() => ({ from: () => {
    const query = { select: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query },
      is: (key: string, value: unknown) => { filters.push([key, value]); return query },
      maybeSingle: async () => ({ data: rows.find(row => filters.every(([key, value]) => row[key as keyof typeof row] === value)) ?? null, error: null }),
    }; return query
  } }))
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
