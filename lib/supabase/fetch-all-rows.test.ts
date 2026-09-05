import { describe, expect, it, vi } from 'vitest'
import {
  fetchAllRows,
  fetchRowsInChunks,
  SUPABASE_PAGE_SIZE,
} from './fetch-all-rows'

describe('fetchAllRows', () => {
  it('reads every page instead of silently stopping at the PostgREST cap', async () => {
    const source = Array.from({ length: 2_005 }, (_, index) => index)
    const page = vi.fn((from: number, to: number) => Promise.resolve({
      data: source.slice(from, to + 1),
      error: null,
    }))

    const result = await fetchAllRows(page)

    expect(result).toEqual({ rows: source, error: null })
    expect(page.mock.calls).toEqual([
      [0, SUPABASE_PAGE_SIZE - 1],
      [SUPABASE_PAGE_SIZE, (SUPABASE_PAGE_SIZE * 2) - 1],
      [SUPABASE_PAGE_SIZE * 2, (SUPABASE_PAGE_SIZE * 3) - 1],
    ])
  })

  it('honors an explicit cap without requesting or returning extra rows', async () => {
    const source = Array.from({ length: 3_000 }, (_, index) => index)
    const page = vi.fn((from: number, to: number) => Promise.resolve({
      data: source.slice(from, to + 1),
      error: null,
    }))

    const result = await fetchAllRows(page, { maxRows: 1_250 })

    expect(result.rows).toHaveLength(1_250)
    expect(page.mock.calls).toEqual([[0, 999], [1_000, 1_249]])
  })

  it('returns partial rows and the first query error', async () => {
    const failure = new Error('query failed')
    const result = await fetchAllRows<number>((from) => Promise.resolve(
      from === 0
        ? { data: Array.from({ length: 1_000 }, (_, index) => index), error: null }
        : { data: null, error: failure },
    ))

    expect(result.rows).toHaveLength(1_000)
    expect(result.error).toBe(failure)
  })

  it('rejects invalid maximum row counts', async () => {
    await expect(fetchAllRows(() => Promise.resolve({ data: [], error: null }), { maxRows: 0 }))
      .rejects.toThrow('maxRows must be a positive integer')
  })
})

describe('fetchRowsInChunks', () => {
  it('keeps large IN filters inside bounded chunks', async () => {
    const values = Array.from({ length: 405 }, (_, index) => `student-${index}`)
    const query = vi.fn((chunk: string[]) => Promise.resolve({
      data: chunk.map(value => ({ value })),
      error: null,
    }))

    const result = await fetchRowsInChunks(values, query)

    expect(result.rows).toHaveLength(405)
    expect(query.mock.calls.map(([chunk]) => chunk.length)).toEqual([200, 200, 5])
  })

  it('does not query for an empty value list', async () => {
    const query = vi.fn(() => Promise.resolve({ data: [], error: null }))
    await expect(fetchRowsInChunks([], query)).resolves.toEqual({ rows: [], error: null })
    expect(query).not.toHaveBeenCalled()
  })
})
