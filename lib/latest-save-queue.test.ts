import { describe, expect, it, vi } from 'vitest'
import { createLatestSaveQueue, type LatestSaveStatus } from './latest-save-queue'

describe('latest save queue', () => {
  it('serializes writes and collapses queued edits to the newest snapshot', async () => {
    let finishFirst!: () => void
    const first = new Promise<void>(resolve => { finishFirst = resolve })
    const saved: number[] = []
    const save = vi.fn(async (value: number) => {
      saved.push(value)
      if (value === 1) await first
      return { ok: true as const }
    })
    const queue = createLatestSaveQueue({ save })

    queue.enqueue(1)
    queue.enqueue(2)
    const latest = queue.saveAndWait(3)

    await Promise.resolve()
    expect(saved).toEqual([1])
    finishFirst()

    await expect(latest).resolves.toEqual({ ok: true })
    expect(saved).toEqual([1, 3])
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('reports a failed latest save and can retry successfully', async () => {
    const statuses: LatestSaveStatus[] = []
    const save = vi.fn()
      .mockResolvedValueOnce({ error: 'ออฟไลน์' })
      .mockResolvedValueOnce({ ok: true })
    const queue = createLatestSaveQueue<string>({
      save,
      onStatusChange: status => statuses.push(status),
    })

    await expect(queue.saveAndWait('draft')).resolves.toEqual({ error: 'ออฟไลน์' })
    expect(queue.getStatus()).toEqual({ state: 'error', error: 'ออฟไลน์' })

    await expect(queue.saveAndWait('draft')).resolves.toEqual({ ok: true })
    expect(queue.getStatus()).toEqual({ state: 'saved' })
    expect(statuses.map(status => status.state)).toEqual(['saving', 'error', 'saving', 'saved'])
  })

  it('continues to a newer queued edit when an older write fails', async () => {
    let finishFirst!: () => void
    const first = new Promise<void>(resolve => { finishFirst = resolve })
    const save = vi.fn(async (value: string) => {
      if (value === 'old') {
        await first
        return { error: 'old failed' }
      }
      return { ok: true as const }
    })
    const queue = createLatestSaveQueue({ save })

    queue.enqueue('old')
    const latest = queue.saveAndWait('new')
    finishFirst()

    await expect(latest).resolves.toEqual({ ok: true })
    expect(save).toHaveBeenNthCalledWith(1, 'old')
    expect(save).toHaveBeenNthCalledWith(2, 'new')
  })
})
