/**
 * Drains closed-but-ungraded attempts within one cron invocation.
 *
 * The worker used to grade a single batch of 40 (four at a time) per minute,
 * so a class whose deadline closed 500 unsubmitted rounds waited ~13 minutes
 * for the last score. It now keeps taking batches until the queue is empty or
 * the time budget is spent, grading `concurrency` rounds at a time.
 *
 * A round that fails stays in the database queue (still in progress with a
 * close time) and is retried by the next invocation, but never twice in the
 * same one: the queue is ordered by close time, so retrying here would spin
 * on the same failures instead of reaching the rest.
 */
export interface QueuedRound { id: string; student_id: string }

export interface DrainOptions {
  fetchBatch: (limit: number) => Promise<QueuedRound[]>
  finalize: (round: QueuedRound) => Promise<boolean>
  now?: () => number
  /** Stop starting new batches after this long; in-flight work still finishes. */
  budgetMs?: number
  batchSize?: number
  concurrency?: number
}

export const FINALIZER_BUDGET_MS = 40_000
export const FINALIZER_BATCH_SIZE = 100
export const FINALIZER_CONCURRENCY = 8

export async function drainFinalizationQueue({
  fetchBatch, finalize, now = Date.now,
  budgetMs = FINALIZER_BUDGET_MS, batchSize = FINALIZER_BATCH_SIZE, concurrency = FINALIZER_CONCURRENCY,
}: DrainOptions): Promise<{ completed: number; failed: number; batches: number }> {
  const started = now()
  const attempted = new Set<string>()
  let completed = 0
  let failed = 0
  let batches = 0
  while (now() - started < budgetMs) {
    const batch = await fetchBatch(batchSize)
    batches++
    const fresh = batch.filter(round => !attempted.has(round.id))
    if (fresh.length === 0) break
    for (const round of fresh) attempted.add(round.id)
    // Grade with a fixed number of workers so one slow round does not hold
    // up a whole slice.
    let next = 0
    const worker = async () => {
      while (next < fresh.length) {
        const round = fresh[next++]
        let ok = false
        try { ok = await finalize(round) } catch { ok = false }
        if (ok) completed++
        else failed++
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, fresh.length) }, worker))
    // A short batch means the queue is drained (or holds only rounds already
    // tried in this run).
    if (batch.length < batchSize) break
  }
  return { completed, failed, batches }
}
