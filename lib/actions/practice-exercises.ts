'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUser } from '@/lib/auth/server'
import { hasPracticeAccessSession } from '@/lib/practice-access-session.server'
import { loadPracticeLibraryWaiting, loadPracticeQuestionForStudent } from '@/lib/practice-question-access.server'
import { practiceExerciseSchema, practiceExerciseUpdateSchema, practiceReviewPinSchema } from '@/lib/practice-exercises'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildQuestionSolution, type QuestionSolution } from '@/lib/question-solution'
import { isUuid } from '@/lib/practice-library-contracts'

async function studentAccess(libraryId: string) {
  if (!isPracticeLibraryEnabled(process.env) || !isUuid(libraryId)) return null
  const user = await getAuthUser()
  if (!user) return null
  const access = await loadPracticeLibraryWaiting(user.id, libraryId)
  if (access.status !== 'ready' || (access.library.requiresAccessCode
    && !await hasPracticeAccessSession(user.id, libraryId))) return null
  return { user, library: access.library }
}

export async function createPracticeExercise(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = practiceExerciseSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'กรุณาตั้งชื่อแบบฝึกหัดและเลือกโจทย์ 1–500 ข้อ' }
  try {
    const access = await studentAccess(parsed.data.libraryId)
    if (!access) return { ok: false, error: 'ไม่สามารถเข้าถึงคลังฝึกนี้ได้ กรุณาเข้าคลังฝึกอีกครั้ง' }
    const { error } = await createAdminClient().rpc('create_student_practice_exercise', {
      p_actor_id: access.user.id, p_library_id: parsed.data.libraryId, p_id: parsed.data.id,
      p_title: parsed.data.title, p_question_ids: parsed.data.questionIds,
    })
    if (error) return { ok: false, error: 'ยังบันทึกแบบฝึกหัดไม่ได้ กรุณาลองอีกครั้ง' }
    revalidatePath(`/practice/${parsed.data.libraryId}/library`)
    return { ok: true }
  } catch { return { ok: false, error: 'ยังบันทึกแบบฝึกหัดไม่ได้ กรุณาลองอีกครั้ง' } }
}

/** Only explicitly attached working is exposed, under the library's reveal setting. */
export async function getPracticeAttachedSolution(libraryId: string, questionId: string): Promise<
  { data: QuestionSolution } | { error: string }
> {
  const denied = { error: 'ไม่พบเฉลยหรือไม่สามารถเข้าถึงได้' }
  if (!isUuid(questionId)) return denied
  try {
    const access = await studentAccess(libraryId)
    if (!access || !access.library.revealAnswerKey) return denied
    const question = await loadPracticeQuestionForStudent(access.user.id, libraryId, questionId)
    if (question.status !== 'ready') return denied
    const { data, error } = await createAdminClient().from('questions')
      .select('id, title, solution_text, solution_image_urls').eq('id', questionId).maybeSingle()
    if (error || !data) return denied
    return { data: buildQuestionSolution(data, []) }
  } catch { return denied }
}


export async function updatePracticeExercise(input: unknown): Promise<
  { ok: true } | { ok: false; error: string; conflict?: boolean }
> {
  const parsed = practiceExerciseUpdateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'กรุณาตั้งชื่อแบบฝึกหัดและเลือกโจทย์ 1–500 ข้อ' }
  try {
    const access = await studentAccess(parsed.data.libraryId)
    if (!access) return { ok: false, error: 'ไม่สามารถเข้าถึงคลังฝึกนี้ได้ กรุณาเข้าคลังฝึกอีกครั้ง' }
    const { error } = await createAdminClient().rpc('update_student_practice_exercise', {
      p_actor_id: access.user.id, p_library_id: parsed.data.libraryId, p_id: parsed.data.id,
      p_title: parsed.data.title, p_question_ids: parsed.data.questionIds,
      p_expected_revision: parsed.data.expectedRevision,
    })
    if (error?.code === 'PT409') return { ok: false, conflict: true, error: 'แบบฝึกหัดถูกแก้จากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไขต่อ' }
    if (error) return { ok: false, error: 'ยังบันทึกการแก้ไขไม่ได้ กรุณาลองอีกครั้ง' }
    revalidatePath(`/practice/${parsed.data.libraryId}/library`)
    return { ok: true }
  } catch { return { ok: false, error: 'ยังบันทึกการแก้ไขไม่ได้ กรุณาลองอีกครั้ง' } }
}

export async function setPracticeReviewPin(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = practiceReviewPinSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'ข้อมูลโจทย์ไม่ถูกต้อง' }
  try {
    const access = await studentAccess(parsed.data.libraryId)
    if (!access) return { ok: false, error: 'ไม่สามารถเข้าถึงคลังฝึกนี้ได้ กรุณาเข้าคลังฝึกอีกครั้ง' }
    const { error } = await createAdminClient().rpc('set_student_practice_review_pin', {
      p_actor_id: access.user.id, p_library_id: parsed.data.libraryId,
      p_question_id: parsed.data.questionId, p_pinned: parsed.data.pinned,
    })
    if (error) return { ok: false, error: 'ยังบันทึกการปักโจทย์ไม่ได้ กรุณาลองอีกครั้ง' }
    revalidatePath(`/practice/${parsed.data.libraryId}/library`)
    return { ok: true }
  } catch { return { ok: false, error: 'ยังบันทึกการปักโจทย์ไม่ได้ กรุณาลองอีกครั้ง' } }
}
