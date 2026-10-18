'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUser } from '@/lib/auth/server'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { createAdminClient } from '@/lib/supabase/admin'

export interface SaveGradingReviewInput {
  assignmentId: string
  answerId: string
  expectedScoreEditedAt: string | null
  /** Omitted means preserve this component. Blank/null never means zero. */
  answerScore?: number
  workScore?: number
}
export interface ConfigureGradingPartsInput {
  assignmentId: string
  questionId: string
  answerMaxScore: number
  workMaxScore: number
  expectedUpdatedAt: string | null
}
export type GradingReviewActionResult = { error: string } | { success: true }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
const isScore = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000
const isRevision = (value: unknown): value is string | null => value === null || (
  typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
)

function reviewError(error: { code?: string; message?: string }): string {
  if (error.code === '42501') return 'ไม่มีสิทธิ์ตรวจหรือแก้คะแนนของงานนี้'
  if (error.code === 'PT425') return 'ยังมีนักเรียนกำลังทำ กรุณารอให้ส่งงานครบก่อนเปลี่ยนสัดส่วนคะแนน'
  if (error.code === 'PT409') return 'คะแนนหรือสัดส่วนคะแนนเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก'
  if (error.code === '22023') return 'คะแนนหรือสัดส่วนไม่ถูกต้อง กรุณาตรวจคะแนนเต็มและสถานะของข้อนี้'
  if (error.code?.startsWith('PGRST') || ['42883', '42P01', '42703'].includes(error.code ?? '')) {
    return 'ฐานข้อมูลนี้ยังไม่ได้ติดตั้งระบบตรวจคะแนนแยกส่วน กรุณาติดตั้ง migration ก่อนใช้งาน'
  }
  return 'บันทึกคะแนนไม่สำเร็จ กรุณาลองใหม่'
}

function invalidate(assignmentId: string, submissionId?: string) {
  for (const path of ['/assignments', '/dashboard', `/assignments/${assignmentId}`, `/assignments/${assignmentId}/results`, `/assignments/${assignmentId}/analytics`]) revalidatePath(path)
  revalidatePath('/classrooms', 'layout')
  revalidatePath(`/assignments/${assignmentId}/results`, 'layout')
  if (submissionId) revalidatePath(`/submissions/${submissionId}`)
}

/** One RPC locks, verifies the exact assignment and atomically updates both parts and the total. */
export async function saveGradingReview(input: SaveGradingReviewInput): Promise<GradingReviewActionResult> {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !isId(input.assignmentId) || !isId(input.answerId) || !isRevision(input.expectedScoreEditedAt)) {
    return { error: 'ข้อมูลคำตอบหรือรุ่นคะแนนไม่ถูกต้อง กรุณาโหลดหน้าใหม่' }
  }
  const answerChanged = Object.hasOwn(input, 'answerScore')
  const workChanged = Object.hasOwn(input, 'workScore')
  if ((!answerChanged && !workChanged) || (answerChanged && !isScore(input.answerScore)) || (workChanged && !isScore(input.workScore))) {
    return { error: 'กรุณากรอกคะแนนเป็นตัวเลขตั้งแต่ 0 ขึ้นไป ช่องว่างยังบันทึกเป็นคะแนนไม่ได้' }
  }
  if (!await canManageAssignment(input.assignmentId, user.id)) return { error: 'ไม่มีสิทธิ์ตรวจหรือแก้คะแนนของงานนี้' }
  const { data, error } = await createAdminClient().rpc('save_grading_review', {
    p_actor_id: user.id, p_assignment_id: input.assignmentId, p_answer_id: input.answerId,
    p_expected_score_edited_at: input.expectedScoreEditedAt,
    p_answer_score: answerChanged ? input.answerScore : null,
    p_work_score: workChanged ? input.workScore : null,
    p_update_answer: answerChanged, p_update_work: workChanged,
  })
  if (error) return { error: reviewError(error) }
  invalidate(input.assignmentId, typeof data?.submission_id === 'string' ? data.submission_id : undefined)
  return { success: true }
}

/** An assignment-local fraction keeps each attempt's original raw question weight unchanged. */
export async function configureGradingParts(input: ConfigureGradingPartsInput): Promise<GradingReviewActionResult> {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !isId(input.assignmentId) || !isId(input.questionId) || !isRevision(input.expectedUpdatedAt)
    || !isScore(input.answerMaxScore) || !isScore(input.workMaxScore) || input.answerMaxScore + input.workMaxScore <= 0) {
    return { error: 'กรุณากำหนดคะแนนคำตอบและวิธีทำเป็นตัวเลข โดยคะแนนเต็มรวมต้องมากกว่า 0' }
  }
  if (!await canManageAssignment(input.assignmentId, user.id)) return { error: 'ไม่มีสิทธิ์กำหนดคะแนนของงานนี้' }
  const { error } = await createAdminClient().rpc('configure_assignment_question_grading_parts', {
    p_actor_id: user.id, p_assignment_id: input.assignmentId, p_question_id: input.questionId,
    p_answer_max_score: input.answerMaxScore, p_work_max_score: input.workMaxScore,
    p_expected_updated_at: input.expectedUpdatedAt,
  })
  if (error) return { error: reviewError(error) }
  invalidate(input.assignmentId)
  revalidatePath('/submissions', 'layout')
  return { success: true }
}
