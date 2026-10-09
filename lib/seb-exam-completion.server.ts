import 'server-only'

import { authorizeWaitingExam, type SebWaitingRouteParams } from '@/lib/seb-waiting.server'

/** No scores, answers or solutions. Only a committed exact-scope receipt. */
export async function readWaitingCompletion(params: SebWaitingRouteParams) {
  const access = await authorizeWaitingExam(params)
  if (!access.ok) return null
  const { data: receipt, error } = await access.admin.from('submissions')
    .select('id, status, submitted_at, exam_access_mode, seb_config_revision')
    .eq('assignment_id', access.context.assignmentId).eq('student_id', access.user.id)
    .order('attempt_number', { ascending: false }).limit(1).maybeSingle()
  if (error || !receipt || !['submitted', 'graded'].includes(receipt.status) || !receipt.submitted_at
    || receipt.exam_access_mode !== 'seb' || receipt.seb_config_revision !== access.context.revision) return null
  return { ...access, receipt }
}
