import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ session: vi.fn(), admin: vi.fn(), load: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }))
vi.mock('@/lib/student-bell.server', () => ({ loadStudentBell: m.load, saveDeadlineReadReceipts: m.save }))
vi.mock('server-only', () => ({}))
import { getMyNotifications, getUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from './actions/notifications'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const USER = id(1), GRADE = id(2), DEADLINE = id(3), POST = id(4)
let actor: string | null, role: string, active: boolean
let calls: { table: string; op: string; filters: [string, unknown][] }[]
let stored: { id: string; recipient_id: string; type: string; is_read: boolean }[]
beforeEach(() => {
  vi.clearAllMocks(); actor = USER; role = 'student'; active = true; calls = []
  stored = [{ id: GRADE, recipient_id: USER, type: 'grade_published', is_read: false }, { id: POST, recipient_id: USER, type: 'classroom_post', is_read: false }]
  m.admin.mockReturnValue({ trusted: true }); m.save.mockResolvedValue(undefined)
  m.load.mockResolvedValue([{ ...stored[0], actor_id: id(10) }, { id: DEADLINE, recipient_id: USER, type: 'assignment_reminder', actor_id: null, is_read: false }])
  m.session.mockReturnValue({ auth: { getUser: async () => ({ data: { user: actor ? { id: actor } : null } }) }, from(table: string) {
    const call = { table, op: 'read', filters: [] as [string, unknown][] }
    const execute = () => {
      calls.push(call)
      if (table === 'users') return { data: { role, status: active ? 'active' : 'suspended' }, error: null }
      const rows = stored.filter(row => call.filters.every(([key, value]) => row[key as keyof typeof row] === value))
      if (call.op === 'update') rows.forEach(row => { row.is_read = true })
      return { data: rows, count: rows.length, error: null }
    }
    const q = { select: () => q, update: () => { call.op = 'update'; return q },
      eq(key: string, value: unknown) { call.filters.push([key, value]); return q }, order: () => q, limit: () => q,
      maybeSingle: async () => { const result = execute(); return { ...result, data: Array.isArray(result.data) ? result.data[0] : result.data } },
      then<T>(resolve: (value: ReturnType<typeof execute>) => T) { return Promise.resolve(execute()).then(resolve) },
    }; return q
  } })
})
it('uses the same student projection for badge and list', async () => {
  expect(await getUnreadNotificationCount()).toBe(2)
  expect((await getMyNotifications()).map(row => row.id)).toEqual([GRADE, DEADLINE])
})
it('marks visible grades and deadline receipts without acknowledging hidden post popups', async () => {
  expect(await markAllNotificationsRead()).toEqual({ success: true })
  expect(stored.find(row => row.id === GRADE)?.is_read).toBe(true)
  expect(stored.find(row => row.id === POST)?.is_read).toBe(false)
  expect(m.save.mock.calls[0][1].map((row: { id: string }) => row.id)).toEqual([DEADLINE])
  expect(calls.find(call => call.op === 'update')?.filters).toContainEqual(['type', 'grade_published'])
})
it('rebuilds authorized current notices before saving a deadline receipt and rejects unrelated IDs', async () => {
  expect(await markNotificationRead(DEADLINE)).toEqual({ success: true })
  expect(m.save).toHaveBeenCalledTimes(1)
  expect(await markNotificationRead(POST)).toHaveProperty('error')
  expect(m.save).toHaveBeenCalledTimes(1)
})
it('does not claim all-read success if saving fails', async () => {
  m.save.mockRejectedValue(new Error('unavailable'))
  expect(await markAllNotificationsRead()).toHaveProperty('error')
  expect(stored.every(row => !row.is_read)).toBe(true)
})
it('does no privileged read before verified active student authorization', async () => {
  actor = null
  expect(await getUnreadNotificationCount()).toBe(0)
  actor = USER; active = false
  expect(await getMyNotifications()).toEqual([])
  expect(m.admin).not.toHaveBeenCalled(); expect(m.load).not.toHaveBeenCalled()
})
it('keeps the teacher inbox and count on their existing recipient-scoped path', async () => {
  role = 'teacher'
  expect((await getMyNotifications()).map(row => row.id)).toEqual([GRADE, POST])
  expect(await getUnreadNotificationCount()).toBe(2)
  expect(m.load).not.toHaveBeenCalled()
})
