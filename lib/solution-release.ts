import type { AssignmentStatus, AssignmentType, SubmissionStatus } from '@/lib/types'

/**
 * When a student may open the เฉลยวิธีทำ their teacher attached to each ข้อ —
 * the typed text, pictures, PDFs and board pictures under "เฉลยวิธีทำ", not
 * the answer key, which `show_results` governs on its own.
 *
 * The teacher ticks `assignments.show_solutions`; from then on the เฉลย opens
 * for a student once they can no longer work on the งาน at all:
 *
 *  - the teacher pressed ปิดการสอบ,
 *  - their deadline passed (their own extension, when they have one), or
 *  - they used every attempt the งาน allows.
 *
 * One rule covers แบบฝึกหัด and ข้อสอบ alike; what differs is only how many
 * attempts each allows by default, so a ข้อสอบ of one attempt opens the moment
 * it is handed in and an unlimited แบบฝึกหัด waits for the teacher to close it.
 *
 * Seeing the เฉลย while a way back into the work remains is exactly what the
 * teacher is guarding against, so an attempt the server would still accept
 * answers for holds the เฉลย shut whatever else is true. That matters for a
 * closed งาน in particular: closing stops new attempts from starting, but a
 * tab left open on an attempt can still save and hand in, and the เฉลย must
 * not reach that tab. The page offers that student a way to finish instead.
 *
 * Pure, so the summary page and the Server Action that serves the เฉลย ask the
 * same question the same way — the action re-asks it on every read.
 */

export interface SolutionReleaseAttempt {
  id: string
  status: SubmissionStatus
  /** Rows written before attempts were numbered read as the first. */
  attempt_number: number | null
  started_at: string
}

export interface SolutionReleaseInput {
  /** `assignments.show_solutions` — nothing opens without it. */
  showSolutions: boolean
  status: AssignmentStatus
  type: AssignmentType
  endAt: string | null
  /** This student's own `assignment_extensions.extended_end_at`. */
  extendedEndAt: string | null
  maxAttempts: number | null
  durationMinutes: number | null
  /** Every attempt this student has at the งาน, whatever its status. */
  attempts: readonly SolutionReleaseAttempt[]
  now?: number
}

export interface SolutionLock {
  state: 'locked'
  /** An attempt the student can still change answers in — it has to be
   *  handed in first. */
  unfinished: { id: string; attemptNumber: number } | null
  /** The deadline still ahead of this student, if the งาน has one. */
  deadline: string | null
  /** Null = no limit, so running out of attempts never opens it. */
  attemptLimit: number | null
  attemptsUsed: number
}

export type SolutionRelease = { state: 'off' } | { state: 'open' } | SolutionLock

/**
 * How many attempts the server lets this student make — the same fallback
 * startSubmission applies: a แบบฝึกหัด with no limit set is unlimited, while a
 * ข้อสอบ saved without one predates the setting and was always one attempt.
 */
export function attemptLimitFor(type: AssignmentType, maxAttempts: number | null): number | null {
  return maxAttempts ?? (type === 'exercise' ? null : 1)
}

const time = (iso: string) => new Date(iso).getTime()

export function resolveSolutionRelease(input: SolutionReleaseInput): SolutionRelease {
  if (!input.showSolutions) return { state: 'off' }
  const now = input.now ?? Date.now()

  // No new attempt starts past this — startSubmission's reading, where an
  // extension replaces the งาน's own deadline.
  const deadline = input.extendedEndAt ?? input.endAt
  const pastDeadline = deadline != null && time(deadline) < now

  // No answer is saved past this — getWritableStudentAnswer's reading, which
  // only looks for an extension once the งาน's own deadline has gone by. The
  // two differ only for an extension set earlier than the deadline it extends,
  // and each question is answered here the way the server answers it.
  const writesClosedByDeadline = input.endAt != null
    && time(input.endAt) < now
    && !(input.extendedEndAt != null && time(input.extendedEndAt) >= now)

  const isLive = (attempt: SolutionReleaseAttempt) => {
    if (attempt.status !== 'in_progress' || writesClosedByDeadline) return false
    if (input.durationMinutes == null) return true
    return now <= time(attempt.started_at) + input.durationMinutes * 60_000
  }

  const live = input.attempts.find(isLive) ?? null
  // An attempt whose time ran out is as good as handed in: nothing more can be
  // written to it, and startSubmission finalizes it before counting.
  const attemptsUsed = input.attempts
    .filter(attempt => !isLive(attempt))
    .reduce((highest, attempt) => Math.max(highest, attempt.attempt_number ?? 1), 0)
  const attemptLimit = attemptLimitFor(input.type, input.maxAttempts)

  if (!live) {
    const outOfAttempts = attemptLimit != null && attemptsUsed >= attemptLimit
    if (input.status === 'closed' || pastDeadline || outOfAttempts) return { state: 'open' }
  }

  return {
    state: 'locked',
    unfinished: live ? { id: live.id, attemptNumber: live.attempt_number ?? 1 } : null,
    deadline: pastDeadline ? null : deadline,
    attemptLimit,
    attemptsUsed,
  }
}
