import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createAdminClient: vi.fn(), canManageAssignment: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/auth/assignment-access', () => ({ canManageAssignment: mocks.canManageAssignment }))
import { acknowledgeAssignmentReminder, getPendingAssignmentReminders, notifyNonSubmitters } from './notifications'

type Row = Record<string, unknown>
type Filter = { op: 'eq' | 'in' | 'gte'; field: string; value: unknown }
type Query = {
  client: 'session' | 'admin'; table: string; operation: 'read' | 'insert' | 'update';
  columns: string; filters: Filter[]; orders: { field: string; ascending: boolean }[];
  range: [number, number] | null; values: Row[]; single: boolean;
}
const uuid = (n: number, family = 1) => `${String(family).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`
const TEACHER = uuid(1), OTHER_TEACHER = uuid(2), STUDENT = uuid(1, 2), STUDENT_B = uuid(2, 2), STUDENT_C = uuid(3, 2)
const ASSIGNMENT = uuid(1, 3), OTHER_ASSIGNMENT = uuid(2, 3), ROOM = uuid(1, 4), OTHER_ROOM = uuid(2, 4)
const GROUP = uuid(1, 5), OTHER_GROUP = uuid(2, 5), ORG = uuid(1, 6), ACTOR_OTHER_ORG = uuid(2, 6)
const NOTICE = uuid(1, 7), NEW_NOTICE = uuid(2, 7)
const NOW = '2026-10-20T12:00:00.000Z'
let tables: Record<string, Row[]>
let actor: string | null
let authError: unknown
let fail: ((query: Query) => boolean) | undefined
let omitInsertReceipt: boolean
let calls: Query[]

function client(kind: 'session' | 'admin') {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: actor ? { id: actor } : null }, error: authError })) },
    from: (table: string) => {
      const query: Query = { client: kind, table, operation: 'read', columns: '*', filters: [], orders: [], range: null, values: [], single: false }
      const execute = () => {
        calls.push(structuredClone(query))
        if (fail?.(query)) return { data: null, error: { message: 'private database detail' } }
        const matches = (row: Row) => query.filters.every(filter => {
          const value = row[filter.field]
          return filter.op === 'eq' ? value === filter.value : filter.op === 'in'
            ? (filter.value as unknown[]).includes(value) : String(value) >= String(filter.value)
        })
        let rows: Row[]
        if (query.operation === 'insert') {
          rows = query.values.map((row, i) => ({ id: uuid((tables[table]?.length ?? 0) + i + 1, 9), created_at: NOW, is_read: false, ...row }))
          tables[table] = [...(tables[table] ?? []), ...rows]
          if (omitInsertReceipt) rows = []
        } else {
          // Production hardening intentionally denies direct student SELECT
          // on assignments to protect legacy plaintext access_code values.
          const studentAssignmentsDenied = kind === 'session' && table === 'assignments'
            && tables.users.some(row => row.id === actor && row.role === 'student')
          rows = studentAssignmentsDenied ? [] : (tables[table] ?? []).filter(matches)
          if (query.operation === 'update') for (const row of rows) Object.assign(row, query.values[0])
          for (const order of [...query.orders].reverse()) rows.sort((a, b) => String(a[order.field]).localeCompare(String(b[order.field])) * (order.ascending ? 1 : -1))
          // Model PostgREST's maximum response size, even if a caller forgets paging.
          const [from, to] = query.range ?? [0, 999]
          rows = rows.slice(from, Math.min(to + 1, from + 1000))
        }
        const columns = query.columns.split(',').map(column => column.trim())
        const projected = rows.map(row => columns[0] === '*' ? { ...row } : Object.fromEntries(columns.map(column => [column, row[column]])))
        return { data: query.single ? projected[0] ?? null : projected, error: null }
      }
      const builder = {
        select: (columns: string) => { query.columns = columns; return builder },
        eq: (field: string, value: unknown) => { query.filters.push({ op: 'eq', field, value }); return builder },
        in: (field: string, value: unknown[]) => { query.filters.push({ op: 'in', field, value }); return builder },
        gte: (field: string, value: unknown) => { query.filters.push({ op: 'gte', field, value }); return builder },
        order: (field: string, options?: { ascending?: boolean }) => { query.orders.push({ field, ascending: options?.ascending ?? true }); return builder },
        range: (from: number, to: number) => { query.range = [from, to]; return builder },
        insert: (values: Row[]) => { query.operation = 'insert'; query.values = values; return builder },
        update: (value: Row) => { query.operation = 'update'; query.values = [value]; return builder },
        maybeSingle: async () => { query.single = true; return execute() },
        then: <T>(resolve: (result: ReturnType<typeof execute>) => T) => Promise.resolve(execute()).then(resolve),
      }
      return builder
    },
  }
}

