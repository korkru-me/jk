import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { gradeAndFinalizeSubmission } from '@/lib/submission-finalization.server'
import { drainFinalizationQueue, type QueuedRound } from '@/lib/finalization-queue'

/** Only the authenticated cron route calls the global worker. Student
 * recovery always passes an exact owned submission instead. */
export async function runAttemptFinalizer() {
  const admin = createAdminClient()
  const { error: closeError } = await admin.rpc('close_expired_submission_attempts', { p_limit: 500 })
  if (closeError) throw new Error('attempt_close_failed')
  const { completed, failed } = await drainFinalizationQueue({
    fetchBatch: async limit => {
      const { data, error } = await admin.rpc('pending_exercise_submission_finalization', { p_limit: limit })
      if (error || !Array.isArray(data)) throw new Error('attempt_queue_failed')
      return data as QueuedRound[]
    },
    finalize: async round => {
      const result = await gradeAndFinalizeSubmission(admin, round.id, round.student_id, {
        enforceWorkImage: false, enforceSecureBrowser: false, expiredOnly: true,
      })
      return result.success === true
    },
  })
  return { completed, failed }
}
