import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { gradeAndFinalizeSubmission } from '@/lib/submission-finalization.server'

/** Only the authenticated cron route calls the global worker. Student
 * recovery always passes an exact owned submission instead. */
export async function runAttemptFinalizer() {
  const admin = createAdminClient()
  const { error: closeError } = await admin.rpc('close_expired_submission_attempts', { p_limit: 500 })
  if (closeError) throw new Error('attempt_close_failed')
  const { data, error } = await admin.rpc('pending_exercise_submission_finalization', { p_limit: 40 })
  if (error || !Array.isArray(data)) throw new Error('attempt_queue_failed')
  const rounds: { id: string; student_id: string }[] = data
  let completed = 0
  let failed = 0
  for (let i = 0; i < (rounds?.length ?? 0); i += 4) {
    const results = await Promise.allSettled(rounds!.slice(i, i + 4).map(round => (
      gradeAndFinalizeSubmission(admin, round.id, round.student_id, {
        enforceWorkImage: false, enforceSecureBrowser: false, expiredOnly: true,
      })
    )))
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) completed++
      else failed++
    }
  }
  return { completed, failed }
}
