import { describe, expect, it, vi } from 'vitest'
import {
  createSingleFlight,
  hasActiveAnswerSave,
  resolveAnswerAutosaveStatus,
  shouldPersistExamAnswerLocally,
} from './exam-autosave-policy'

describe('exam autosave persistence policy', () => {
  it('keeps recovery backups for real attempts', () => {
    expect(shouldPersistExamAnswerLocally(false)).toBe(true)
  })

  it('keeps previews in React state only', () => {
    expect(shouldPersistExamAnswerLocally(true)).toBe(false)
  })
})

describe('exam autosave activity', () => {
  it('reports only scheduled or in-flight requests as actively saving', () => {
    expect(hasActiveAnswerSave(0, 0)).toBe(false)
    expect(hasActiveAnswerSave(1, 0)).toBe(true)
    expect(hasActiveAnswerSave(0, 1)).toBe(true)
  })

  it('keeps pending sync visible above the generic saving state', () => {
    expect(resolveAnswerAutosaveStatus({
      saving: false,
      pendingCount: 2,
      isOnline: true,
    })).toBe('pending')
    expect(resolveAnswerAutosaveStatus({
      saving: true,
      pendingCount: 2,
      isOnline: true,
    })).toBe('syncing')
    expect(resolveAnswerAutosaveStatus({
      saving: true,
      pendingCount: 0,
      isOnline: true,
    })).toBe('saving')
  })

  it('distinguishes the settled online and offline states', () => {
    expect(resolveAnswerAutosaveStatus({
      saving: false,
      pendingCount: 0,
      isOnline: true,
    })).toBe('saved')
    expect(resolveAnswerAutosaveStatus({
      saving: false,
      pendingCount: 0,
      isOnline: false,
    })).toBe('offline')
  })
})

describe('exam autosave retry single-flight', () => {
  it('shares one retry round between overlapping triggers and allows the next round', async () => {
    let finishFirst!: (value: string) => void
    const firstResult = new Promise<string>(resolve => { finishFirst = resolve })
    const operation = vi.fn()
      .mockReturnValueOnce(firstResult)
      .mockResolvedValueOnce('second')
    const flight = createSingleFlight<string>()

    const first = flight.run(operation)
    const overlapping = flight.run(operation)

    expect(overlapping).toBe(first)
    await Promise.resolve()
    expect(operation).toHaveBeenCalledTimes(1)

    finishFirst('first')
    await expect(first).resolves.toBe('first')
    await expect(flight.run(operation)).resolves.toBe('second')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('re-opens after a rejected retry round', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('saved')
    const flight = createSingleFlight<string>()

    await expect(flight.run(operation)).rejects.toThrow('offline')
    await expect(flight.run(operation)).resolves.toBe('saved')
    expect(operation).toHaveBeenCalledTimes(2)
  })
})
