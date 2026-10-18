import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readWithVoidedScoreMetadata, withVoidedScoreMetadata } from './voided-score-metadata.server'

vi.mock('server-only', () => ({}))

type ReadError = { code?: string; message?: string; details?: string } | null
type MetadataResult = { data: Array<{ id: string; voided_max_score: number | string | null }> | null; error: ReadError }

function metadataReader(respond: (ids: string[]) => MetadataResult) {
  const calls: Array<{ table: string; projection: string; column: string; ids: string[] }> = []
  const reader = {
    from(table: string) {
      return {
        select(projection: string) {
          return {
            in(column: string, ids: string[]) {
              calls.push({ table, projection, column, ids })
              return Promise.resolve(respond(ids))
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
  return { reader, calls }
}

const missingColumn = { code: '42703', message: 'column submissions.voided_max_score does not exist' }

describe('readWithVoidedScoreMetadata', () => {
  it('gets current metadata in one original read and preserves other row fields', async () => {
    const rows = [{ id: 'authorized', total_score: 5, voided_max_score: '2.5', nested: { status: 'submitted' } }]
    const read = vi.fn(async () => ({ data: rows, error: null, count: 1 }))

    expect(await readWithVoidedScoreMetadata(read)).toEqual({
      data: [{ ...rows[0], voided_max_score: 2.5 }], error: null, count: 1,
    })
    expect(read).toHaveBeenCalledExactlyOnceWith(true)
    expect(rows[0].voided_max_score).toBe('2.5')
  })

  it.each([
    missingColumn,
    { code: 'PGRST204', message: "Could not find the 'voided_max_score' column of 'submissions' in the schema cache" },
    { code: '42703', details: 'column "voided_max_score" does not exist' },
  ])('retries the same callback once for the exact missing column: $code', async error => {
    const legacy = { data: [{ id: 'authorized', total_score: 5 }], error: null }
    const read = vi.fn().mockResolvedValueOnce({ data: null, error }).mockResolvedValueOnce(legacy)

    expect(await readWithVoidedScoreMetadata(read)).toEqual(legacy)
    expect(read.mock.calls).toEqual([[true], [false]])
    expect((await read.mock.results[1].value).data[0]).not.toHaveProperty('voided_max_score')
  })

  it.each([
    { code: '42703', message: 'column submissions.total_score does not exist' },
    { code: 'PGRST204', message: "Could not find the 'max_score' column" },
    { code: '42703', message: 'column submissions.voided_max_score_backup does not exist' },
    { code: '42703' },
    { code: '42501', message: 'permission denied for voided_max_score' },
    { code: 'PGRST301', message: 'JWT expired' },
    { message: 'connection failed' },
  ])('preserves unrelated failures without retrying: $code $message', async error => {
    const failure = { data: [{ id: 'partial', voided_max_score: '3' }], error }
    const read = vi.fn(async () => failure)
    expect(await readWithVoidedScoreMetadata(read)).toBe(failure)
    expect(read).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('returns the legacy failure unchanged and never retries it again', async () => {
    const failure = { data: null, error: missingColumn }
    const read = vi.fn().mockResolvedValueOnce(failure).mockResolvedValueOnce(failure)
    expect(await readWithVoidedScoreMetadata(read)).toBe(failure)
    expect(read.mock.calls).toEqual([[true], [false]])
  })

  it.each([[], null])('needs no further reads for an empty result: %j', async data => {
    const read = vi.fn(async () => ({ data, error: null }))
    expect(await readWithVoidedScoreMetadata(read)).toEqual({ data, error: null })
    expect(read).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('accepts a paginated callback and normalizes its complete aggregate', async () => {
    const pageRead = vi.fn(async (page: number, includeVoided: boolean) => ({
      id: `authorized-${page}`, total_score: page, ...(includeVoided ? { voided_max_score: String(page) } : {}),
    }))
    const result = await readWithVoidedScoreMetadata(async includeVoided => ({
      data: [await pageRead(1, includeVoided), await pageRead(2, includeVoided)], error: null,
    }))
    expect(result.data).toEqual([
      { id: 'authorized-1', total_score: 1, voided_max_score: 1 },
      { id: 'authorized-2', total_score: 2, voided_max_score: 2 },
    ])
    expect(pageRead.mock.calls).toEqual([[1, true], [2, true]])
  })

  it('keeps rejected reads rejected without retrying', async () => {
    const error = new Error('network unavailable')
    const read = vi.fn().mockRejectedValue(error)
    await expect(readWithVoidedScoreMetadata(read)).rejects.toBe(error)
    expect(read).toHaveBeenCalledExactlyOnceWith(true)
  })
})

describe('withVoidedScoreMetadata', () => {
  it('does not read again when all rows already own valid projected metadata', async () => {
    const { reader, calls } = metadataReader(() => { throw new Error('unexpected read') })
    expect(await withVoidedScoreMetadata(reader, [
      { id: 'one', voided_max_score: 0, total_score: 5 },
      { id: 'two', voided_max_score: '2.5', total_score: 4 },
      { id: 'three', voided_max_score: null, total_score: 2 },
    ])).toEqual([
      { id: 'one', voided_max_score: 0, total_score: 5 },
      { id: 'two', voided_max_score: 2.5, total_score: 4 },
      { id: 'three', voided_max_score: 0, total_score: 2 },
    ])
    expect(calls).toEqual([])
    expect(await withVoidedScoreMetadata(reader, [])).toEqual([])
    expect(calls).toEqual([])
  })

  it('reads only the exact deduplicated authorized IDs in batches of at most 100', async () => {
    const rows = Array.from({ length: 205 }, (_, i) => ({ id: `authorized-${i}`, total_score: i }))
    rows.push(rows[0])
    const { reader, calls } = metadataReader(ids => ({
      data: ids.map(id => ({ id, voided_max_score: '2.5' })), error: null,
    }))

    const result = await withVoidedScoreMetadata(reader, rows)
    expect(calls.map(call => call.ids.length)).toEqual([100, 100, 5])
    expect(calls.flatMap(call => call.ids)).toEqual(rows.slice(0, 205).map(row => row.id))
    expect(calls.every(call => call.table === 'submissions' && call.projection === 'id, voided_max_score' && call.column === 'id')).toBe(true)
    expect(result).toEqual(rows.map(row => ({ ...row, voided_max_score: 2.5 })))
  })

  it('does not treat inherited or invalid metadata as an authorized projection', async () => {
    const inherited = Object.assign(Object.create({ voided_max_score: 9 }), { id: 'inherited' }) as { id: string; voided_max_score: number }
    const { reader, calls } = metadataReader(ids => ({ data: ids.map(id => ({ id, voided_max_score: 2 })), error: null }))
    expect(await withVoidedScoreMetadata(reader, [inherited, { id: 'invalid', voided_max_score: NaN }])).toEqual([
      { id: 'inherited', voided_max_score: 2 }, { id: 'invalid', voided_max_score: 2 },
    ])
    expect(calls[0].ids).toEqual(['inherited', 'invalid'])
  })

  it.each([
    { data: [{ id: 'one', voided_max_score: 0 }] },
    { data: [{ id: 'one', voided_max_score: 0 }, { id: 'unrequested', voided_max_score: 0 }] },
    { data: [{ id: 'one', voided_max_score: 0 }, { id: 'one', voided_max_score: 0 }] },
  ])('rejects missing, unexpected or duplicate metadata rows', async ({ data }) => {
    const { reader } = metadataReader(() => ({ data, error: null }))
    await expect(withVoidedScoreMetadata(reader, [{ id: 'one' }, { id: 'two' }])).rejects.toThrow('สิทธิ์อ่านคะแนนมีการเปลี่ยนแปลง')
  })

  it('keeps historical rows readable when the optional column is missing', async () => {
    const rows = [{ id: 'one', total_score: 5 }]
    const { reader, calls } = metadataReader(() => ({ data: null, error: missingColumn }))
    expect(await withVoidedScoreMetadata(reader, rows)).toBe(rows)
    expect(calls).toHaveLength(1)
  })

  it('fails other metadata read errors instead of silently using historical scores', async () => {
    const { reader } = metadataReader(() => ({ data: null, error: { code: '42703', message: 'column id does not exist' } }))
    await expect(withVoidedScoreMetadata(reader, [{ id: 'one' }])).rejects.toThrow('อ่านคะแนนเต็มหลังทำข้อเป็นโมฆะไม่สำเร็จ')
  })
})
