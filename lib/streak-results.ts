/**
 * Turning a set of finished "ถูกติดต่อกัน" attempts into the numbers a teacher
 * reads.
 *
 * Extracted out of the results page so the arithmetic is testable on its own.
 * It is small but not obvious — a median over an even count, "ถูก" meaning
 * full marks rather than any marks, and an elapsed time that must refuse
 * nonsense rather than print it — and none of that is visible from the page
 * once it is inline in a `useMemo`.
 */

/** Only the columns the numbers need, so a caller does not have to pass rows
 *  carrying answers or student identity into a pure function. */
export interface StreakAttemptInput {
  id: string
  started_at?: string | null
  submitted_at?: string | null
  best_streak?: number
  streak_reached?: boolean
}

export interface StreakAnswerInput {
  submission_id: string
  score: number
  max_score: number
}

export interface StreakAttemptStat {
  asked: number
  correct: number
  best: number
  reached: boolean
  /** null when either timestamp is missing, or when they disagree about order. */
  elapsedMs: number | null
}

export interface StreakResultSummary {
  byId: Map<string, StreakAttemptStat>
  reachedCount: number
  /** null when nobody has finished yet. */
  medianAsked: number | null
}

/**
 * How long an attempt took, or null when that cannot be known.
 *
 * A negative span means the two timestamps disagree about which came first —
 * a clock adjustment, or a row written out of order. Printing "-3:00" would
 * invite a teacher to explain a number that means nothing, so it is refused.
 */
export function elapsedMsBetween(
  startedAt: string | null | undefined,
  submittedAt: string | null | undefined,
): number | null {
  if (!startedAt || !submittedAt) return null
  const ms = new Date(submittedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return ms
}

/** An elapsed span in the units a teacher reads at a glance. */
export function formatElapsed(ms: number | null): string {
  if (ms == null) return '—'
  const totalMinutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  if (totalMinutes < 60) return `${totalMinutes}:${String(seconds).padStart(2, '0')}`
  return `${Math.floor(totalMinutes / 60)} ชม. ${totalMinutes % 60} นาที`
}

/**
 * The middle of the class, not the average.
 *
 * One student who ground through sixty ข้อ pulls a mean far away from what the
 * room actually experienced, and this number exists to tell a teacher whether
 * their คลัง was the right difficulty — so it has to describe the typical
 * attempt, not the total effort.
 */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export function summarizeStreakResults(
  attempts: StreakAttemptInput[],
  answers: StreakAnswerInput[],
): StreakResultSummary {
  // Grouped once rather than filtered per attempt: a class of forty attempts
  // against a few hundred answer rows is otherwise a scan per student.
  const rowsBySubmission = new Map<string, StreakAnswerInput[]>()
  for (const a of answers) {
    const list = rowsBySubmission.get(a.submission_id)
    if (list) list.push(a)
    else rowsBySubmission.set(a.submission_id, [a])
  }

  const byId = new Map<string, StreakAttemptStat>()
  let reachedCount = 0
  const asked: number[] = []

  for (const attempt of attempts) {
    const rows = rowsBySubmission.get(attempt.id) ?? []
    const reached = attempt.streak_reached === true
    if (reached) reachedCount += 1
    asked.push(rows.length)
    byId.set(attempt.id, {
      asked: rows.length,
      // Full marks only — the same bar that advanced the run, so the column
      // cannot disagree with the count beside it.
      correct: rows.filter(r => r.max_score > 0 && r.score >= r.max_score).length,
      best: attempt.best_streak ?? 0,
      reached,
      elapsedMs: elapsedMsBetween(attempt.started_at, attempt.submitted_at),
    })
  }

  return { byId, reachedCount, medianAsked: medianOf(asked) }
}
