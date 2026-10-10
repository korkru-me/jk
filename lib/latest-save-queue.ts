export type LatestSaveResult = { ok: true } | { error: string }

export type LatestSaveStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'error'; error: string }

interface SaveRequest<T> {
  revision: number
  value: T
}

interface LatestSaveQueueOptions<T> {
  save: (value: T) => Promise<LatestSaveResult>
  onStatusChange?: (status: LatestSaveStatus) => void
}

/**
 * Serializes whole-record autosaves while keeping only the newest queued value.
 *
 * Question-set saves replace the whole set. Sending two requests in parallel
 * would let a slower, older response overwrite a newer edit. This queue allows
 * one request at a time and, while it is running, collapses any further edits
 * into the most recent snapshot.
 */
export function createLatestSaveQueue<T>({ save, onStatusChange }: LatestSaveQueueOptions<T>) {
  let revision = 0
  let queued: SaveRequest<T> | null = null
  let running: Promise<void> | null = null
  let status: LatestSaveStatus = { state: 'idle' }
  let lastSavedRevision = 0

  const publish = (next: LatestSaveStatus) => {
    status = next
    onStatusChange?.(next)
  }

  const drain = async () => {
    while (queued) {
      const current = queued
      queued = null
      publish({ state: 'saving' })

      let result: LatestSaveResult
      try {
        result = await save(current.value)
      } catch (error) {
        result = {
          error: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดระหว่างบันทึก',
        }
      }

      if ('error' in result) {
        if (!queued) publish({ state: 'error', error: result.error })
        continue
      }

      lastSavedRevision = current.revision
      if (!queued) publish({ state: 'saved' })
    }
  }

  const ensureDrain = () => {
    if (running) return running
    running = drain().finally(() => {
      running = null
      // enqueue() is synchronous, but a status listener can enqueue another
      // snapshot as the final status is published. Do not strand that value.
      if (queued) ensureDrain()
    })
    return running
  }

  const enqueue = (value: T) => {
    const request = { revision: ++revision, value }
    queued = request
    ensureDrain()
    return request.revision
  }

  const saveAndWait = async (value: T): Promise<LatestSaveResult> => {
    const targetRevision = enqueue(value)
    while (running) await running

    if (lastSavedRevision >= targetRevision && status.state !== 'error') return { ok: true }
    return status.state === 'error'
      ? { error: status.error }
      : { error: 'บันทึกข้อมูลล่าสุดไม่สำเร็จ' }
  }

  return {
    enqueue,
    saveAndWait,
    getStatus: () => status,
  }
}
