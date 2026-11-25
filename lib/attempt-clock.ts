import { attemptExpiresAt, attemptHasExpired } from '@/lib/attempt-expiry'

/**
 * What an open exam page needs to know when the student comes back to it:
 * whether the round is still open, when it closes now (a teacher may have
 * extended the deadline) and the server's clock to re-anchor the countdown.
 * Deliberately nothing else, so the check is two small reads instead of a
 * full re-render of the paper.
 */
export type AttemptClockReading =
  | { open: true; expiresAt: string | null; serverNow: string }
  | { open: false }

export interface AttemptClockRows {
  submission: { status: string; started_at: string; closed_at: string | null } | null
  durationMinutes: number | null
  endAt: string | null
  extendedEndAt: string | null
}

/** Mirrors the take route: a per-student extension overrides the shared close,
 * and a closed, finished or elapsed round is no longer open. */
export function readAttemptClockFromRows(rows: AttemptClockRows, now: Date): AttemptClockReading {
  const { submission } = rows
  if (!submission || submission.status !== 'in_progress' || submission.closed_at) return { open: false }
  const expiresAt = attemptExpiresAt(submission.started_at, rows.durationMinutes, rows.extendedEndAt ?? rows.endAt)
  if (attemptHasExpired(expiresAt, now.getTime())) return { open: false }
  return { open: true, expiresAt, serverNow: now.toISOString() }
}

/** Spread a burst of identical requests (every device seeing the network come
 * back, or the same countdown reaching zero) over a short window. */
export function jitterDelayMs(maxMs: number, random: () => number = Math.random): number {
  return Math.floor(Math.max(0, Math.min(1, random())) * Math.max(0, maxMs))
}
