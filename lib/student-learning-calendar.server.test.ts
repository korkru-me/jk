import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
const groups = vi.hoisted(() => vi.fn())
vi.mock('server-only', () => ({}))
vi.mock('./classroom-groups-server', () => ({ getStudentGroups: groups }))
import { loadStudentLearningCalendar } from './student-learning-calendar.server'

const rooms = ['physics', 'math'].map(id => ({ classroom_id: id, classrooms: { id, name: id, status: 'active', classroom_type: 'subject', description: null } }))
const assignment = (id: string, room: string, group_ids: string[] | null = null) => ({ id, classroom_id: room, title: id, type: 'exercise', end_at: '2026-10-15T10:00:00+07:00', duration_minutes: null, passing_type: 'percent', passing_value: 70, score_strategy: 'best', display_max_score: null as number | null, show_results: 'never', assignment_classrooms: [{ classroom_id: room, group_ids }] })
const works = [assignment('passed', 'physics'), assignment('failed', 'math'), assignment('other-group', 'math', ['other'])]
const subs = works.slice(0, 2).map((a, i) => ({ id: `sub-${i}`, assignment_id: a.id, assignments: { ...a, classrooms: { name: a.classroom_id } }, status: 'graded', total_score: i ? 2 : 9, max_score: 10, score_adjustment: 0, attempt_number: 1, created_at: '2026-10-14T00:00:00Z' }))
type Filter = { table: string; key: string; value: unknown }
function reader(rows = rooms, failTable = '', submissionRows = subs, removedById: Record<string, number> = {}, metadataError: string | null = null) {
  const filters: Filter[] = []
  const tables: string[] = []
  const client = { from(table: string) {
    tables.push(table)
    let selected = ''
    let selectedIds: string[] = []
    const q = { select(columns: string) { selected = columns; return q }, order: () => q,
      eq(key: string, value: unknown) { filters.push({ table, key, value }); return q },
      in(key: string, value: unknown) {
        filters.push({ table, key, value })
        if (key === 'id' && Array.isArray(value)) selectedIds = value
        return q
      },
      range: async () => ({ data: table === 'classroom_students' ? rows : table === 'submissions' ? submissionRows : works, error: table === failTable ? { code: 'failed' } : null }),
      then(resolve: (result: unknown) => unknown) {
        if (selected !== 'id, voided_max_score') throw new Error('Unexpected unbounded test query')
        return Promise.resolve({
          data: metadataError ? null : selectedIds.map(id => ({ id, voided_max_score: removedById[id] ?? 0 })),
          error: metadataError ? { code: metadataError, message: metadataError === '42703' ? 'column submissions.voided_max_score does not exist' : 'request failed' } : null,
        }).then(resolve)
      },
    }
    return q
  } } as unknown as SupabaseClient
  return { client, filters, tables }
}
beforeEach(() => groups.mockResolvedValue(new Map([['math', 'own']])))
describe('homeroom calendar matches the learning-home projection', () => {
  it('aggregates enrolled subjects, applies group reach and completion, and sends no hidden scores', async () => {
    const { client, filters } = reader()
    const events = await loadStudentLearningCalendar(client, 'verified-student')
    expect(events.map(e => [e.id, e.classroomName, e.done])).toEqual([['passed', 'physics', true], ['failed', 'math', false]])
    expect(JSON.stringify(events)).not.toContain('total_score')
    expect(filters).toEqual(expect.arrayContaining([
      { table: 'classroom_students', key: 'student_id', value: 'verified-student' },
      { table: 'submissions', key: 'student_id', value: 'verified-student' },
      { table: 'assignments', key: 'assignment_classrooms.classroom_id', value: ['physics', 'math'] },
      { table: 'assignments', key: 'status', value: 'published' },
    ]))
  })
  it.each(['classroom_students', 'submissions', 'assignments'])('reports %s failures instead of an incomplete calendar', async table => {
    const { client } = reader(rooms, table)
    await expect(loadStudentLearningCalendar(client, 'verified-student')).rejects.toThrow()
  })
  it('loads void metadata only for scoped submission IDs before deciding completion', async () => {
    const rows = subs.map(s => ({ ...s, total_score: 4, max_score: 10, assignments: {
      ...s.assignments, display_max_score: 10, passing_type: 'score', passing_value: 3,
    } }))
    const { client, filters } = reader(rooms, '', rows, { 'sub-0': 10 })
    const events = await loadStudentLearningCalendar(client, 'verified-student')
    expect(events.map(e => [e.id, e.done])).toEqual([['passed', false], ['failed', true]])
    expect(filters).toContainEqual({ table: 'submissions', key: 'id', value: ['sub-0', 'sub-1'] })
    expect(JSON.stringify(events)).not.toContain('voided_max_score')
    expect(JSON.stringify(events)).not.toContain('total_score')
  })
  it('keeps calendar loading compatible with an installation awaiting the void-score column', async () => {
    const { client } = reader(rooms, '', subs, {}, '42703')
    const events = await loadStudentLearningCalendar(client, 'verified-student')
    expect(events.map(e => [e.id, e.done])).toEqual([['passed', true], ['failed', false]])
  })
  it('reports metadata read failures instead of silently using the old denominator', async () => {
    const { client } = reader(rooms, '', subs, {}, 'failed')
    await expect(loadStudentLearningCalendar(client, 'verified-student')).rejects.toThrow('อ่านคะแนนเต็มหลังทำข้อเป็นโมฆะไม่สำเร็จ')
  })
  it('does not load assignments without memberships', async () => {
    const { client, tables } = reader([])
    expect(await loadStudentLearningCalendar(client, 'verified-student')).toEqual([])
    expect(tables).not.toContain('assignments')
  })
})
