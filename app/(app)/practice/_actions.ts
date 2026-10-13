'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { QuestionPreviewDetail } from '@/lib/actions/question-previews'
import { fetchRowsInChunks } from '@/lib/supabase/fetch-all-rows'
import {
  isPracticeLibraryEnabled,
  practiceQuestionSupport,
  type PracticeQuestionShape,
} from '@/lib/practice-question'
import {
  canManagePracticeLibrary,
  BULK_UPDATE_PRACTICE_QUESTION_TAGS_RPC,
  CREATE_PRACTICE_LIBRARY_RPC,
  DUPLICATE_PRACTICE_LIBRARY_RPC,
  UPDATE_PRACTICE_LIBRARY_DRAFT_RPC,
  isUuid,
  type PracticeLibraryStatus,
} from '@/lib/practice-library-contracts'
import {
  canChangePracticeQuestionMembership,
  canDeletePracticeLibrary,
  canTransitionPracticeLibrary,
  createPracticeLibrarySchema,
  fieldsFromZodError,
  isEligiblePracticeClassroom,
  practiceBulkTagSchema,
  practiceLibraryIdSchema,
  updatePracticeLibrarySchema,
  type CreatePracticeLibraryInput,
  type PracticeBulkTagInput,
  type PracticeLibraryActionResult,
  type UpdatePracticeLibraryInput,
} from './_lib/teacher-contract'
import {
  authenticatePracticeTeacher,
  loadPracticeClassroomAccess,
  loadPracticeLibraryForTeacher,
  loadPracticeLibraryQuestionIds,
  loadManagedPracticeQuestionRows,
  type ManagedPracticeQuestionRow,
} from './_lib/teacher-data'
import { sanitizeRichTextForStorage } from '@/lib/rich-text-sanitize'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type PracticeQuestionRow = PracticeQuestionShape & { id: string }

const FEATURE_DISABLED = 'คลังฝึกยังไม่ได้เปิดใช้ในสภาพแวดล้อมนี้'
const FORBIDDEN = 'ไม่พบคลังฝึก หรือคุณไม่มีสิทธิ์จัดการ'

function failure(error: string, fields?: Record<string, string[]>): PracticeLibraryActionResult {
  return { ok: false, error, ...(fields ? { fields } : {}) }
}

async function actionContext(): Promise<
  | { ok: true; supabase: SupabaseServerClient; userId: string }
  | { ok: false; result: PracticeLibraryActionResult }
> {
  if (!isPracticeLibraryEnabled(process.env)) {
    return { ok: false, result: failure(FEATURE_DISABLED) }
  }
  const supabase = await createClient()
  const actor = await authenticatePracticeTeacher(supabase)
  if (!actor.ok) return { ok: false, result: failure(actor.error) }
  return { ok: true, supabase, userId: actor.userId }
}

function supportAllowsPractice(question: PracticeQuestionRow): boolean {
  return practiceQuestionSupport(question).supported
}

async function validatePracticeQuestions(
  supabase: SupabaseServerClient,
  ids: string[],
  trustedExisting: ManagedPracticeQuestionRow[] = [],
): Promise<string | null> {
  if (ids.length === 0) return null
  const trustedById = new Map(trustedExisting.map(question => [question.id, question]))
  const unread = ids.filter(id => !trustedById.has(id))
  const { rows, error } = await fetchRowsInChunks<PracticeQuestionRow, string>(unread, chunk => (
    supabase
      .from('questions')
      .select('id, question_type, variables, logic_rules, answer_formula, answer_parts, mcq_options, extra_data')
      .in('id', chunk)
      .eq('is_research_snapshot', false)
  ))
  const visibleById = new Map(rows.map(question => [question.id, question]))
  const questions = ids.map(id => trustedById.get(id) ?? visibleById.get(id))
  if (error || questions.some(question => !question)) {
    return 'มีโจทย์ที่ไม่พบหรือคุณไม่มีสิทธิ์ใช้งาน'
  }
  if (questions.some(question => !supportAllowsPractice(question as PracticeQuestionRow))) {
    return 'คลังฝึกรองรับเฉพาะโจทย์ที่ตรวจคำตอบอัตโนมัติได้'
  }
  return null
}