function notification(change: Row = {}): Row {
  return {
    id: NOTICE, recipient_id: STUDENT, actor_id: TEACHER, type: 'assignment_reminder',
    related_assignment_id: ASSIGNMENT, related_classroom_id: ROOM, is_read: false, created_at: NOW,
    title: 'stored title is not authority', body: 'private untrusted body', link: 'https://untrusted.example', ...change,
  }
}
function useStudent() { actor = STUDENT; tables.notifications = [notification()] }
function inserted() { return calls.filter(query => query.operation === 'insert').flatMap(query => query.values) }
function hasFilter(query: Query, field: string, value: unknown, op = 'eq') {
  return query.filters.some(filter => filter.op === op && filter.field === field && JSON.stringify(filter.value) === JSON.stringify(value))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
  actor = TEACHER; authError = null; fail = undefined; omitInsertReceipt = false; calls = []
  tables = {
    users: [
      { id: TEACHER, status: 'active', role: 'teacher', full_name: 'ครูเจ้าของงาน', org_id: ACTOR_OTHER_ORG, email: 'private@teacher.test' },
      ...[STUDENT, STUDENT_B, STUDENT_C].map(id => ({ id, status: 'active', role: 'student', full_name: 'นักเรียน', email: 'private@student.test' })),
    ],
    assignments: [{ id: ASSIGNMENT, title: 'งานที่มอบหมาย', created_by: TEACHER, org_id: ORG, status: 'published', mode: 'online', type: 'exercise', end_at: '2026-10-30T12:00:00Z' }],
    classrooms: [{ id: ROOM, teacher_id: TEACHER, status: 'active', name: 'ห้องฟิสิกส์' }],
    assignment_classrooms: [{ assignment_id: ASSIGNMENT, classroom_id: ROOM, group_ids: null }],
    classroom_students: [STUDENT, STUDENT_B, STUDENT_C].map(student_id => ({ student_id, classroom_id: ROOM })),
    classroom_group_members: [], classroom_co_teachers: [], notifications: [], submissions: [],
  }
  mocks.createClient.mockImplementation(async () => client('session'))
  mocks.createAdminClient.mockImplementation(() => client('admin'))
  mocks.canManageAssignment.mockResolvedValue(true)
})
afterEach(() => { vi.useRealTimers() })

