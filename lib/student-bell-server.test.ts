import { beforeEach, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
vi.mock('server-only', () => ({}))
import { deadlineBellId, loadStudentBell, saveDeadlineReadReceipts } from './student-bell.server'
import type { Notification } from './types'

type Row = Record<string, unknown>
const NOW = Date.parse('2026-10-26T12:00:00Z')
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const STUDENT = uuid(1), OTHER = uuid(2), ROOM = uuid(3), ROOM2 = uuid(4), SOON = uuid(5), LATE = uuid(6), GROUP = uuid(7)
const iso = (offset: number) => new Date(NOW + offset).toISOString()
let tables: Record<string, Row[]>
let fail = ''
const calls: { client: string; table: string; op: string; filters: [string, unknown][]; columns: string }[] = []
function client(kind: string) {
  return { from(table: string) {
    const call = { client: kind, table, op: 'read', filters: [] as [string, unknown][], columns: '' }
    let range = [0, 999], inserted: Row[] = [], ignored = false
    let update: Row = {}
    const execute = () => {
      calls.push(call)
      if (fail === table) return { data: null, error: { message: 'private diagnostic' } }
      if (call.op === 'upsert') {
        for (const row of inserted) {
          const existing = tables[table].find(item => item.id === row.id)
          if (existing && !ignored) Object.assign(existing, row)
          else if (!existing) tables[table].push(row)
        }
      }
      let data = (tables[table] ?? []).filter(row => call.filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value))
      if (call.op === 'update') data.forEach(row => Object.assign(row, update))
      data = data.slice(range[0], range[1] + 1)
      return { data, error: null }
    }
    const q = { select(columns: string) { call.columns = columns; return q },
      eq(key: string, value: unknown) { call.filters.push([key, value]); return q },
      in(key: string, value: unknown[]) { call.filters.push([key, value]); return q },
      order: () => q, range(from: number, to: number) { range = [from, to]; return q },
      upsert(values: Row[], options: { ignoreDuplicates: boolean }) { call.op = 'upsert'; inserted = values; ignored = options.ignoreDuplicates; return q },
      update(values: Row) { call.op = 'update'; update = values; return q },
      then<T>(resolve: (value: ReturnType<typeof execute>) => T) { return Promise.resolve(execute()).then(resolve) },
    }
    return q
  } } as unknown as SupabaseClient
}
const session = client('session'), admin = client('admin')
const notice = (patch: Row = {}): Row => ({ id: uuid(20), recipient_id: STUDENT, org_id: uuid(30), actor_id: uuid(31), type: 'grade_published', title: 'ครูตรวจคะแนนแล้ว', body: 'ใบงาน', link: null, is_read: false, created_at: iso(-100), related_assignment_id: SOON, related_classroom_id: ROOM, ...patch })
beforeEach(() => {
  calls.length = 0; fail = ''
  tables = {
    notifications: [notice(), notice({ id: uuid(21), type: 'classroom_post' }), notice({ id: uuid(22), type: 'assignment_reminder' }), notice({ id: uuid(23), recipient_id: OTHER })],
    classroom_students: [{ student_id: STUDENT, classroom_id: ROOM }, { student_id: OTHER, classroom_id: ROOM2 }],
    classrooms: [{ id: ROOM, status: 'active', classroom_type: 'subject', name: 'ฟิสิกส์ 1' }, { id: ROOM2, status: 'active', classroom_type: 'subject', name: 'ห้องอื่น' }],
    assignment_classrooms: [{ classroom_id: ROOM, assignment_id: SOON, group_ids: null }, { classroom_id: ROOM, assignment_id: LATE, group_ids: [GROUP] }, { classroom_id: ROOM2, assignment_id: uuid(9), group_ids: null }],
    classroom_group_members: [{ student_id: STUDENT, classroom_id: ROOM, group_id: GROUP }], submissions: [], assignment_extensions: [],
    assignments: [SOON, LATE].map((id, i) => ({ id, org_id: uuid(30), title: 'ใบงาน', status: 'published', type: 'exercise', mode: 'online', start_at: null, due_at: iso(i ? -1000 : 86_400_000), end_at: iso(172_800_000) })),
  }
})
it('shows only grades and currently reached deadline notices, with no writes while reading', async () => {
  const result = await loadStudentBell(session, admin, STUDENT, NOW)
  expect(result).toHaveLength(3)
  expect(result.filter(row => row.actor_id === null).map(row => row.title)).toEqual(expect.arrayContaining(['งานใกล้ถึงกำหนดส่ง', 'เลยกำหนดส่งงานแล้ว']))
  expect(result.filter(row => row.actor_id === null).every(row => row.link?.endsWith('?tab=assignments'))).toBe(true)
  expect(calls.every(call => call.op === 'read')).toBe(true)
  expect(calls.filter(call => ['submissions', 'classroom_students', 'classroom_group_members', 'assignment_extensions'].includes(call.table)).every(call => call.filters.some(([key, value]) => key === 'student_id' && value === STUDENT))).toBe(true)
  expect(calls.find(call => call.table === 'assignments')!.filters).toContainEqual(['id', [SOON, LATE]])
})
it('suppresses completed work even when a newer retry is in progress', async () => {
  tables.submissions = [{ student_id: STUDENT, assignment_id: SOON, status: 'submitted' }, { student_id: STUDENT, assignment_id: SOON, status: 'in_progress' }]
  expect((await loadStudentBell(session, admin, STUDENT, NOW)).filter(row => row.actor_id === null)).toHaveLength(1)
})
it('ignores another student\'s hand-in and excludes groups the recipient does not belong to', async () => {
  tables.submissions = [{ student_id: OTHER, assignment_id: SOON, status: 'graded' }]
  tables.classroom_group_members = []
  const notices = (await loadStudentBell(session, admin, STUDENT, NOW)).filter(row => row.actor_id === null)
  expect(notices.map(row => row.related_assignment_id)).toEqual([SOON])
  tables.classroom_students.push({ student_id: STUDENT, classroom_id: ROOM2 })
  tables.assignment_classrooms.push({ classroom_id: ROOM2, assignment_id: LATE, group_ids: null })
  const multiRoom = (await loadStudentBell(session, admin, STUDENT, NOW)).find(row => row.related_assignment_id === LATE)!
  expect(multiRoom.link).toBe(`/classrooms/${ROOM2}?tab=assignments`)
})
it('keeps read receipts stable and a new overdue phase unread', async () => {
  const soon = (await loadStudentBell(session, admin, STUDENT, NOW)).find(row => row.related_assignment_id === SOON && row.actor_id === null)!
  await saveDeadlineReadReceipts(admin, [soon])
  expect((await loadStudentBell(session, admin, STUDENT, NOW)).find(row => row.id === soon.id)?.is_read).toBe(true)
  const overdue = (await loadStudentBell(session, admin, STUDENT, NOW + 86_400_001)).find(row => row.related_assignment_id === SOON && row.actor_id === null)!
  expect(overdue.id).not.toBe(soon.id); expect(overdue.is_read).toBe(false)
  expect(tables.notifications.filter(row => row.type === 'classroom_post')[0].is_read).toBe(false)
})
it('drops outdated reminders after a personal extension or loss of membership', async () => {
  tables.assignment_extensions = [{ student_id: STUDENT, assignment_id: LATE, extended_due_at: iso(172_800_000), extended_end_at: iso(259_200_000) }]
  expect((await loadStudentBell(session, admin, STUDENT, NOW)).filter(row => row.actor_id === null)).toHaveLength(1)
  tables.classroom_students = []
  expect((await loadStudentBell(session, admin, STUDENT, NOW)).map(row => row.type)).toEqual(['grade_published'])
})
it.each(['notifications', 'classroom_students', 'classrooms', 'assignment_classrooms', 'classroom_group_members', 'submissions', 'assignments', 'assignment_extensions'])('fails explicitly on a %s error', async table => {
  fail = table
  await expect(loadStudentBell(session, admin, STUDENT, NOW)).rejects.toThrow('โหลดการแจ้งเตือนไม่สำเร็จ')
})
it('binds receipt IDs to recipient, deadline and phase', () => {
  const id = deadlineBellId(STUDENT, SOON, iso(1), 'due-soon')
  expect(id).toMatch(/^[0-9a-f-]{36}$/)
  expect(new Set([id, deadlineBellId(OTHER, SOON, iso(1), 'due-soon'), deadlineBellId(STUDENT, SOON, iso(2), 'due-soon'), deadlineBellId(STUDENT, SOON, iso(1), 'overdue')]).size).toBe(4)
})

it('never overwrites a foreign recipient row that conflicts with a deterministic receipt ID', async () => {
  const notice = (await loadStudentBell(session, admin, STUDENT, NOW)).find(row => row.actor_id === null)!
  tables.notifications.push({ ...notice, recipient_id: OTHER, is_read: false })
  await expect(saveDeadlineReadReceipts(admin, [notice])).rejects.toThrow('บันทึกการอ่านไม่สำเร็จ')
  expect(tables.notifications.find(row => row.id === notice.id)).toMatchObject({ recipient_id: OTHER, is_read: false })
})