async function createLibraryRow(input: {
  supabase: SupabaseServerClient
  orgId: string
  classroomId: string
  title: string
  description: string
  revealAnswerKey: boolean
  questionIds: string[]
  publish: boolean
}): Promise<PracticeLibraryActionResult> {
  const result = await input.supabase.rpc(CREATE_PRACTICE_LIBRARY_RPC, {
    p_org_id: input.orgId,
    p_classroom_id: input.classroomId,
    p_title: input.title,
    p_description: input.description || null,
    p_reveal_answer_key: input.revealAnswerKey,
    p_question_ids: input.questionIds,
    p_publish: input.publish,
  })
  const libraryId = typeof result.data === 'string' ? result.data : null
  if (result.error || !libraryId) return failure('สร้างคลังฝึกไม่สำเร็จ กรุณาลองใหม่')

  revalidatePath('/practice')
  return { ok: true, id: libraryId }
}

export async function createPracticeLibrary(
  rawInput: CreatePracticeLibraryInput,
): Promise<PracticeLibraryActionResult> {
  const parsed = createPracticeLibrarySchema.safeParse(rawInput)
  if (!parsed.success) {
    return failure('ตรวจสอบข้อมูลคลังฝึกอีกครั้ง', fieldsFromZodError(parsed.error))
  }
  if (parsed.data.intent === 'publish' && parsed.data.questionIds.length === 0) {
    return failure('เลือกโจทย์อย่างน้อย 1 ข้อก่อนเผยแพร่', {
      questionIds: ['เลือกโจทย์อย่างน้อย 1 ข้อ'],
    })
  }

  const context = await actionContext()
  if (!context.ok) return context.result
  const classroom = await loadPracticeClassroomAccess(
    context.supabase,
    context.userId,
    parsed.data.classroomId,
  )
  if (!classroom || !canManagePracticeLibrary(classroom.access)) return failure(FORBIDDEN)
  if (!isEligiblePracticeClassroom({
    status: classroom.status,
    classroomType: classroom.classroom_type,
  })) {
    return failure('สร้างคลังฝึกได้เฉพาะในห้องเรียนรายวิชาที่เปิดใช้งาน')
  }
  const questionError = await validatePracticeQuestions(context.supabase, parsed.data.questionIds)
  if (questionError) return failure(questionError, { questionIds: [questionError] })

  return createLibraryRow({
    supabase: context.supabase,
    orgId: classroom.org_id,
    classroomId: classroom.id,
    title: parsed.data.title,
    description: sanitizeRichTextForStorage(parsed.data.description.trim()),
    revealAnswerKey: parsed.data.revealAnswerKey,
    questionIds: parsed.data.questionIds,
    publish: parsed.data.intent === 'publish',
  })
}

export async function updatePracticeLibrary(
  rawInput: UpdatePracticeLibraryInput,
): Promise<PracticeLibraryActionResult> {
  const parsed = updatePracticeLibrarySchema.safeParse(rawInput)
  if (!parsed.success) {
    return failure('ตรวจสอบข้อมูลคลังฝึกอีกครั้ง', fieldsFromZodError(parsed.error))
  }
  const context = await actionContext()
  if (!context.ok) return context.result
  const loaded = await loadPracticeLibraryForTeacher(
    context.supabase,
    context.userId,
    parsed.data.libraryId,
  )
  if (!loaded?.canManage) return failure(FORBIDDEN)
  const description = sanitizeRichTextForStorage(parsed.data.description.trim())

  const currentMembership = await loadPracticeLibraryQuestionIds(context.supabase, loaded.library.id)
  if (currentMembership.error) return failure(currentMembership.error)
  if (!canChangePracticeQuestionMembership(loaded.library.status)) {
    const unchanged = currentMembership.ids.length === parsed.data.questionIds.length
      && currentMembership.ids.every((id, index) => id === parsed.data.questionIds[index])
    if (!unchanged) return failure('รายการโจทย์ถูกตรึงหลังเผยแพร่ครั้งแรก')
  } else {
    const managed = await loadManagedPracticeQuestionRows(context.userId, loaded.library.id)
    if (managed.error) return failure(managed.error)
    const questionError = await validatePracticeQuestions(
      context.supabase,
      parsed.data.questionIds,
      managed.rows,
    )
    if (questionError) return failure(questionError, { questionIds: [questionError] })
  }

  if (canChangePracticeQuestionMembership(loaded.library.status)) {
    const result = await context.supabase.rpc(UPDATE_PRACTICE_LIBRARY_DRAFT_RPC, {
      p_library_id: loaded.library.id,
      p_title: parsed.data.title,
      p_description: description || null,
      p_reveal_answer_key: parsed.data.revealAnswerKey,
      p_question_ids: parsed.data.questionIds,
    })
    const savedCount = typeof result.data === 'number' ? result.data : Number(result.data)
    if (result.error || !Number.isSafeInteger(savedCount)
      || savedCount !== parsed.data.questionIds.length) {
      return failure('บันทึกคลังฝึกไม่สำเร็จ ข้อมูลเดิมยังไม่เปลี่ยนแปลง')
    }
  } else {
    const { data: updated, error } = await context.supabase
      .from('practice_libraries')
      .update({
        title: parsed.data.title,
        description: description || null,
        reveal_answer_key: parsed.data.revealAnswerKey,
      })
      .eq('id', loaded.library.id)
      .select('id')
      .maybeSingle()
    if (error || !updated) return failure('บันทึกคลังฝึกไม่สำเร็จ')
  }

  revalidatePath('/practice')
  revalidatePath(`/practice/${loaded.library.id}`)
  revalidatePath(`/practice/${loaded.library.id}/library`)
  revalidatePath(`/practice/${loaded.library.id}/edit`)
  return { ok: true, id: loaded.library.id }
}

