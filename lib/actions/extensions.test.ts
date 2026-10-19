import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(),
  canManageAssignment: vi.fn(), revalidatePath: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/auth/assignment-access', () => ({ canManageAssignment: mocks.canManageAssignment }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
import { extendAssignmentDeadline, getAssignmentDeadlineExtension } from './extensions'

const ID = '10000000-0000-4000-8000-000000000001'
const USER = '20000000-0000-4000-8000-000000000001'
const ROOM_A = '30000000-0000-4000-8000-000000000001'
const ROOM_B = '30000000-0000-4000-8000-000000000002'
const LEGACY_ROOM = '30000000-0000-4000-8000-000000000003'
const END = '2026-10-20T09:00:00+00:00'
const UPDATED = '2026-10-19T09:00:00.123456+00:00'
const NEXT = '2026-10-21T09:00:00.000Z'
const RECEIPT_UPDATED = '2026-10-19T12:00:01.123456+00:00'
const input = { endAt: NEXT, expectedEndAt: END, expectedUpdatedAt: UPDATED }

let profile: { status: string; role: string } | null
let trustedSuperAdmin: { user_id: string } | null
let assignment: Record<string, unknown> | null
let links: { classroom_id: string }[]
let readErrorTable: string | null
const queries: Array<{ table: string; operation: string; value: unknown }> = []

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'))
  profile = { status: 'active', role: 'teacher' }
  trustedSuperAdmin = null
  assignment = {
    id: ID, title: 'งาน', classroom_id: LEGACY_ROOM, type: 'exercise', mode: 'online', status: 'published',
    start_at: '2026-10-18T09:00:00Z', due_at: null, late_bands: [], end_at: END,
    duration_minutes: 30, updated_at: UPDATED, secret: 'must not reach snapshot',
  }
  links = [{ classroom_id: ROOM_A }, { classroom_id: ROOM_B }, { classroom_id: ROOM_A }]
  readErrorTable = null
  queries.length = 0
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null })
  mocks.canManageAssignment.mockResolvedValue(true)
  mocks.rpc.mockResolvedValue({ data: { id: ID, end_at: NEXT, updated_at: RECEIPT_UPDATED }, error: null })
  mocks.from.mockImplementation((table: string) => {
    const result = () => ({
      data: table === 'users' ? profile : table === 'super_admins' ? trustedSuperAdmin : table === 'assignments' ? assignment : links,
      error: table === readErrorTable ? { code: 'XX000', message: 'private database detail' } : null,
    })
    const builder = {
      select: vi.fn((value: string) => { queries.push({ table, operation: 'select', value }); return builder }),
      eq: vi.fn((field: string, value: unknown) => { queries.push({ table, operation: 'eq', value: [field, value] }); return builder }),
      order: vi.fn(() => builder),
      range: vi.fn((from: number, to: number) => {
        queries.push({ table, operation: 'range', value: [from, to] })
        return Promise.resolve({ data: links.slice(from, to + 1), error: table === readErrorTable ? { code: 'XX000' } : null })
      }),
      maybeSingle: vi.fn(async () => result()),
    }
    return builder
  })
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc })
})
afterEach(() => { vi.useRealTimers() })

