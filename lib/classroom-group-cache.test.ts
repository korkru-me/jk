import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ session: vi.fn(), admin: vi.fn(), revalidate: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/supabase/server', () => ({ createClient: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }))
import { createClassroomGroup, updateClassroomGroup, deleteClassroomGroup, reorderClassroomGroups, moveStudentsToGroup } from './actions/classroom-groups'

type Row = Record<string, unknown>
type WriteResult = { data: Row | Row[] | null; error: { code: string } | null }
const room = '10000000-0000-4000-8000-000000000001'
const firstGroup = '20000000-0000-4000-8000-000000000001'
const secondGroup = '20000000-0000-4000-8000-000000000002'
const students = ['30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002']
let authorized: boolean, writes: { table: string; operation: string; payload: unknown }[], writeResults: WriteResult[], sequence: string[]
function group(id: string, position: number) { return { id, classroom_id: room, name: `กลุ่ม ${position + 1}`, color: 'blue', position } }
function query(table: string, isAdmin: boolean) {
  let operation: string | null = null, payload: unknown
  const q = {
    select() { return q }, eq() { return q }, contains() { return q }, in() { return q }, order() { return q },
    single() { return q }, maybeSingle() { return q },
    insert(value: unknown) { operation = 'insert'; payload = value; return q },
    update(value: unknown) { operation = 'update'; payload = value; return q },
    delete() { operation = 'delete'; return q },
    upsert(value: unknown) { operation = 'upsert'; payload = value; return q },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      if (operation) {
        writes.push({ table, operation, payload }); sequence.push(`write:${operation}`)
        return Promise.resolve(writeResults.shift() ?? { data: group(firstGroup, 0), error: null }).then(resolve, reject)
      }
      const data = isAdmin && table === 'classrooms' ? { teacher_id: authorized ? 'teacher' : 'other-owner' }
        : isAdmin && table === 'classroom_co_teachers' ? null
          : table === 'classroom_groups' ? [group(firstGroup, 0), group(secondGroup, 1)] : []
      return Promise.resolve({ data, error: null }).then(resolve, reject)
    },
  }
  return q
}
beforeEach(() => {
  vi.clearAllMocks(); authorized = true; writes = []; writeResults = []; sequence = []
  m.session.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'teacher' } } }) }, from: (table: string) => query(table, false) })
  m.admin.mockReturnValue({ from: (table: string) => query(table, true) })
  m.revalidate.mockImplementation(() => sequence.push('invalidate'))
})
const operations = [
  ['create', () => createClassroomGroup(room, { name: 'กลุ่มใหม่', color: 'blue' })],
  ['update', () => updateClassroomGroup(room, firstGroup, { name: 'ชื่อใหม่' })],
  ['delete', () => deleteClassroomGroup(room, firstGroup)],
  ['reorder bulk', () => reorderClassroomGroups(room, [secondGroup, firstGroup])],
  ['assign students bulk', () => moveStudentsToGroup(room, students, firstGroup)],
  ['remove students bulk', () => moveStudentsToGroup(room, students, null)],
] as const

describe('classroom group mutation cache invalidation', () => {
  it.each(operations)('%s invalidates the exact classroom once after successful writes', async (name, action) => {
    if (name === 'delete') writeResults.push({ data: [{ id: firstGroup }], error: null })
    const result = await action()
    expect(result.ok).toBe(true)
    expect(m.revalidate).toHaveBeenCalledExactlyOnceWith(`/classrooms/${room}`)
    expect(sequence.at(-1)).toBe('invalidate')
    expect(writes).toHaveLength(name === 'reorder bulk' ? 2 : 1)
  })
  it.each(operations)('%s does not invalidate when a write fails', async (name, action) => {
    writeResults.push({ data: null, error: { code: '42501' } })
    expect((await action()).ok).toBe(false)
    expect(m.revalidate).not.toHaveBeenCalled()
    expect(writes).toHaveLength(name === 'reorder bulk' ? 2 : 1)
  })
  it.each(operations)('%s does not write or invalidate without the exact classroom relationship', async (_, action) => {
    authorized = false
    expect((await action()).ok).toBe(false)
    expect(writes).toEqual([]); expect(m.revalidate).not.toHaveBeenCalled()
  })
  it('stale update/delete results and invalid reorder membership do not invalidate', async () => {
    writeResults.push({ data: null, error: null })
    expect((await updateClassroomGroup(room, firstGroup, { name: 'ใหม่' })).ok).toBe(false)
    writeResults.push({ data: [], error: null })
    expect((await deleteClassroomGroup(room, firstGroup)).ok).toBe(false)
    expect((await reorderClassroomGroups(room, [firstGroup])).ok).toBe(false)
    expect(m.revalidate).not.toHaveBeenCalled()
  })
  it('input-validation failures never invalidate the classroom', async () => {
    expect((await createClassroomGroup(room, { name: '', color: 'blue' })).ok).toBe(false)
    expect((await moveStudentsToGroup(room, [], firstGroup)).ok).toBe(false)
    expect(m.revalidate).not.toHaveBeenCalled(); expect(writes).toEqual([])
  })
})