async function transitionPracticeLibrary(
  rawInput: unknown,
  target: PracticeLibraryStatus,
): Promise<PracticeLibraryActionResult> {
  const parsed = practiceLibraryIdSchema.safeParse(rawInput)
  if (!parsed.success) return failure('รหัสคลังฝึกไม่ถูกต้อง')
  const context = await actionContext()
  if (!context.ok) return context.result
  const loaded = await loadPracticeLibraryForTeacher(
    context.supabase,
    context.userId,
    parsed.data.libraryId,
  )
  if (!loaded?.canManage) return failure(FORBIDDEN)
  if (!canTransitionPracticeLibrary(loaded.library.status, target)) {
    return failure('สถานะคลังฝึกเปลี่ยนไปแล้ว โหลดหน้าใหม่แล้วลองอีกครั้ง')
  }

  if (target === 'published') {
    const membership = await loadPracticeLibraryQuestionIds(context.supabase, loaded.library.id)
    if (membership.error) return failure(membership.error)
    if (membership.ids.length === 0) return failure('เลือกโจทย์อย่างน้อย 1 ข้อก่อนเผยแพร่')
    const managed = await loadManagedPracticeQuestionRows(context.userId, loaded.library.id)
    if (managed.error) return failure(managed.error)
    const questionError = await validatePracticeQuestions(
      context.supabase,
      membership.ids,
      managed.rows,
    )
    if (questionError) return failure(questionError)
  }

  const { data: changed, error } = await context.supabase
    .from('practice_libraries')
    .update({ status: target })
    .eq('id', loaded.library.id)
    .eq('status', loaded.library.status)
    .select('id')
    .maybeSingle()
  if (error || !changed) return failure('เปลี่ยนสถานะคลังฝึกไม่สำเร็จ')

  revalidatePath('/practice')
  revalidatePath(`/practice/${loaded.library.id}`)
  revalidatePath(`/practice/${loaded.library.id}/library`)
  revalidatePath(`/practice/${loaded.library.id}/edit`)
  return { ok: true, id: loaded.library.id }
}

export async function publishPracticeLibrary(rawInput: unknown) {
  return transitionPracticeLibrary(rawInput, 'published')
}

export async function closePracticeLibrary(rawInput: unknown) {
  return transitionPracticeLibrary(rawInput, 'closed')
}

export async function duplicatePracticeLibrary(rawInput: unknown): Promise<PracticeLibraryActionResult> {
  const parsed = practiceLibraryIdSchema.safeParse(rawInput)
  if (!parsed.success) return failure('รหัสคลังฝึกไม่ถูกต้อง')
  const context = await actionContext()
  if (!context.ok) return context.result
  const result = await context.supabase.rpc(DUPLICATE_PRACTICE_LIBRARY_RPC, {
    p_source_library_id: parsed.data.libraryId,
  })
  if (result.error || !isUuid(result.data)) return failure('ทำสำเนาคลังฝึกไม่สำเร็จ')
  revalidatePath('/practice')
  return { ok: true, id: result.data }
}

/**
 * Preview loader for the practice editor. Existing owner-private membership is
 * read only through the exact-library manager RPC; newly selectable questions
 * still pass through the actor's ordinary question-bank RLS.
 */