describe('assignment-wide deadline actions', () => {
  it('rejects invalid IDs and client field injection before reading any resource', async () => {
    expect(await getAssignmentDeadlineExtension('not-an-id')).toHaveProperty('error')
    expect(await extendAssignmentDeadline(ID, { ...input, studentId: USER } as typeof input)).toHaveProperty('error')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('requires verified Auth and active account before checking assignment authority', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await extendAssignmentDeadline(ID, input)).toHaveProperty('error')
    expect(mocks.from).not.toHaveBeenCalled()
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: { message: 'expired token' } })
    expect(await getAssignmentDeadlineExtension(ID)).toHaveProperty('error')
    expect(mocks.from).not.toHaveBeenCalled()
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null })
    profile = { status: 'suspended', role: 'teacher' }
    expect(await extendAssignmentDeadline(ID, input)).toHaveProperty('error')
    expect(mocks.canManageAssignment).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('requires a teacher/admin role even if a student were recorded as the assignment owner', async () => {
    profile = { status: 'active', role: 'student' }
    expect(await getAssignmentDeadlineExtension(ID)).toHaveProperty('error')
    expect(await extendAssignmentDeadline(ID, input)).toHaveProperty('error')
    expect(mocks.canManageAssignment).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(queries).toContainEqual({ table: 'super_admins', operation: 'eq', value: ['user_id', USER] })
  })

  it.each(['teacher', 'admin'])('accepts an active authorized %s', async role => {
    profile = { status: 'active', role }
    expect(await getAssignmentDeadlineExtension(ID)).toHaveProperty('snapshot')
    expect(mocks.from.mock.calls.some(([table]) => table === 'super_admins')).toBe(false)
  })

  it('accepts only an independently trusted active super admin outside the teaching roles', async () => {
    profile = { status: 'active', role: 'student' }
    trustedSuperAdmin = { user_id: USER }
    expect(await getAssignmentDeadlineExtension(ID)).toHaveProperty('snapshot')
    expect(mocks.canManageAssignment).toHaveBeenCalledWith(ID, USER)
    trustedSuperAdmin = null
    expect(await getAssignmentDeadlineExtension(ID)).toHaveProperty('error')
  })

  it('denies foreign, student, and view-only management before assignment metadata reads', async () => {
    mocks.canManageAssignment.mockResolvedValue(false)
    expect(await getAssignmentDeadlineExtension(ID)).toHaveProperty('error')
    expect(await extendAssignmentDeadline(ID, input)).toHaveProperty('error')
    expect(mocks.canManageAssignment).toHaveBeenCalledWith(ID, USER)
    expect(mocks.from.mock.calls.every(([table]) => table === 'users')).toBe(true)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns only allowlisted fresh metadata for the exact assignment', async () => {
    expect(await getAssignmentDeadlineExtension(ID)).toEqual({ snapshot: {
      id: ID, title: 'งาน', endAt: END, updatedAt: UPDATED,
      startAt: '2026-10-18T09:00:00Z', dueAt: null, durationMinutes: 30, linkedClassroomCount: 2,
    } })
    expect(queries).toContainEqual({ table: 'users', operation: 'eq', value: ['id', USER] })
    for (const table of ['assignments', 'assignment_classrooms']) {
      expect(queries).toContainEqual({ table, operation: 'eq', value: [table === 'assignments' ? 'id' : 'assignment_id', ID] })
    }
    expect(mocks.from.mock.calls.some(([table]) => ['submissions', 'assignment_extensions'].includes(table))).toBe(false)
  })

  it.each(['users', 'assignments', 'assignment_classrooms'])('fails closed on a %s read error without exposing SQL', async table => {
    readErrorTable = table
    const result = await extendAssignmentDeadline(ID, input)
    expect(result).toHaveProperty('error')
    expect(JSON.stringify(result)).not.toContain('private database detail')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    { status: 'closed' }, { status: 'draft' }, { mode: 'offline' },
    { type: 'survey' }, { end_at: null },
  ])('does not mutate an ineligible assignment (%j)', change => {
    assignment = { ...assignment, ...change }
    return expect(extendAssignmentDeadline(ID, input)).resolves.toHaveProperty('error').then(() => {
      expect(mocks.rpc).not.toHaveBeenCalled()
    })
  })

  it.each([{ expectedEndAt: '2026-10-20T09:01:00Z' }, { expectedUpdatedAt: '2026-10-19T09:00:00.123455+00:00' }])('rejects stale snapshots including sub-millisecond revisions (%j)', change => {
    return expect(extendAssignmentDeadline(ID, { ...input, ...change })).resolves.toEqual({
      error: 'เวลาปิดรับหรือการตั้งค่างานเปลี่ยนแล้ว กรุณาเปิดหน้าต่างขยายเวลาใหม่',
    }).then(() => expect(mocks.rpc).not.toHaveBeenCalled())
  })

  it('sends only canonical close and exact CAS values to one atomic RPC, preserving every other setting', async () => {
    const original = structuredClone(assignment)
    expect(await extendAssignmentDeadline(ID, { ...input, endAt: '2026-10-21T16:00:00+07:00' })).toEqual({
      success: true, endAt: NEXT, updatedAt: RECEIPT_UPDATED,
    })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('extend_assignment_deadline', {
      p_assignment_id: ID, p_end_at: NEXT, p_expected_end_at: END, p_expected_updated_at: UPDATED,
    })
    expect(assignment).toEqual(original)
    expect(mocks.from.mock.calls.some(([table]) => table === 'assignment_extensions')).toBe(false)
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/assignments/${ID}`, 'layout')
    for (const room of [ROOM_A, ROOM_B, LEGACY_ROOM]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/classrooms/${room}`, 'layout')
    }
    expect(mocks.revalidatePath.mock.calls.filter(([path]) => path === `/classrooms/${ROOM_A}`)).toHaveLength(1)
    for (const path of ['/assignments', '/dashboard']) expect(mocks.revalidatePath).toHaveBeenCalledWith(path)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/classrooms', 'layout')
  })

  it('reads every linked classroom past the PostgREST first-page limit', async () => {
    links = Array.from({ length: 1001 }, (_, index) => ({
      classroom_id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    }))
    expect(await getAssignmentDeadlineExtension(ID)).toHaveProperty('snapshot.linkedClassroomCount', 1001)
    expect(queries).toContainEqual({ table: 'assignment_classrooms', operation: 'range', value: [1000, 1999] })
  })

  it.each(['PGRST202', '42883'])('reports unavailable RPC %s with no unsafe direct-update fallback', async code => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: 'private table/function names' } })
    expect(await extendAssignmentDeadline(ID, input)).toEqual({ error: 'ระบบขยายเวลายังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง' })
    expect(log).toHaveBeenCalledWith('[assignment-deadline-extension] RPC unavailable', { code })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it.each(['40001', 'PT409', '42501', 'XX000'])('does not imply success or leak RPC details on %s', async code => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: 'private database detail' } })
    const result = await extendAssignmentDeadline(ID, input)
    expect(result).toHaveProperty('error')
    expect(JSON.stringify(result)).not.toContain('private database detail')
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([null, [], {}, { id: ROOM_A, end_at: NEXT, updated_at: RECEIPT_UPDATED }, { id: ID, end_at: END, updated_at: RECEIPT_UPDATED }])('requires an exact confirmed receipt, including zero-row CAS (%j)', async data => {
    mocks.rpc.mockResolvedValue({ data, error: null })
    expect(await extendAssignmentDeadline(ID, input)).toHaveProperty('error')
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('does not pretend a confirmed write failed when cache invalidation throws', async () => {
    mocks.revalidatePath.mockImplementation(() => { throw new Error('cache unavailable') })
    expect(await extendAssignmentDeadline(ID, input)).toEqual({
      success: true, endAt: NEXT, updatedAt: RECEIPT_UPDATED,
      warning: 'ขยายเวลาสำเร็จแล้ว แต่ยังรีเฟรชหน้าไม่สำเร็จ กรุณาโหลดหน้าใหม่',
    })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
