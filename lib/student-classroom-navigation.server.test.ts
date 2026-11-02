import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
vi.mock('server-only', () => ({}))
import { loadStudentClassroomNavigation } from './student-classroom-navigation.server'

const room = (id: string, extra: Record<string, unknown> = {}) => ({ classrooms: {
  id, name: id, description: null, classroom_type: 'subject', status: 'active', deleted_at: null,
  class_code: 'must-not-leave-server', teacher_id: 'private-teacher', ...extra,
} })
function reader(rows: unknown[], fail = false) {
  const queries: { table: string; columns: string; filters: unknown[][]; from: number; to: number; order: string }[] = []
  const client = { from(table: string) {
    const call = { table, columns: '', filters: [] as unknown[][], from: 0, to: 0, order: '' }
    queries.push(call)
    const query = {
      select(columns: string) { call.columns = columns; return query },
      eq(key: string, value: unknown) { call.filters.push(['eq', key, value]); return query },
      is(key: string, value: unknown) { call.filters.push(['is', key, value]); return query },
      order(key: string) { call.order = key; return query },
      range(from: number, to: number) { call.from = from; call.to = to; return query },
      returns: async () => ({ data: rows.slice(call.from, call.to + 1), error: fail ? { message: 'unavailable' } : null }),
    }
    return query
  } } as unknown as SupabaseClient
  return { client, queries }
}

describe('student classroom switcher metadata', () => {
  it('scopes every query to the verified student and returns only active room metadata', async () => {
    const { client, queries } = reader([
      room('ฟิสิกส์'), room('โฮมรูม', { classroom_type: 'homeroom' }), room('คณิตศาสตร์'),
      room('archived', { status: 'archived' }), room('deleted', { deleted_at: '2026-11-01' }),
      { classrooms: null }, room('ฟิสิกส์'),
    ])
    const result = await loadStudentClassroomNavigation(client, 'verified-student')
    expect(result.map(option => option.id)).toEqual(['โฮมรูม', 'คณิตศาสตร์', 'ฟิสิกส์'])
    expect(Object.keys(result[0]).sort()).toEqual(['classroom_type', 'description', 'id', 'name'])
    expect(JSON.stringify(result)).not.toContain('must-not-leave-server')
    expect(queries[0].columns).not.toContain('class_code')
    expect(queries[0].filters).toEqual([
      ['eq', 'student_id', 'verified-student'], ['eq', 'classrooms.status', 'active'], ['is', 'classrooms.deleted_at', null],
    ])
  })
  it('reads beyond the API row limit with the same enrollment scope on each page', async () => {
    const { client, queries } = reader(Array.from({ length: 1001 }, (_, i) => room(`room-${i}`)))
    expect(await loadStudentClassroomNavigation(client, 'verified-student')).toHaveLength(1001)
    expect(queries.length).toBeGreaterThan(1)
    expect(queries.every(q => q.table === 'classroom_students' && q.order === 'classroom_id'
      && q.filters.some(filter => filter[1] === 'student_id' && filter[2] === 'verified-student'))).toBe(true)
  })
  it('keeps an empty roster empty and reports query failures', async () => {
    expect(await loadStudentClassroomNavigation(reader([]).client, 'verified-student')).toEqual([])
    await expect(loadStudentClassroomNavigation(reader([], true).client, 'verified-student')).rejects.toThrow('โหลดรายชื่อห้องเรียนไม่สำเร็จ')
  })
})