export async function getPracticeQuestionPreviewDetails(
  libraryId: string,
  ids: readonly string[],
): Promise<{ data: QuestionPreviewDetail[] } | { error: string }> {
  if (!isUuid(libraryId) || !Array.isArray(ids) || ids.length > 50
    || ids.some(id => !isUuid(id))) return { error: 'รายการโจทย์ไม่ถูกต้อง' }
  const context = await actionContext()
  if (!context.ok) {
    return { error: 'error' in context.result ? context.result.error : FORBIDDEN }
  }
  const loaded = await loadPracticeLibraryForTeacher(
    context.supabase,
    context.userId,
    libraryId,
  )
  if (!loaded?.canManage) return { error: FORBIDDEN }
  if (ids.length === 0) return { data: [] }

  const managed = await loadManagedPracticeQuestionRows(context.userId, libraryId)
  if (managed.error) return { error: managed.error }
  const managedById = new Map(managed.rows.map(question => [question.id, question]))
  const remaining = [...new Set(ids.filter(id => !managedById.has(id)))]
  const { data, error } = remaining.length === 0
    ? { data: [], error: null }
    : await context.supabase
        .from('questions')
        .select('id,title,question_text,question_type,is_random,variables,answer_parts,mcq_options,image_urls,extra_data')
        .in('id', remaining)
        .eq('is_research_snapshot', false)
  if (error) return { error: 'โหลดโจทย์ไม่สำเร็จ กรุณาลองอีกครั้ง' }
  const visibleById = new Map(((data ?? []) as unknown as QuestionPreviewDetail[])
    .map(question => [question.id, question]))
  const previews = ids.flatMap(id => {
    const question = managedById.get(id) ?? visibleById.get(id)
    if (!question) return []
    return [{
      id: question.id,
      title: question.title,
      question_text: question.question_text,
      question_type: question.question_type,
      is_random: question.is_random,
      variables: question.variables,
      answer_parts: question.answer_parts,
      mcq_options: question.mcq_options,
      image_urls: question.image_urls,
      extra_data: question.extra_data,
    } as QuestionPreviewDetail]
  })
  return { data: previews }
}

export async function deletePracticeLibrary(rawInput: unknown): Promise<PracticeLibraryActionResult> {
  const parsed = practiceLibraryIdSchema.safeParse(rawInput)
  if (!parsed.success) return failure('รหัสคลังฝึกไม่ถูกต้อง')
  const context = await actionContext()
  if (!context.ok) return context.result
  const loaded = await loadPracticeLibraryForTeacher(
    context.supabase,
    context.userId,
    parsed.data.libraryId,
  )
  if (!loaded?.canManage) return failure(FORBIDDEN)
  if (!canDeletePracticeLibrary(loaded.library.status)) {
    return failure('ลบได้เฉพาะคลังฝึกที่ยังเป็นร่าง คลังที่เผยแพร่แล้วให้ปิดแทน')
  }

  const { data: removed, error } = await context.supabase
    .from('practice_libraries')
    .delete()
    .eq('id', loaded.library.id)
    .select('id')
    .maybeSingle()
  if (error || !removed) {
    return failure('ลบคลังฝึกไม่สำเร็จ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง')
  }
  revalidatePath('/practice')
  return { ok: true, id: loaded.library.id }
}

export async function updatePracticeQuestionTags(
  rawInput: PracticeBulkTagInput,
): Promise<PracticeLibraryActionResult> {
  const parsed = practiceBulkTagSchema.safeParse(rawInput)
  if (!parsed.success) {
    return failure('ตรวจรายการโจทย์และแท็กอีกครั้ง', fieldsFromZodError(parsed.error))
  }
  const context = await actionContext()
  if (!context.ok) return context.result
  const loaded = await loadPracticeLibraryForTeacher(
    context.supabase,
    context.userId,
    parsed.data.libraryId,
  )
  if (!loaded?.canManage) return failure(FORBIDDEN)
  const result = await context.supabase.rpc(BULK_UPDATE_PRACTICE_QUESTION_TAGS_RPC, {
    p_library_id: loaded.library.id,
    p_question_ids: parsed.data.questionIds,
    p_operation: parsed.data.operation,
    p_tag: parsed.data.tag,
  })
  const updatedCount = typeof result.data === 'number' ? result.data : Number(result.data)
  if (result.error || !Number.isSafeInteger(updatedCount)
    || updatedCount !== parsed.data.questionIds.length) {
    return failure('แก้แท็กไม่สำเร็จ รายการเดิมยังคงอยู่')
  }

  revalidatePath('/questions')
  revalidatePath(`/practice/${loaded.library.id}`)
  revalidatePath(`/practice/${loaded.library.id}/library`)
  revalidatePath(`/practice/${loaded.library.id}/edit`)
  return { ok: true, id: loaded.library.id }
}
