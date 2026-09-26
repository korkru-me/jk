import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))

import { fetchSolutionPresence } from '@/lib/question-card-data'
import { getQuestionSolution } from '@/lib/actions/question-solution'

/**
 * The two reads behind the ดูเฉลย button, against a stand-in for the
 * Supabase client that records what was asked and answers from a function.
 * The database, RLS and PostgREST itself are not exercised here.
 */

type Filter = [op: 'eq' | 'in' | 'gt', column: string, value: unknown]

interface Call {
  table: string
  select: string
  filters: Filter[]
}

type Result = { data: unknown; error: null | { message: string } }

function fakeClient(respond: (call: Call) => Result) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, select: '', filters: [] }
      calls.push(call)
      const chain = {
        select(columns: string) { call.select = columns; return chain },
        eq(column: string, value: unknown) { call.filters.push(['eq', column, value]); return chain },
        in(column: string, values: unknown) { call.filters.push(['in', column, values]); return chain },
        gt(column: string, value: unknown) { call.filters.push(['gt', column, value]); return chain },
        order() { return chain },
        maybeSingle: async () => respond(call),
        then<A, B>(onFulfilled?: (value: Result) => A, onRejected?: (reason: unknown) => B) {
          return Promise.resolve(respond(call)).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
  }
  return { client, calls }
}

const filterValue = (call: Call, op: Filter[0], column: string) =>
  call.filters.find(([o, c]) => o === op && c === column)?.[2]

type Client = Parameters<typeof fetchSolutionPresence>[0]

// The failure cases silence the console.error the reads log on the way out.
afterEach(() => { vi.restoreAllMocks() })

const FILE = 'https://project.supabase.co/storage/v1/object/public/question-images/u/solution_1.webp'

describe('fetchSolutionPresence', () => {
  it('asks nothing about an empty page', async () => {
    const { client, calls } = fakeClient(() => ({ data: [], error: null }))
    expect(await fetchSolutionPresence(client as unknown as Client, [])).toEqual({})
    expect(calls).toHaveLength(0)
  })

  it('answers each row from its own columns, and a group from its steps', async () => {
    const { client, calls } = fakeClient(call => {
      if (filterValue(call, 'in', 'id')) {
        return {
          data: [
            { id: 'typed', solution_text: '<p>F = ma</p>', solution_image_urls: [] },
            { id: 'filed', solution_text: null, solution_image_urls: [FILE] },
            { id: 'blank', solution_text: '<p></p>', solution_image_urls: [] },
            { id: 'group-yes', solution_text: null, solution_image_urls: [] },
            { id: 'group-no', solution_text: null, solution_image_urls: [] },
          ],
          error: null,
        }
      }
      return {
        data: [
          { group_id: 'g-yes', solution_text: null, solution_image_urls: [] },
          { group_id: 'g-yes', solution_text: '<p>ขั้นที่สอง</p>', solution_image_urls: [] },
          { group_id: 'g-no', solution_text: '<p> </p>', solution_image_urls: [] },
        ],
        error: null,
      }
    })

    const presence = await fetchSolutionPresence(client as unknown as Client, [
      { id: 'typed', group_id: null, order_in_group: null },
      { id: 'filed', group_id: null, order_in_group: null },
      { id: 'blank', group_id: null, order_in_group: null },
      { id: 'group-yes', group_id: 'g-yes', order_in_group: 0 },
      { id: 'group-no', group_id: 'g-no', order_in_group: 0 },
    ])

    expect(presence).toEqual({
      typed: true, filed: true, blank: false, 'group-yes': true, 'group-no': false,
    })
    // Steps are read by group, and never the listed row itself.
    const stepRead = calls.find(call => filterValue(call, 'in', 'group_id'))
    expect(stepRead && filterValue(stepRead, 'in', 'group_id')).toEqual(['g-yes', 'g-no'])
    expect(stepRead && filterValue(stepRead, 'gt', 'order_in_group')).toBe(0)
    // Only the เฉลย columns are read.
    expect(calls.every(call => /solution_text, solution_image_urls$/.test(call.select))).toBe(true)
  })

  it('leaves a group unanswered when its steps cannot be read', async () => {
    const { client } = fakeClient(call => filterValue(call, 'in', 'group_id')
      ? { data: null, error: { message: 'boom' } }
      : {
          data: [
            { id: 'single', solution_text: null, solution_image_urls: [] },
            { id: 'group', solution_text: null, solution_image_urls: [] },
          ],
          error: null,
        })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await fetchSolutionPresence(client as unknown as Client, [
      { id: 'single', group_id: null, order_in_group: null },
      { id: 'group', group_id: 'g', order_in_group: 0 },
    ])).toEqual({ single: false })
  })

  it('answers nothing at all when the rows cannot be read', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: 'boom' } }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await fetchSolutionPresence(client as unknown as Client, [
      { id: 'single', group_id: null, order_in_group: null },
    ])).toEqual({})
  })
})

