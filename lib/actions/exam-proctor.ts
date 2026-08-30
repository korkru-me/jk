'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { normalizeProctorEvents } from '@/lib/exam-proctor'
import { normalizeProctorPurgeCounts } from '@/lib/exam-proctor-retention'
import { getExamAccessSession } from '@/lib/exam-access-session'

interface RecordProctorSignalInput {
  submissionId: string
  clientInstanceId: string
  tabVisible: boolean
  fullscreen: boolean
  connectionClosed?: boolean
  events: unknown
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface ProctorEventAcknowledgementRow {
  event_id: number | string
  event_acknowledged_at: string
  event_acknowledged_by: string | null
}

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
    .select('id, student_id, status, assignment_id, assignments(proctoring_enabled, mode, secure_browser_mode, android_exam_mode)')
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
  if (
    assignment.secure_browser_mode === 'seb_required'
    && !await getExamAccessSession(
      user.id,
      submission.assignment_id,
      assignment.android_exam_mode === 'monitored',
    )
  ) {
    return { error: 'เซสชันเข้าสอบหมดอายุ' }
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

export async function purgeAssignmentProctorData(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!UUID_PATTERN.test(assignmentId)) return { error: 'ข้อมูลชุดข้อสอบไม่ถูกต้อง' }

  // Use the session-bound client as the first authorization boundary. The
  // assignment RLS exposes this row only to its owner, admin/manage
  // co-teachers, and the configured super-admin path.
  const { data: assignment, error: assignmentError } = await supabase
    .from('assignments')
    .select('id')
    .eq('id', assignmentId)
    .maybeSingle()
  if (assignmentError || !assignment) return { error: 'ไม่พบชุดข้อสอบหรือไม่มีสิทธิ์จัดการ' }

  // The RPC repeats the exact actor/assignment authorization and performs all
  // three deletes in one transaction. It also refuses to interrupt a room
  // that has received a live heartbeat within the last 45 seconds.
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('purge_exam_proctor_data_for_assignment', {
    p_assignment_id: assignmentId,
    p_actor_id: user.id,
  })
  if (error?.code === '55006') {
    return { error: 'ยังล้างข้อมูลไม่ได้ เพราะมีนักเรียนเชื่อมต่อห้องคุมสอบอยู่' }
  }
  if (error) return { error: 'ล้างข้อมูลคุมสอบไม่สำเร็จ กรุณาลองใหม่' }

  const deleted = normalizeProctorPurgeCounts(data)
  if (!deleted) return { error: 'ระบบตอบกลับข้อมูลการล้างไม่ครบ กรุณาลองใหม่' }

  revalidatePath(`/assignments/${assignmentId}/proctor`)
  return { success: true as const, deleted }
}

export async function acknowledgeProctorEvents(assignmentId: string, eventIds: number[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!UUID_PATTERN.test(assignmentId)) return { error: 'ข้อมูลชุดข้อสอบไม่ถูกต้อง' }
  if (!Array.isArray(eventIds) || eventIds.length < 1 || eventIds.length > 100) {
    return { error: 'รายการเหตุการณ์ไม่ถูกต้อง' }
  }
  if (eventIds.some(id => !Number.isSafeInteger(id) || id < 1)) {
    return { error: 'รายการเหตุการณ์ไม่ถูกต้อง' }
  }
  const normalizedEventIds = [...new Set(eventIds)]

  // Verify every exact event through the caller's RLS visibility before the
  // service-role call. This prevents the action from becoming an event-ID
  // oracle; the RPC below independently repeats mutation authorization.
  const { data: visibleEvents, error: visibilityError } = await supabase
    .from('exam_proctor_events')
    .select('id')
    .eq('assignment_id', assignmentId)
    .in('id', normalizedEventIds)
  if (visibilityError || visibleEvents?.length !== normalizedEventIds.length) {
    return { error: 'ไม่พบเหตุการณ์หรือไม่มีสิทธิ์จัดการ' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('acknowledge_exam_proctor_events', {
    p_assignment_id: assignmentId,
    p_event_ids: normalizedEventIds,
    p_actor_id: user.id,
  })
  if (error?.code === '42501') return { error: 'คุณไม่มีสิทธิ์รับทราบเหตุการณ์ของชุดข้อสอบนี้' }
  if (error) return { error: 'บันทึกการรับทราบไม่สำเร็จ กรุณาลองใหม่' }
  if (!Array.isArray(data)) return { error: 'ระบบตอบกลับข้อมูลการรับทราบไม่ครบ กรุณาลองใหม่' }

  const acknowledgements: Array<{
    eventId: number
    acknowledgedAt: string
    acknowledgedBy: string | null
  }> = []
  for (const row of data as ProctorEventAcknowledgementRow[]) {
    const eventId = typeof row.event_id === 'number' ? row.event_id : Number(row.event_id)
    const acknowledgedAt = Date.parse(row.event_acknowledged_at)
    if (
      !Number.isSafeInteger(eventId)
      || eventId < 1
      || !Number.isFinite(acknowledgedAt)
      || (row.event_acknowledged_by !== null && !UUID_PATTERN.test(row.event_acknowledged_by))
    ) {
      return { error: 'ระบบตอบกลับข้อมูลการรับทราบไม่ครบ กรุณาลองใหม่' }
    }
    acknowledgements.push({
      eventId,
      acknowledgedAt: new Date(acknowledgedAt).toISOString(),
      acknowledgedBy: row.event_acknowledged_by,
    })
  }
  if (
    acknowledgements.length !== normalizedEventIds.length
    || acknowledgements.some(row => (
      !Number.isSafeInteger(row.eventId)
      || row.eventId < 1
      || !normalizedEventIds.includes(row.eventId)
    ))
  ) {
    return { error: 'เหตุการณ์บางรายการไม่รองรับการรับทราบ กรุณาตรวจข้อมูลล่าสุด' }
  }

  revalidatePath(`/assignments/${assignmentId}/proctor`)
  return { success: true as const, acknowledgements }
}
