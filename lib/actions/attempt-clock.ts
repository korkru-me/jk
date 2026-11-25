'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/auth/session-user'
import { readAttemptClockFromRows, type AttemptClockReading } from '@/lib/attempt-clock'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Light status check for an open exam page. It returns only the round's open
 * state and closing time, read for the signed-in student's own submission —
 * never another student's, and never any question or answer data.
 * `{ error }` means "unknown": the caller keeps its local countdown.
 */
export async function readAttemptClock(submissionId: string): Promise<AttemptClockReading | { error: true }> {
  if (typeof submissionId !== 'string' || !UUID_PATTERN.test(submissionId)) return { error: true }
  const supabase = await createClient()
  const { data: { user } } = await getSessionUser(supabase)
  if (!user) return { error: true }
  const admin = createAdminClient()
  const { data: submission, error } = await admin.from('submissions')
    .select('assignment_id, status, started_at, closed_at, assignments(duration_minutes, end_at)')
    .eq('id', submissionId)
    .eq('student_id', user.id)
    .maybeSingle()
  if (error) return { error: true }
  if (!submission) return { open: false }
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments
  const { data: extension, error: extensionError } = await admin.from('assignment_extensions')
    .select('extended_end_at')
    .eq('assignment_id', submission.assignment_id)
    .eq('student_id', user.id)
    .maybeSingle()
  if (extensionError) return { error: true }
  return readAttemptClockFromRows({
    submission,
    durationMinutes: assignment?.duration_minutes ?? null,
    endAt: assignment?.end_at ?? null,
    extendedEndAt: extension?.extended_end_at ?? null,
  }, new Date())
}
