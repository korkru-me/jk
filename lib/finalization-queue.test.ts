import { describe, expect, it } from 'vitest'
import { drainFinalizationQueue, type QueuedRound } from './finalization-queue'

const rounds = (n: number, from = 0): QueuedRound[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${from + i}`, student_id: `s${from + i}` }))

/** A queue like the SQL one: ordered, and a round leaves it only once finalized. */
function fakeQueue(total: number, failing = new Set<string>()) {
  let pending = rounds(total)
  const finalized: string[] = []
  let inFlight = 0
  let maxInFlight = 0
  return {
    fetchBatch: async (limit: number) => pending.slice(0, limit),
    finalize: async (round: QueuedRound) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(r => setTimeout(r, 0))
      inFlight--
      if (failing.has(round.id)) return false
      pending = pending.filter(r => r.id !== round.id)
      finalized.push(round.id)
      return true
    },
    finalized,
    get maxInFlight() { return maxInFlight },
    get pending() { return pending.length },
  }
}

describe('drainFinalizationQueue', () => {
  it('drains a queue far larger than one batch in a single run', async () => {
    const q = fakeQueue(530)
    const result = await drainFinalizationQueue({ fetchBatch: q.fetchBatch, finalize: q.finalize, batchSize: 100, concurrency: 8 })
    expect(result).toMatchObject({ completed: 530, failed: 0 })
    expect(q.pending).toBe(0)
    expect(new Set(q.finalized).size).toBe(530)
  })

  it('never runs more than the configured number of gradings at once', async () => {
    const q = fakeQueue(50)
    await drainFinalizationQueue({ fetchBatch: q.fetchBatch, finalize: q.finalize, batchSize: 20, concurrency: 3 })
    expect(q.maxInFlight).toBeLessThanOrEqual(3)
    expect(q.maxInFlight).toBeGreaterThan(1)
  })

  it('tries a failing round once per run and still reaches the rest of the queue', async () => {
    const failing = new Set(['r0', 'r1'])
    const q = fakeQueue(25, failing)
    const result = await drainFinalizationQueue({ fetchBatch: q.fetchBatch, finalize: q.finalize, batchSize: 10, concurrency: 4 })
    expect(result).toMatchObject({ completed: 23, failed: 2 })
    expect(q.pending).toBe(2)
  })

  it('stops when only already-tried failures remain at the head of a full batch', async () => {
    const failing = new Set(rounds(10).map(r => r.id))
    const q = fakeQueue(10, failing)
    const result = await drainFinalizationQueue({ fetchBatch: q.fetchBatch, finalize: q.finalize, batchSize: 10, concurrency: 4 })
    expect(result).toMatchObject({ completed: 0, failed: 10, batches: 2 })
  })

  it('counts a thrown grading as a failure', async () => {
    const result = await drainFinalizationQueue({
      fetchBatch: async () => rounds(3),
      finalize: async round => { if (round.id === 'r1') throw new Error('boom'); return true },
      batchSize: 10,
    })
    expect(result).toMatchObject({ completed: 2, failed: 1 })
  })

  it('stops starting batches once the time budget is spent', async () => {
    let clock = 0
    let fetched = 0
    const result = await drainFinalizationQueue({
      fetchBatch: async limit => { fetched++; return rounds(limit, fetched * 1000) },
      finalize: async () => { clock += 1_000; return true },
      now: () => clock,
      budgetMs: 25_000, batchSize: 10, concurrency: 1,
    })
    // 10 s per batch: batches start at 0, 10 and 20 s, none at 30 s.
    expect(fetched).toBe(3)
    expect(result.completed).toBe(30)
  })

  it('does nothing on an empty queue', async () => {
    const result = await drainFinalizationQueue({ fetchBatch: async () => [], finalize: async () => true })
    expect(result).toEqual({ completed: 0, failed: 0, batches: 1 })
  })
})
