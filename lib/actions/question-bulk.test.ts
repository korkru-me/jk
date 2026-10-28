import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), release: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/storage-release', () => ({ releaseQuestionFiles: mocks.release }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { deleteSelectedQuestions } from './question-bulk'

const ID = '00000000-0000-4000-8000-000000000001'
const CHILD = '00000000-0000-4000-8000-000000000002'
const GROUP = '00000000-0000-4000-8000-000000000003'
const row = { id: ID, created_by: 'teacher', group_id: null, order_in_group: null }
const getUser = vi.fn()
const from = vi.fn()
type Result = { data: unknown[] | null; error: unknown }
let responses: Result[]
let queries: { calls: [string, unknown[]][] }[]
beforeEach(() => {
  vi.clearAllMocks()
  queries = []
  responses = [{ data: [row], error: null }, { data: [{ id: ID }], error: null }]
  getUser.mockResolvedValue({ data: { user: { id: 'teacher' } } })
  from.mockImplementation(() => {
    const calls: [string, unknown[]][] = []
    queries.push({ calls })
    const result = responses.shift()!
    const query: Record<string, unknown> = { then: (resolve: (value: Result) => void) => resolve(result) }
    for (const name of ['select', 'in', 'eq', 'order', 'range', 'delete', 'or']) {
      query[name] = (...args: unknown[]) => { calls.push([name, args]); return query }
    }
    return query
  })
  mocks.createClient.mockResolvedValue({ auth: { getUser }, from })
})

describe('deleteSelectedQuestions', () => {
  it('requires valid bounded UUID input before opening a database session', async () => {
    for (const ids of [[], ['invalid'], Array(101).fill(ID), null]) {
      expect(await deleteSelectedQuestions(ids as string[])).toHaveProperty('error')
    }
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('requires a signed-in session before reading or deleting', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await deleteSelectedQuestions([ID])).toEqual({ error: 'ไม่ได้เข้าสู่ระบบ' })
    expect(from).not.toHaveBeenCalled()
  })
  it('deduplicates input and scopes both read and delete to the session owner and ordinary questions', async () => {
    expect(await deleteSelectedQuestions([ID, ID])).toEqual({ deletedIds: [ID] })
    for (const query of queries) {
      expect(query.calls).toContainEqual(['eq', ['created_by', 'teacher']])
      expect(query.calls).toContainEqual(['eq', ['is_research_snapshot', false]])
    }
    expect(queries[0].calls).toContainEqual(['in', ['id', [ID]]])
    expect(queries[1].calls).toContainEqual(['or', [`id.in.(${ID})`]])
    expect(mocks.release.mock.calls[0][2]).toEqual([row])
    expect(mocks.revalidate).toHaveBeenCalledWith('/questions/sets')
  })
  it('fails the entire batch if any requested question is missing or inaccessible', async () => {
    expect(await deleteSelectedQuestions([ID, CHILD])).toHaveProperty('error')
    expect(queries).toHaveLength(1)
    expect(mocks.release).not.toHaveBeenCalled()
  })
  it('does not delete on a read failure or leak internal error details', async () => {
    responses[0] = { data: null, error: { message: 'private database detail' } }
    expect(JSON.stringify(await deleteSelectedQuestions([ID]))).not.toContain('private database detail')
    expect(queries).toHaveLength(1)
  })
  it('does not release files or invalidate pages when the database rejects deletion', async () => {
    responses[1] = { data: null, error: { message: 'foreign key' } }
    expect(await deleteSelectedQuestions([ID])).toHaveProperty('error')
    expect(mocks.release).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it('deletes all children when a group parent is selected', async () => {
    const parent = { ...row, group_id: GROUP, order_in_group: 0 }
    const child = { ...parent, id: CHILD, order_in_group: 1 }
    responses = [
      { data: [parent], error: null },
      { data: [parent, child], error: null },
      { data: [{ id: ID }, { id: CHILD }], error: null },
    ]
    expect(await deleteSelectedQuestions([ID])).toEqual({ deletedIds: [ID] })
    expect(queries[2].calls).toContainEqual(['or', [`group_id.in.(${GROUP})`]])
    expect(mocks.release.mock.calls[0][2]).toEqual([parent, child])
  })
  it('rejects a child-only selection instead of leaving a broken group', async () => {
    responses[0].data = [{ ...row, group_id: GROUP, order_in_group: 1 }]
    expect(await deleteSelectedQuestions([ID])).toHaveProperty('error')
    expect(queries).toHaveLength(1)
  })
  it('keeps group questions when reading children fails', async () => {
    responses = [
      { data: [{ ...row, group_id: GROUP, order_in_group: 0 }], error: null },
      { data: null, error: { message: 'read failed' } },
    ]
    expect(await deleteSelectedQuestions([ID])).toHaveProperty('error')
    expect(queries).toHaveLength(2)
  })
  it('reports only acknowledged deletions and only releases their files', async () => {
    responses[1].data = []
    expect(await deleteSelectedQuestions([ID])).toEqual({ deletedIds: [] })
    expect(mocks.release.mock.calls[0][2]).toEqual([])
  })
})
