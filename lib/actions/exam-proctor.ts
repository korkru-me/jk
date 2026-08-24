'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { normalizeProctorEvents } from '@/lib/exam-proctor'

interface RecordProctorSignalInput {
  submissionId: string
  clientInstanceId: string
  tabVisible: boolean
  fullscreen: boolean
  connectionClosed?: boolean
  events: unknown
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function recordProctorSignal(input: RecordProctorSignalInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (!UUID_PATTERN.test(input.submissionId)) return { error: 'ข้อมูลการสอบไม่ถูกต้อง' }
  if (!UUID_PATTERN.test(input.clientInstanceId)) return { error: 'ข้อมูลการเชื่อมต่อไม่ถูกต้อง' }
  if (typeof input.tabVisible !== 'boolean' || typeof input.fullscreen !== 'boolean') {
    return { error: 'สถานะหน้าสอบไม่ถูกต้อง' }
  }
  const events = normalizeProctorEvents(input.events)
  if (!events) return { error: 'เหตุการณ์คุมสอบไม่ถูกต้อง' }

  // The admin client is used only after authentication and an exact
  // submission-owner check. The database function repeats these invariants
  // and rejects attempts that are no longer in progress or not configured
  // for proctoring.
  const admin = createAdminClient()
  const { data: submission } = await admin
    .from('submissions')
    .select('id, student_id, status, assignments(proctoring_enabled, mode)')
    .eq('id', input.submissionId)
    .eq('student_id', user.id)
    .maybeSingle()

  const assignment = Array.isArray(submission?.assignments)
    ? submission.assignments[0]
    : submission?.assignments
  if (
    !submission
    || submission.student_id !== user.id
    || submission.status !== 'in_progress'
    || assignment?.proctoring_enabled !== true
    || assignment.mode !== 'online'
  ) {
    return { error: 'ไม่สามารถบันทึกสถานะคุมสอบนี้ได้' }
  }

  const { data: activeConnectionCount, error } = await admin.rpc('record_exam_proctor_signal', {
    p_submission_id: input.submissionId,
    p_student_id: user.id,
    p_client_instance_id: input.clientInstanceId,
    p_tab_visible: input.tabVisible,
    p_fullscreen: input.fullscreen,
    p_connection_closed: input.connectionClosed === true,
    p_events: events.map(event => ({ id: event.id, type: event.type, client_at: event.clientAt })),
  })

  if (error) return { error: 'บันทึกสถานะคุมสอบไม่สำเร็จ' }
  return {
    success: true as const,
    activeConnectionCount: typeof activeConnectionCount === 'number'
      ? Math.max(0, Math.floor(activeConnectionCount))
      : 0,
  }
}
