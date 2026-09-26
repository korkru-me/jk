import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveSolutionRelease,
  type SolutionRelease,
  type SolutionReleaseAttempt,
} from '@/lib/solution-release'
import {
  buildAttemptSolutionItems,
  type AttemptSolutionItem,
  type AttemptSolutionRow,
} from '@/lib/attempt-solutions'
import type { AssignmentStatus, AssignmentType } from '@/lib/types'

type AdminClient = ReturnType<typeof createAdminClient>

/** What of an assignment the release rule reads. */
export interface SolutionReleaseAssignment {
  id: string
  show_solutions: boolean | null
  status: AssignmentStatus
  type: AssignmentType
  end_at: string | null
  max_attempts: number | null
  duration_minutes: number | null
}

/** The same columns, as a PostgREST select — embed it as `assignments(...)`. */
export const SOLUTION_RELEASE_ASSIGNMENT_FIELDS =
  'id, show_solutions, status, type, end_at, max_attempts, duration_minutes'

/**
 * Where one student stands with a งาน's เฉลยวิธีทำ, read fresh.
 *
 * Service role, because students cannot read `assignments` or their own
 * in-progress attempts' siblings under RLS. Callers must already have tied
 * `studentId` to the signed-in user and `assignment` to one of that user's
 * own submissions; the reads here go no wider than that one assignment and
 * that one student.
 *
 * Fails shut: a read that errors reports the เฉลย as off, never as open.
 */
export async function loadSolutionRelease(
  admin: AdminClient,
  assignment: SolutionReleaseAssignment,
  studentId: string,
): Promise<SolutionRelease> {
  if (assignment.show_solutions !== true) return { state: 'off' }

  const [extension, attempts] = await Promise.all([
    admin
      .from('assignment_extensions')
      .select('extended_end_at')
      .eq('assignment_id', assignment.id)
      .eq('student_id', studentId)
      .maybeSingle(),
    admin
      .from('submissions')
      .select('id, status, attempt_number, started_at')
      .eq('assignment_id', assignment.id)
      .eq('student_id', studentId),
  ])
  if (extension.error || attempts.error) {
    console.error('[solution-release] read failed:', extension.error ?? attempts.error)
    return { state: 'off' }
  }

  return resolveSolutionRelease({
    showSolutions: true,
    status: assignment.status,
    type: assignment.type,
    endAt: assignment.end_at,
    extendedEndAt: (extension.data?.extended_end_at as string | null | undefined) ?? null,
    maxAttempts: assignment.max_attempts,
    durationMinutes: assignment.duration_minutes,
    attempts: (attempts.data ?? []) as SolutionReleaseAttempt[],
  })
}

/**
 * Every ข้อ of one attempt with its เฉลยวิธีทำ, in the summary page's order.
 *
 * Returns the เฉลย itself, so nothing may hand this to a browser before
 * `loadSolutionRelease` has said `open` for the same student — the summary
 * page reads it only to know which ข้อ have a เฉลย, and passes on no more than
 * that until then. Null when the read fails.
 */
export async function loadAttemptSolutionItems(
  admin: AdminClient,
  submissionId: string,
): Promise<AttemptSolutionItem[] | null> {
  const { data, error } = await admin
    .from('submission_answers')
    .select('id, order_index, random_values, questions(title, question_text, image_urls, solution_text, solution_image_urls)')
    .eq('submission_id', submissionId)
    .order('order_index')
  if (error) {
    console.error('[attempt-solutions] read failed:', error)
    return null
  }
  return buildAttemptSolutionItems((data ?? []) as unknown as AttemptSolutionRow[])
}
