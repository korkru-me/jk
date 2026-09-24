/**
 * A teacher/device preview has no submission row to recover and must leave no
 * answer backup on the device. Real attempts keep the existing crash/offline
 * recovery behaviour.
 */
export function shouldPersistExamAnswerLocally(previewMode: boolean): boolean {
  return !previewMode
}

/**
 * A retained payload is recoverable work waiting for a later sync, not an
 * active save. Keeping those states separate lets the UI stop its saving
 * indicator after a failed round while the pending-sync warning stays visible.
 */
export function hasActiveAnswerSave(scheduledCount: number, inFlightCount: number): boolean {
  return scheduledCount > 0 || inFlightCount > 0
}

export interface SingleFlight<T> {
  run: (operation: () => Promise<T>) => Promise<T>
}

/** Coalesces overlapping retry triggers and re-opens after either outcome. */
export function createSingleFlight<T>(): SingleFlight<T> {
  let active: Promise<T> | null = null

  return {
    run(operation) {
      if (active) return active

      const operationPromise = Promise.resolve().then(operation)
      const tracked = operationPromise.finally(() => {
        if (active === tracked) active = null
      })
      active = tracked
      return tracked
    },
  }
}

export type AnswerAutosaveStatus = 'syncing' | 'pending' | 'saving' | 'saved' | 'offline'

export function resolveAnswerAutosaveStatus({
  saving,
  pendingCount,
  isOnline,
}: {
  saving: boolean
  pendingCount: number
  isOnline: boolean
}): AnswerAutosaveStatus {
  if (pendingCount > 0) return saving ? 'syncing' : 'pending'
  if (saving) return 'saving'
  return isOnline ? 'saved' : 'offline'
}