describe('teacher reminder delivery', () => {
  it('rejects invalid resource IDs before opening a client', async () => {
    expect(await notifyNonSubmitters('invalid', ROOM)).toHaveProperty('error')
    expect(await notifyNonSubmitters(ASSIGNMENT, 'invalid')).toHaveProperty('error')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it.each(['missing', 'auth-error', 'inactive', 'student', 'guardian'])('requires a verified active teaching account (%s)', async reason => {
    if (reason === 'missing') actor = null
    if (reason === 'auth-error') authError = new Error('expired')
    if (reason === 'inactive') tables.users[0].status = 'suspended'
    if (reason === 'student' || reason === 'guardian') tables.users[0].role = reason
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toHaveProperty('error')
    expect(mocks.canManageAssignment).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(inserted()).toEqual([])
  })

  it('requires exact assignment management, beyond a SELECT-visible assignment', async () => {
    mocks.canManageAssignment.mockResolvedValue(false)
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toHaveProperty('error')
    expect(mocks.canManageAssignment).toHaveBeenCalledWith(ASSIGNMENT, TEACHER)
    expect(calls.every(query => query.table === 'users')).toBe(true)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it.each(['unlinked', 'archived-room', 'foreign-owner', 'view-only'])('requires the linked active classroom and exact owner/manage role (%s)', async reason => {
    if (reason === 'unlinked') tables.assignment_classrooms = []
    if (reason === 'archived-room') tables.classrooms[0].status = 'archived'
    if (reason === 'foreign-owner' || reason === 'view-only') tables.classrooms[0].teacher_id = OTHER_TEACHER
    if (reason === 'view-only') tables.classroom_co_teachers = [{ classroom_id: ROOM, user_id: TEACHER, permission: 'view' }]
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toHaveProperty('error')
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(inserted()).toEqual([])
  })

  it.each(['admin', 'manage'])('allows an assignment manager with %s authority in the exact target classroom', async permission => {
    tables.classrooms[0].teacher_id = OTHER_TEACHER
    tables.classroom_co_teachers = [{ classroom_id: ROOM, user_id: TEACHER, permission }]
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toEqual({ success: true, notified: 3 })
  })

  it('does not borrow co-teacher management from a different classroom', async () => {
    tables.classrooms[0].teacher_id = OTHER_TEACHER
    tables.classroom_co_teachers = [{ classroom_id: OTHER_ROOM, user_id: TEACHER, permission: 'manage' }]
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toHaveProperty('error')
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it.each([{ status: 'draft' }, { status: 'closed' }, { mode: 'offline' }, { type: 'survey' }])('does not notify for an ineligible assignment (%j)', async change => {
    Object.assign(tables.assignments[0], change)
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toHaveProperty('error')
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('uses the assignment organization and exact canonical assignment/room, never the actor first organization', async () => {
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toEqual({ success: true, notified: 3 })
    expect(inserted()).toEqual([STUDENT, STUDENT_B, STUDENT_C].map(recipient_id => ({
      recipient_id, org_id: ORG, actor_id: TEACHER, type: 'assignment_reminder',
      title: 'อย่าลืมส่ง "งานที่มอบหมาย"', body: 'ครูแจ้งเตือนงานที่ยังไม่ได้ส่ง คุณกลับมาทำต่อได้',
      link: `/assignments/${ASSIGNMENT}/take`, related_assignment_id: ASSIGNMENT, related_classroom_id: ROOM,
    })))
  })

  it('includes never-started and in-progress students while excluding any finished attempt even if zero/pending or a newer attempt is unfinished', async () => {
    tables.submissions = [
      { id: uuid(1, 8), assignment_id: ASSIGNMENT, student_id: STUDENT, status: 'submitted', total_score: 0 },
      { id: uuid(2, 8), assignment_id: ASSIGNMENT, student_id: STUDENT, status: 'in_progress' },
      { id: uuid(3, 8), assignment_id: ASSIGNMENT, student_id: STUDENT_B, status: 'graded', total_score: 0 },
      { id: uuid(4, 8), assignment_id: ASSIGNMENT, student_id: STUDENT_C, status: 'in_progress' },
    ]
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toEqual({ success: true, notified: 1 })
    expect(inserted().map(row => row.recipient_id)).toEqual([STUDENT_C])
  })

  it('never excludes a student because they submitted a different assignment', async () => {
    tables.submissions = [{ id: uuid(1, 8), assignment_id: OTHER_ASSIGNMENT, student_id: STUDENT, status: 'submitted' }]
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toEqual({ success: true, notified: 3 })
  })

  it('limits delivery to current active students and groups reached by this assignment link', async () => {
    tables.assignment_classrooms[0].group_ids = [GROUP]
    tables.classroom_group_members = [
      { classroom_id: ROOM, student_id: STUDENT, group_id: GROUP },
      { classroom_id: ROOM, student_id: STUDENT_B, group_id: OTHER_GROUP },
      { classroom_id: OTHER_ROOM, student_id: STUDENT_C, group_id: GROUP },
    ]
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toEqual({ success: true, notified: 1 })
    expect(inserted().map(row => row.recipient_id)).toEqual([STUDENT])
  })

  it('does not notify inactive accounts, teachers on the roster, or students outside the exact room', async () => {
    tables.users[2].status = 'suspended'
    tables.users[3].role = 'teacher'
    tables.classroom_students.push({ student_id: OTHER_TEACHER, classroom_id: OTHER_ROOM })
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toEqual({ success: true, notified: 1 })
  })

  it('preserves 24h unread dedupe while read/older and unrelated notices do not block explicit reminders', async () => {
    tables.notifications = [
      notification(),
      notification({ id: uuid(3, 7), recipient_id: STUDENT_B, is_read: true }),
      notification({ id: uuid(4, 7), recipient_id: STUDENT_C, created_at: '2026-10-19T11:59:59.000Z' }),
      notification({ id: uuid(5, 7), recipient_id: STUDENT_C, related_assignment_id: OTHER_ASSIGNMENT }),
    ]
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toEqual({ success: true, notified: 2 })
    expect(inserted().map(row => row.recipient_id)).toEqual([STUDENT_B, STUDENT_C])
  })

  it.each(['users', 'assignments', 'classrooms', 'assignment_classrooms', 'classroom_students', 'notifications', 'submissions'])('fails closed and hides database detail on a %s error', async table => {
    fail = query => query.table === table && query.operation === 'read'
    const result = await notifyNonSubmitters(ASSIGNMENT, ROOM)
    expect(result).toHaveProperty('error')
    expect(JSON.stringify(result)).not.toContain('private database detail')
    expect(inserted()).toEqual([])
  })

  it('fails closed on group membership errors or malformed targeting', async () => {
    tables.assignment_classrooms[0].group_ids = [GROUP]
    fail = query => query.table === 'classroom_group_members'
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toHaveProperty('error')
    expect(inserted()).toEqual([])
    fail = undefined
    tables.assignment_classrooms[0].group_ids = ['malformed']
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toHaveProperty('error')
    expect(inserted()).toEqual([])
  })

  it('reads a roster beyond 1,000 rows, bounds every ID filter, and batches inserts', async () => {
    const ids = Array.from({ length: 1003 }, (_, i) => uuid(i + 1, 2))
    tables.classroom_students = ids.map(student_id => ({ student_id, classroom_id: ROOM }))
    tables.users.push(...ids.slice(3).map(id => ({ id, role: 'student', status: 'active' })))
    // More than a page of attempts for one student must not conceal the next
    // student's only submitted attempt in a chunk with the same first ID.
    tables.submissions = Array.from({ length: 1000 }, (_, i) => ({ id: uuid(i + 1, 8), assignment_id: ASSIGNMENT, student_id: STUDENT, status: 'submitted' }))
    tables.submissions.push({ id: uuid(1001, 8), assignment_id: ASSIGNMENT, student_id: STUDENT_B, status: 'graded' })
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toEqual({ success: true, notified: 1001 })
    expect(inserted().some(row => row.recipient_id === STUDENT || row.recipient_id === STUDENT_B)).toBe(false)
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'classroom_students', range: [1000, 1999] }),
      expect.objectContaining({ table: 'submissions', range: [1000, 1999] }),
    ]))
    expect(calls.flatMap(query => query.filters.filter(filter => filter.op === 'in')).every(filter => (filter.value as unknown[]).length <= 200)).toBe(true)
    expect(calls.filter(query => query.operation === 'insert').every(query => query.values.length <= 200)).toBe(true)
  })

  it('does not report success on a later page failure or an absent insert receipt', async () => {
    tables.classroom_students = Array.from({ length: 1001 }, (_, i) => ({ student_id: uuid(i + 1, 2), classroom_id: ROOM }))
    fail = query => query.table === 'classroom_students' && query.range?.[0] === 1000
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toHaveProperty('error')
    expect(inserted()).toEqual([])
    fail = undefined; tables.classroom_students = [{ student_id: STUDENT, classroom_id: ROOM }]; omitInsertReceipt = true
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toHaveProperty('error')
  })

  it('reports confirmed partial delivery without claiming the remaining batch succeeded', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => uuid(i + 1, 2))
    tables.classroom_students = ids.map(student_id => ({ student_id, classroom_id: ROOM }))
    tables.users.push(...ids.slice(3).map(id => ({ id, role: 'student', status: 'active' })))
    let batch = 0
    fail = query => query.operation === 'insert' && ++batch === 2
    expect(await notifyNonSubmitters(ASSIGNMENT, ROOM)).toEqual({ error: 'แจ้งเตือนสำเร็จแล้ว 200 คน แต่ยังส่งไม่ครบ กรุณาลองใหม่' })
    expect(tables.notifications).toHaveLength(200)
  })
})

describe('student reminder inbox', () => {
  it('still loads safe metadata when student assignment SELECT is empty, using admin only after canonical roster/link/group authorization', async () => {
    useStudent()
    tables.assignments[0].access_code = 'private plaintext code'
    tables.assignments[0].access_code_hash = 'private hash'
    const sessionRead = await client('session').from('assignments').select('id, title').eq('id', ASSIGNMENT).maybeSingle()
    expect(sessionRead).toEqual({ data: null, error: null })
    calls = []
    const result = await getPendingAssignmentReminders()
    expect(result.reminders).toHaveLength(1)
    expect(result.reminders[0].assignmentTitle).toBe('งานที่มอบหมาย')
    const assignmentRead = calls.findIndex(query => query.table === 'assignments')
    expect(assignmentRead).toBeGreaterThan(0)
    expect(calls[assignmentRead]).toMatchObject({ client: 'admin', columns: 'id, title, end_at, created_by' })
    expect(hasFilter(calls[assignmentRead], 'id', [ASSIGNMENT], 'in')).toBe(true)
    expect(hasFilter(calls[assignmentRead], 'status', 'published')).toBe(true)
    expect(hasFilter(calls[assignmentRead], 'mode', 'online')).toBe(true)
    expect(hasFilter(calls[assignmentRead], 'type', ['exercise', 'exam'], 'in')).toBe(true)
    for (const table of ['classroom_students', 'classrooms', 'assignment_classrooms']) {
      expect(calls.findIndex(query => query.client === 'session' && query.table === table)).toBeLessThan(assignmentRead)
    }
    expect(calls.some(query => query.table === 'assignments' && query.client === 'session')).toBe(false)
    expect(JSON.stringify(result)).not.toContain('private')
  })

  it('returns allowlisted canonical metadata and derives its safe existing-entry href', async () => {
    useStudent()
    tables.notifications[0].actor_id = OTHER_TEACHER
    tables.users.push({ id: OTHER_TEACHER, full_name: 'untrusted actor name', email: 'private@other.test' })
    tables.submissions = [{ id: uuid(1, 8), assignment_id: ASSIGNMENT, student_id: STUDENT, status: 'in_progress' }]
    expect(await getPendingAssignmentReminders()).toEqual({ reminders: [{
      id: NOTICE, assignmentId: ASSIGNMENT, classroomId: ROOM, assignmentTitle: 'งานที่มอบหมาย',
      classroomName: 'ห้องฟิสิกส์', teacherName: 'ครูเจ้าของงาน', createdAt: NOW,
      endAt: '2026-10-30T12:00:00Z', href: `/assignments/${ASSIGNMENT}/take`, inProgress: true,
    }] })
    const authors = calls.find(query => query.client === 'admin' && query.table === 'users')!
    expect(hasFilter(authors, 'id', [TEACHER], 'in')).toBe(true)
    expect(authors.columns).toBe('id, full_name')
    expect(calls.some(query => query.operation !== 'read')).toBe(false)
  })

  it.each(['missing', 'inactive', 'teacher'])('requires the verified active student role (%s)', async reason => {
    useStudent()
    if (reason === 'missing') actor = null
    if (reason === 'inactive') tables.users[1].status = 'suspended'
    if (reason === 'teacher') actor = TEACHER
    expect(await getPendingAssignmentReminders()).toHaveProperty('error')
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('isolates recipient/type and excludes other students or unrelated notifications', async () => {
    useStudent()
    tables.notifications = [notification({ recipient_id: STUDENT_B }), notification({ type: 'grade_published' })]
    expect(await getPendingAssignmentReminders()).toEqual({ reminders: [] })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    const history = calls.find(query => query.table === 'notifications')!
    expect(hasFilter(history, 'recipient_id', STUDENT)).toBe(true)
    expect(hasFilter(history, 'type', 'assignment_reminder')).toBe(true)
  })

  it.each(['foreign-room', 'unlinked-assignment', 'archived-room', 'no-roster', 'malformed-id'])('rechecks canonical roster and exact link before privileged reads (%s)', async reason => {
    useStudent()
    if (reason === 'foreign-room') tables.notifications[0].related_classroom_id = OTHER_ROOM
    if (reason === 'unlinked-assignment') tables.notifications[0].related_assignment_id = OTHER_ASSIGNMENT
    if (reason === 'archived-room') tables.classrooms[0].status = 'archived'
    if (reason === 'no-roster') tables.classroom_students = []
    if (reason === 'malformed-id') tables.notifications[0].related_assignment_id = 'invalid'
    expect(await getPendingAssignmentReminders()).toEqual({ reminders: [] })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('requires current group reach and reads only the verified student group in verified classrooms', async () => {
    useStudent()
    tables.assignment_classrooms[0].group_ids = [GROUP]
    tables.classroom_group_members = [
      { classroom_id: ROOM, student_id: STUDENT_B, group_id: GROUP },
      { classroom_id: OTHER_ROOM, student_id: STUDENT, group_id: GROUP },
      { classroom_id: ROOM, student_id: STUDENT, group_id: OTHER_GROUP },
    ]
    expect(await getPendingAssignmentReminders()).toEqual({ reminders: [] })
    const groups = calls.find(query => query.client === 'admin' && query.table === 'classroom_group_members')!
    expect(hasFilter(groups, 'student_id', STUDENT)).toBe(true)
    expect(hasFilter(groups, 'classroom_id', [ROOM], 'in')).toBe(true)
    expect(calls.some(query => query.client === 'admin' && ['assignments', 'users'].includes(query.table))).toBe(false)
    tables.classroom_group_members[2].group_id = GROUP
    expect((await getPendingAssignmentReminders()).reminders).toHaveLength(1)
  })

  it.each([{ status: 'draft' }, { status: 'closed' }, { mode: 'offline' }, { type: 'survey' }])('does not show ineligible canonical assignments (%j)', async change => {
    useStudent(); Object.assign(tables.assignments[0], change)
    expect(await getPendingAssignmentReminders()).toEqual({ reminders: [] })
    expect(calls.some(query => query.client === 'admin' && query.table === 'users')).toBe(false)
  })

  it.each(['submitted', 'graded'])('fresh %s attempts remove an older reminder even when a newer attempt remains in progress', async status => {
    useStudent()
    tables.submissions = [
      { id: uuid(1, 8), assignment_id: ASSIGNMENT, student_id: STUDENT, status },
      { id: uuid(2, 8), assignment_id: ASSIGNMENT, student_id: STUDENT, status: 'in_progress' },
    ]
    expect(await getPendingAssignmentReminders()).toEqual({ reminders: [] })
  })

  it('does not use other students attempts or another assignment to suppress a never-started reminder', async () => {
    useStudent()
    tables.submissions = [
      { id: uuid(1, 8), assignment_id: ASSIGNMENT, student_id: STUDENT_B, status: 'submitted' },
      { id: uuid(2, 8), assignment_id: OTHER_ASSIGNMENT, student_id: STUDENT, status: 'graded' },
    ]
    expect((await getPendingAssignmentReminders()).reminders[0].inProgress).toBe(false)
  })

  it('latest acknowledgement suppresses old duplicates while a later explicit notification reopens the assignment', async () => {
    useStudent()
    tables.notifications.push(notification({ id: NEW_NOTICE, created_at: '2026-10-20T13:00:00Z' }))
    expect((await getPendingAssignmentReminders()).reminders.map(row => row.id)).toEqual([NEW_NOTICE])
    expect(await acknowledgeAssignmentReminder(NEW_NOTICE)).toEqual({ success: true })
    expect(await getPendingAssignmentReminders()).toEqual({ reminders: [] })
    tables.notifications.push(notification({ id: uuid(3, 7), created_at: '2026-10-21T13:00:00Z' }))
    expect((await getPendingAssignmentReminders()).reminders.map(row => row.id)).toEqual([uuid(3, 7)])
    expect(tables.notifications[0].is_read).toBe(false)
  })

  it.each(['notifications', 'classroom_students', 'classrooms', 'assignment_classrooms', 'submissions', 'users'])('returns an explicit error on a %s read failure instead of implying there are no reminders', async table => {
    useStudent()
    fail = query => query.table === table
    const result = await getPendingAssignmentReminders()
    expect(result.reminders).toEqual([])
    expect(result).toHaveProperty('error')
    expect(JSON.stringify(result)).not.toContain('private database detail')
  })

  it('fails closed on group-query errors and malformed canonical group targeting', async () => {
    useStudent(); tables.assignment_classrooms[0].group_ids = [GROUP]
    fail = query => query.table === 'classroom_group_members'
    expect(await getPendingAssignmentReminders()).toHaveProperty('error')
    fail = undefined; tables.assignment_classrooms[0].group_ids = ['invalid']
    expect(await getPendingAssignmentReminders()).toHaveProperty('error')
  })

  it('paginates owned history beyond a read-only first page and rechecks all finished attempts', async () => {
    useStudent()
    tables.notifications = Array.from({ length: 1000 }, (_, i) => notification({ id: uuid(i + 1, 7), related_assignment_id: OTHER_ASSIGNMENT, is_read: true, created_at: '2026-10-21T12:00:00Z' }))
    tables.notifications.push(notification({ id: uuid(1001, 7) }))
    tables.submissions = Array.from({ length: 1000 }, (_, i) => ({ id: uuid(i + 1, 8), assignment_id: ASSIGNMENT, student_id: STUDENT, status: 'in_progress' }))
    tables.submissions.push({ id: uuid(1001, 8), assignment_id: ASSIGNMENT, student_id: STUDENT, status: 'submitted' })
    expect(await getPendingAssignmentReminders()).toEqual({ reminders: [] })
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'notifications', range: [1000, 1999] }),
      expect.objectContaining({ table: 'submissions', range: [1000, 1999] }),
    ]))
  })

  it('bounds both assignment and classroom IN filters across a large valid inbox', async () => {
    useStudent()
    const count = 201
    tables.notifications = Array.from({ length: count }, (_, i) => notification({ id: uuid(i + 1, 7), related_assignment_id: uuid(i + 1, 3), related_classroom_id: uuid(i + 1, 4) }))
    tables.classroom_students = Array.from({ length: count }, (_, i) => ({ student_id: STUDENT, classroom_id: uuid(i + 1, 4) }))
    tables.classrooms = Array.from({ length: count }, (_, i) => ({ id: uuid(i + 1, 4), name: 'ห้อง', status: 'active' }))
    tables.assignment_classrooms = Array.from({ length: count }, (_, i) => ({ assignment_id: uuid(i + 1, 3), classroom_id: uuid(i + 1, 4), group_ids: null }))
    tables.assignments = Array.from({ length: count }, (_, i) => ({ ...tables.assignments[0], id: uuid(i + 1, 3) }))
    expect((await getPendingAssignmentReminders()).reminders).toHaveLength(count)
    expect(calls.flatMap(query => query.filters.filter(filter => filter.op === 'in')).every(filter => (filter.value as unknown[]).length <= 200)).toBe(true)
  })
})

