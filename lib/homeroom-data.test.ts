import { beforeEach, expect, it, vi } from 'vitest'
import { getHomeroomAggregate } from './homeroom-data'

vi.mock('./supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('./voided-score-metadata.server', () => ({ withVoidedScoreMetadata: (_admin: unknown, rows: unknown[]) => rows }))

const member = (student_id: string, classroom_id: string, name: string) => ({
  student_id, classroom_id, classrooms: { id: classroom_id, name, classroom_type: 'subject', status: 'active' },
})
const work = {
  id: 'work', title: 'ใบงาน', end_at: null, passing_type: null, passing_value: null,
  score_strategy: 'best', display_max_score: null,
  assignment_classrooms: [{ classroom_id: 'physics', group_ids: null }, { classroom_id: 'chemistry', group_ids: null }],
}
let datasets: Record<string, unknown[]>
let failedTable: string | null
const calls: { table: string; method: string; args: unknown[] }[] = []
const admin = {
  from(table: string) {
    const query: Record<string, (...args: unknown[]) => unknown> = {}
    for (const method of ['select', 'in', 'neq', 'eq', 'order']) query[method] = (...args) => {
      calls.push({ table, method, args }); return query
    }
    query.range = (from, to) => Promise.resolve({
      data: datasets[table].slice(Number(from), Number(to) + 1),
      error: table === failedTable ? new Error('read failed') : null,
    })
    return query
  },
} as unknown as Parameters<typeof getHomeroomAggregate>[0]

beforeEach(() => {
  calls.length = 0; failedTable = null
  datasets = { classroom_students: [member('a', 'physics', 'ฟิสิกส์ 1'), member('b', 'chemistry', 'เคมี 1')], assignments: [work], submissions: [], classroom_group_members: [] }
})
it('projects all source rooms and their actual recipients with roster-scoped reads', async () => {
  const result = await getHomeroomAggregate(admin, 'homeroom', ['a', 'b', 'c'])
  expect(result.assignments[0].classroomName).toBe('ฟิสิกส์ 1 · เคมี 1')
  expect(result.assignments[0].assignedStudentIds).toEqual(['a', 'b'])
  expect(calls).toContainEqual({ table: 'classroom_students', method: 'in', args: ['student_id', ['a', 'b', 'c']] })
  expect(calls).toContainEqual({ table: 'submissions', method: 'in', args: ['student_id', ['a', 'b', 'c']] })
})
it('reads memberships past the response cap before deriving recipients', async () => {
  datasets.classroom_students = Array.from({ length: 1001 }, (_, i) => member(`student-${i}`, 'physics', 'ฟิสิกส์ 1'))
  const ids = datasets.classroom_students.map((_, i) => `student-${i}`)
  const result = await getHomeroomAggregate(admin, 'homeroom', ids)
  expect(result.assignments[0].assignedStudentIds).toHaveLength(1001)
  expect(result.assignments[0].assignedStudentIds).toContain('student-1000')
})
it.each(['classroom_students', 'assignments', 'submissions', 'classroom_group_members'])('does not label students as non-members when %s fails', async table => {
  failedTable = table
  await expect(getHomeroomAggregate(admin, 'homeroom', ['a', 'b'])).rejects.toThrow('read failed')
})
it('does not query for an empty homeroom', async () => {
  expect(await getHomeroomAggregate(admin, 'homeroom', [])).toEqual({ assignments: [], submissions: [] })
  expect(calls).toEqual([])
})
