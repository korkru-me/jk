'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUser } from '@/lib/auth/server'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { createAdminClient } from '@/lib/supabase/admin'
import type { GradingDraftError, GradingDraftItem, SaveGradingDraftsInput, SaveGradingDraftsResult, PublishGradingDraftsInput, PublishGradingDraftsResult } from '@/lib/grading-draft-types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
const isScore = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000
const isRevision = (value: unknown): value is string | null => value === null || (
  typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
)

function normalizedInput(input: SaveGradingDraftsInput, publish: boolean): SaveGradingDraftsInput | null {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !isId(input.assignmentId) || !isId(input.requestId)
    || !Array.isArray(input.items) || input.items.length === 0 || input.items.length > 5000) return null
  const ids = new Set<string>()
  const items: GradingDraftItem[] = []
  for (const item of input.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !isId(item.answerId)
      || !isRevision(item.expectedScoreEditedAt) || !isRevision(item.expectedDraftUpdatedAt) || ids.has(item.answerId.toLowerCase())) return null
    ids.add(item.answerId.toLowerCase())
    const answer = Object.hasOwn(item, 'answerScore'), work = Object.hasOwn(item, 'workScore')
    const remove = item.remove === true
    if (Object.hasOwn(item, 'remove') && !remove || (remove && (publish || answer || work))
      || (!remove && !answer && !work) || answer && !isScore(item.answerScore) || work && !isScore(item.workScore)) return null
    items.push({ answerId: item.answerId.toLowerCase(), expectedScoreEditedAt: item.expectedScoreEditedAt,
      expectedDraftUpdatedAt: item.expectedDraftUpdatedAt, ...(remove ? { remove: true as const } : {}),
      ...(answer ? { answerScore: item.answerScore } : {}), ...(work ? { workScore: item.workScore } : {}),
    })
  }
  // Stable ordering binds retries to one payload and gives SQL a consistent
  // lock order; the caller still chooses every exact authorized answer ID.
  items.sort((left, right) => left.answerId.localeCompare(right.answerId))
  return { assignmentId: input.assignmentId.toLowerCase(), requestId: input.requestId.toLowerCase(), items }
}

function draftError(error: { code?: string }): GradingDraftError {
  if (error.code === '42501') return { error: 'ไม่มีสิทธิ์บันทึกคะแนนของงานนี้', code: 'permission' }
  if (error.code === 'PT409' || error.code === '23505') return { error: 'คะแนนหรือร่างคะแนนเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก', code: 'conflict' }
  if (['22023', '22P02', '22007', '22008'].includes(error.code ?? '')) return { error: 'ข้อมูลคะแนนหรือรุ่นร่างไม่ถูกต้อง กรุณาตรวจคะแนนเต็มและสถานะคำตอบ', code: 'validation' }
  if (error.code?.startsWith('PGRST') || ['42883', '42P01', '42703'].includes(error.code ?? '')) {
    return { error: 'ฐานข้อมูลนี้ยังไม่ได้ติดตั้งระบบร่างและเผยแพร่คะแนน กรุณาติดตั้ง migration ก่อนใช้งาน', code: 'unavailable' }
  }
  return { error: 'บันทึกคะแนนไม่สำเร็จ ร่างคะแนนยังอยู่ กรุณาลองใหม่', code: 'connection' }
}

function invalidatePublished(assignmentId: string, submissionIds: string[]) {
  for (const path of ['/assignments', '/dashboard', `/assignments/${assignmentId}`, `/assignments/${assignmentId}/results`, `/assignments/${assignmentId}/analytics`]) revalidatePath(path)
  revalidatePath('/classrooms', 'layout')
  revalidatePath(`/assignments/${assignmentId}/results`, 'layout')
  for (const id of new Set(submissionIds)) revalidatePath(`/submissions/${id}`)
}

/** Save private draft rows only. No published scores, audit grades or learner
 * notifications are written; one RPC atomically checks the whole draft batch. */
export async function saveGradingDrafts(input: SaveGradingDraftsInput): Promise<SaveGradingDraftsResult> {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ', code: 'permission' }
  const normalized = normalizedInput(input, false)
  if (!normalized) return { error: 'ข้อมูลร่างคะแนนไม่ถูกต้อง กรุณาตรวจคะแนนและรุ่นข้อมูล', code: 'validation' }
  if (!await canManageAssignment(normalized.assignmentId, user.id)) return { error: 'ไม่มีสิทธิ์บันทึกคะแนนของงานนี้', code: 'permission' }
  try {
    const { data, error } = await createAdminClient().rpc('save_grading_drafts', {
      p_actor_id: user.id, p_assignment_id: normalized.assignmentId, p_request_id: normalized.requestId, p_items: normalized.items,
    })
    if (error) return draftError(error)
    if (!data || data.success !== true || data.requestId !== normalized.requestId || !Array.isArray(data.drafts) || !Array.isArray(data.deletedDraftIds)) return draftError({})
    revalidatePath(`/assignments/${normalized.assignmentId}/results`, 'layout')
    return data as SaveGradingDraftsResult
  } catch { return draftError({}) }
}

/** The confirmation submits one atomic publication: guarded existing grading
 * writes, recipient notifications, exact private-draft clears and retry receipt. */
export async function publishGradingDrafts(input: PublishGradingDraftsInput): Promise<PublishGradingDraftsResult> {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ', code: 'permission' }
  const normalized = normalizedInput(input, true)
  if (!normalized || input.confirmed !== true) return { error: 'กรุณาตรวจร่างคะแนนและยืนยันเผยแพร่ก่อนบันทึก', code: 'validation' }
  if (!await canManageAssignment(normalized.assignmentId, user.id)) return { error: 'ไม่มีสิทธิ์บันทึกคะแนนของงานนี้', code: 'permission' }
  try {
    const { data, error } = await createAdminClient().rpc('publish_grading_drafts', {
      p_actor_id: user.id, p_assignment_id: normalized.assignmentId, p_request_id: normalized.requestId, p_items: normalized.items,
    })
    if (error) return draftError(error)
    if (!data || data.success !== true || data.requestId !== normalized.requestId || !Array.isArray(data.published) || !Array.isArray(data.deletedDraftIds) || typeof data.notificationCount !== 'number') return draftError({})
    invalidatePublished(normalized.assignmentId, data.published.map((row: { submissionId: string }) => row.submissionId))
    return data as PublishGradingDraftsResult
  } catch { return draftError({}) }
}
