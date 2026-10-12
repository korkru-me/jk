'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUser } from '@/lib/auth/server'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  LATE_BAND_COLOR_IDS,
  classifySubmissionTimingsByStudent,
  studentIdsForLateColor,
  type AssignmentLateBand,
  type LateBandColorId,
} from '@/lib/late-submission'

export interface ApplyLateColorScoreAdjustmentInput {
  assignmentId: string
  color: LateBandColorId
  adjustment: number
  reason?: string
}

const COLOR_IDS = new Set<string>(LATE_BAND_COLOR_IDS)

/** Replace (not increment) the display-point adjustment for everyone whose
 * first completed hand-in is in the requested colour. Student ids are derived
 * again on the server so a stale or tampered browser cannot widen the target. */
export async function applyLateColorScoreAdjustment(input: ApplyLateColorScoreAdjustmentInput) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const assignmentId = typeof input.assignmentId === 'string' ? input.assignmentId : ''
  if (!assignmentId || !COLOR_IDS.has(input.color)) return { error: 'กลุ่มสีไม่ถูกต้อง' }
  if (!Number.isFinite(input.adjustment) || input.adjustment < -10000 || input.adjustment > 10000) {
    return { error: 'ค่าปรับคะแนนต้องอยู่ระหว่าง -10,000 ถึง 10,000' }
  }
  const adjustment = Math.round(input.adjustment * 100) / 100
  const reason = input.reason?.trim() || null
  if (reason && reason.length > 200) return { error: 'เหตุผลต้องไม่เกิน 200 ตัวอักษร' }
  if (!await canManageAssignment(assignmentId, user.id)) return { error: 'ไม่มีสิทธิ์ปรับคะแนนงานนี้' }

  const admin = createAdminClient()
  const [{ data: assignment }, { data: submissions }, { data: extensions }] = await Promise.all([
    admin
      .from('assignments')
      .select('id, org_id, due_at, end_at, late_bands, completion_rule')
      .eq('id', assignmentId)
      .maybeSingle(),
    admin
      .from('submissions')
      .select('student_id, status, submitted_at')
      .eq('assignment_id', assignmentId),
    admin
      .from('assignment_extensions')
      .select('student_id, extended_due_at, extended_end_at')
      .eq('assignment_id', assignmentId),
  ])

  if (!assignment) return { error: 'ไม่พบงานที่มอบหมาย' }
  if (assignment.completion_rule === 'streak') return { error: 'งานแบบถูกติดต่อกันไม่มีคะแนนรวมให้ปรับ' }
  const bands = (assignment.late_bands ?? []) as AssignmentLateBand[]
  if (!bands.some(band => band.color === input.color)) return { error: 'งานนี้ไม่มีกลุ่มสีที่เลือก' }

  const timings = classifySubmissionTimingsByStudent({
    dueAt: assignment.due_at,
    endAt: assignment.end_at,
    bands,
    submissions: (submissions ?? []) as Array<{
      student_id: string
      status: 'in_progress' | 'submitted' | 'graded'
      submitted_at: string | null
    }>,
    extensions: extensions ?? [],
  })
  const studentIds = studentIdsForLateColor(timings, input.color)
  if (studentIds.length === 0) return { error: 'ยังไม่มีนักเรียนที่ส่งงานในกลุ่มสีนี้' }

  const { data: batchId, error } = await admin.rpc('apply_assignment_score_adjustment', {
    p_org_id: assignment.org_id,
    p_assignment_id: assignmentId,
    p_student_ids: studentIds,
    p_color: input.color,
    p_adjustment: adjustment,
    p_reason: reason,
    p_changed_by: user.id,
  } as never)
  if (error) return { error: error.message }

  revalidatePath(`/assignments/${assignmentId}`)
  revalidatePath(`/assignments/${assignmentId}/results`)

  return { success: true as const, batchId: batchId as string, affectedCount: studentIds.length }
}
