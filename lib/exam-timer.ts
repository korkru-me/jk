/**
 * Recompute a timed attempt from its immutable start time. This deliberately
 * does not decrement browser state: background throttling, sleep, reloads and
 * cloned tabs must all show the same remaining time.
 */
export function examSecondsLeft(
  durationMinutes: number,
  startedAt: string,
  nowMs = Date.now(),
): number {
  const startMs = new Date(startedAt).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return 0
  }
  const totalSeconds = Math.max(0, Math.floor(durationMinutes * 60))
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000))
  return Math.max(0, totalSeconds - elapsedSeconds)
}