describe('reminder acknowledgement', () => {
  it('changes only is_read for the exact owned reminder ID/type and returns an exact receipt', async () => {
    useStudent()
    const before = structuredClone(tables.notifications[0])
    expect(await acknowledgeAssignmentReminder(NOTICE)).toEqual({ success: true })
    expect(tables.notifications[0]).toEqual({ ...before, is_read: true })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    const query = calls.find(query => query.operation === 'update')!
    expect(query.values).toEqual([{ is_read: true }])
    expect(hasFilter(query, 'recipient_id', STUDENT)).toBe(true)
    expect(hasFilter(query, 'type', 'assignment_reminder')).toBe(true)
    expect(hasFilter(query, 'id', NOTICE)).toBe(true)
    expect(await acknowledgeAssignmentReminder(NOTICE)).toEqual({ success: true })
  })

  it.each(['foreign-recipient', 'other-type', 'missing'])('does not acknowledge a non-owned/missing reminder (%s)', async reason => {
    useStudent()
    if (reason === 'foreign-recipient') tables.notifications[0].recipient_id = STUDENT_B
    if (reason === 'other-type') tables.notifications[0].type = 'grade_published'
    if (reason === 'missing') tables.notifications = []
    expect(await acknowledgeAssignmentReminder(NOTICE)).toHaveProperty('error')
    expect(tables.notifications.every(row => row.is_read === false)).toBe(true)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('validates IDs before clients and fails closed on role or update errors', async () => {
    expect(await acknowledgeAssignmentReminder('invalid')).toHaveProperty('error')
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(await acknowledgeAssignmentReminder(NOTICE)).toHaveProperty('error')
    useStudent(); fail = query => query.operation === 'update'
    expect(await acknowledgeAssignmentReminder(NOTICE)).toHaveProperty('error')
    expect(tables.notifications[0].is_read).toBe(false)
  })
})
