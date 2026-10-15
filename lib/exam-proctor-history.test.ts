import { describe, expect, it, vi } from 'vitest'
import { loadProctorHistoryPage, loadProctorSessions, PROCTOR_HISTORY_PAGE_SIZE } from './exam-proctor-history'
import type { createClient } from './supabase/client'

function client(rows: { id: number }[], error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(resolve),
  }
  return { query, db: { from: vi.fn(() => query) } as unknown as ReturnType<typeof createClient> }
}

describe('live-room event history', () => {
  it('scopes every page to its exact assignment and uses a stable exclusive id cursor', async () => {
    const { db, query } = client(Array.from({ length: 101 }, (_, i) => ({ id: 500 - i })))
    const page = await loadProctorHistoryPage(db, 'exam-a', 501)
    expect(db.from).toHaveBeenCalledWith('exam_proctor_events')
    expect(query.eq).toHaveBeenCalledWith('assignment_id', 'exam-a')
    expect(query.order).toHaveBeenCalledWith('id', { ascending: false })
    expect(query.lt).toHaveBeenCalledWith('id', 501)
    expect(query.limit).toHaveBeenCalledWith(PROCTOR_HISTORY_PAGE_SIZE + 1)
    expect(page.events).toHaveLength(100)
    expect(page.nextBefore).toBe(401)
  })

  it('distinguishes an exhausted page from a failed read', async () => {
    const empty = client([])
    expect(await loadProctorHistoryPage(empty.db, 'exam-a', null)).toEqual({ events: [], nextBefore: null })
    expect(empty.query.lt).not.toHaveBeenCalled()
    await expect(loadProctorHistoryPage(client([], { code: '42501' }).db, 'exam-a', null)).rejects.toThrow()
  })

  it('rejects malformed cursors before issuing a query', async () => {
    const { db } = client([])
    for (const cursor of [-1, 0, 1.5, NaN, Infinity]) {
      await expect(loadProctorHistoryPage(db, 'exam-a', cursor)).rejects.toThrow()
    }
    expect(db.from).not.toHaveBeenCalled()
  })

  it('reads every retained session in bounded batches and refuses a partial failed snapshot', async () => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ submission_id: String(i) })), error: null })
        .mockResolvedValueOnce({ data: [{ submission_id: 'older-round' }], error: null }),
    }
    const db = { from: vi.fn(() => query) } as unknown as ReturnType<typeof createClient>
    expect((await loadProctorSessions(db, 'exam-a')).data).toHaveLength(501)
    expect(query.eq).toHaveBeenCalledWith('assignment_id', 'exam-a')
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999]])
    query.range.mockResolvedValueOnce({ data: [], error: { code: '42501' } })
    expect((await loadProctorSessions(db, 'exam-a')).data).toBeNull()
  })
})