describe('getQuestionSolution', () => {
  beforeEach(() => {
    mocks.getAuthUser.mockReset()
    mocks.createClient.mockReset()
    mocks.getAuthUser.mockResolvedValue({ id: 'teacher-1' })
  })

  it('asks for a sign-in before reading anything', async () => {
    mocks.getAuthUser.mockResolvedValue(null)
    expect(await getQuestionSolution('q1')).toEqual({ error: 'ไม่ได้เข้าสู่ระบบ' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('reads a single โจทย์ once, leaving research snapshots out', async () => {
    const { client, calls } = fakeClient(() => ({
      data: { id: 'q1', title: 'แรงลัพธ์', group_id: null, order_in_group: null, solution_text: '<p>ใช้ F = ma</p>', solution_image_urls: [FILE] },
      error: null,
    }))
    mocks.createClient.mockResolvedValue(client)

    expect(await getQuestionSolution('q1')).toEqual({
      data: {
        title: 'แรงลัพธ์',
        parts: [{ id: 'q1', label: null, excerpt: null, text: '<p>ใช้ F = ma</p>', files: [FILE] }],
      },
    })
    expect(calls).toHaveLength(1)
    expect(filterValue(calls[0], 'eq', 'id')).toBe('q1')
    expect(filterValue(calls[0], 'eq', 'is_research_snapshot')).toBe(false)
  })

  it('says so when RLS hides the row', async () => {
    const { client } = fakeClient(() => ({ data: null, error: null }))
    mocks.createClient.mockResolvedValue(client)
    expect(await getQuestionSolution('q1')).toEqual({ error: 'ไม่พบโจทย์นี้หรือคุณไม่มีสิทธิ์เข้าถึง' })
  })

  it('follows a group to its steps by the group the row names', async () => {
    const { client, calls } = fakeClient(call => filterValue(call, 'eq', 'id')
      ? {
          data: { id: 'parent', title: 'รถลากกล่อง', group_id: 'g1', order_in_group: 0, solution_text: null, solution_image_urls: [] },
          error: null,
        }
      : {
          data: [
            { id: 's1', order_in_group: 1, question_text: '<p>หาแรงเสียดทาน</p>', solution_text: '<p>20 N</p>', solution_image_urls: [] },
            { id: 's2', order_in_group: 2, question_text: '<p>หาความเร่ง</p>', solution_text: null, solution_image_urls: [] },
          ],
          error: null,
        })
    mocks.createClient.mockResolvedValue(client)

    const result = await getQuestionSolution('parent')
    expect(result).toEqual({
      data: {
        title: 'รถลากกล่อง',
        parts: [
          { id: 's1', label: 'ข้อย่อยที่ 1', excerpt: 'หาแรงเสียดทาน', text: '<p>20 N</p>', files: [] },
          { id: 's2', label: 'ข้อย่อยที่ 2', excerpt: 'หาความเร่ง', text: null, files: [] },
        ],
      },
    })
    expect(filterValue(calls[1], 'eq', 'group_id')).toBe('g1')
    expect(filterValue(calls[1], 'gt', 'order_in_group')).toBe(0)
  })

  it('reports a failed read in words a teacher can act on, not the database’s', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: 'invalid input syntax for type uuid' } }))
    mocks.createClient.mockResolvedValue(client)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await getQuestionSolution('not-a-uuid')
    expect(result).toEqual({ error: expect.stringContaining('โหลดเฉลยไม่สำเร็จ') })
    expect(JSON.stringify(result)).not.toContain('uuid')
  })
})
