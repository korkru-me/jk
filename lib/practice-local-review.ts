import { z } from 'zod'
import {
  practiceExerciseSchema, practiceExerciseUpdateSchema, practiceExerciseDeleteSchema, practiceReviewPinSchema,
  type PracticeExercise,
} from '@/lib/practice-exercises'
import type { PracticeQuestionListItem } from '@/lib/practice-question-access.server'

export function isLocalPracticeReviewEnabled(environment: Pick<NodeJS.ProcessEnv, 'NODE_ENV'>): boolean {
  return environment.NODE_ENV === 'development'
}

const storedExerciseSchema = practiceExerciseSchema.omit({ libraryId: true })
  .extend({ revision: z.number().int().positive() })
export const practiceLocalReviewSchema = z.object({
  exercises: z.array(storedExerciseSchema).max(1000),
  pinnedQuestionIds: z.array(z.string().uuid()).max(1000),
}).strict().refine(value => new Set(value.exercises.map(group => group.id)).size === value.exercises.length
  && new Set(value.pinnedQuestionIds).size === value.pinnedQuestionIds.length)
export type PracticeLocalReview = z.infer<typeof practiceLocalReviewSchema>
export const EMPTY_PRACTICE_LOCAL_REVIEW: PracticeLocalReview = { exercises: [], pinnedQuestionIds: [] }

export function localPracticeExercises(state: PracticeLocalReview, items: PracticeQuestionListItem[]): PracticeExercise[] {
  const byId = new Map(items.map(item => [item.id, item]))
  return state.exercises.flatMap(group => {
    const questionIds = group.questionIds.filter(id => byId.has(id))
    if (questionIds.length === 0) return []
    return [{ ...group, questionIds,
      questionTitles: Object.fromEntries(questionIds.map(id => [id, byId.get(id)!.title])),
      attemptedCount: questionIds.filter(id => byId.get(id)!.attemptCount > 0).length,
    }]
  })
}

type LocalResult = { ok: true; state: PracticeLocalReview } | { ok: false; error: string; conflict?: boolean }
export function changeLocalPracticeExercise(
  state: PracticeLocalReview, libraryId: string, items: PracticeQuestionListItem[], input: unknown, editing: boolean,
): LocalResult {
  const parsed = (editing ? practiceExerciseUpdateSchema : practiceExerciseSchema).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'กรุณาตั้งชื่อและเลือกโจทย์อย่างน้อย 1 ข้อ' }
  const value = parsed.data
  const available = new Set(items.map(item => item.id))
  if (value.libraryId !== libraryId || value.questionIds.some(id => !available.has(id))) {
    return { ok: false, error: 'เลือกได้เฉพาะโจทย์ในคลังฝึกนี้' }
  }
  const existing = state.exercises.find(group => group.id === value.id)
  const same = existing?.title === value.title && JSON.stringify(existing.questionIds) === JSON.stringify(value.questionIds)
  if (same) return { ok: true, state }
  if (editing) {
    if (!existing) return { ok: false, error: 'ไม่พบแบบฝึกหัดที่บันทึกในเบราว์เซอร์นี้' }
    if (!('expectedRevision' in value) || existing.revision !== value.expectedRevision) {
      return { ok: false, conflict: true, error: 'แบบฝึกหัดถูกแก้จากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไขต่อ' }
    }
    return { ok: true, state: { ...state, exercises: state.exercises.map(group => group.id === value.id
      ? { id: value.id, title: value.title, questionIds: value.questionIds, revision: group.revision + 1 } : group) } }
  }
  if (existing) return { ok: false, error: 'ชุดนี้ถูกบันทึกแล้ว กรุณาเปิดแก้ไขจากแบบฝึกหัดของฉัน' }
  if (state.exercises.length >= 1000) return { ok: false, error: 'เบราว์เซอร์นี้บันทึกแบบฝึกหัดครบจำนวนที่รองรับแล้ว' }
  return { ok: true, state: { ...state, exercises: [
    { id: value.id, title: value.title, questionIds: value.questionIds, revision: 1 }, ...state.exercises,
  ] } }
}

export function changeLocalPracticePin(
  state: PracticeLocalReview, libraryId: string, items: PracticeQuestionListItem[], input: unknown,
): LocalResult {
  const parsed = practiceReviewPinSchema.safeParse(input)
  if (!parsed.success || parsed.data.libraryId !== libraryId || !items.some(item => item.id === parsed.data.questionId)) {
    return { ok: false, error: 'เลือกได้เฉพาะโจทย์ในคลังฝึกนี้' }
  }
  const { questionId, pinned } = parsed.data
  const ids = new Set(state.pinnedQuestionIds)
  if (pinned && !ids.has(questionId) && ids.size >= 1000) {
    return { ok: false, error: 'เบราว์เซอร์นี้ปักหมุดครบจำนวนที่รองรับแล้ว' }
  }
  if (pinned) ids.add(questionId)
  else ids.delete(questionId)
  return { ok: true, state: { ...state, pinnedQuestionIds: [...ids] } }
}


export function deleteLocalPracticeExercise(state: PracticeLocalReview, libraryId: string, input: unknown): LocalResult {
  const parsed = practiceExerciseDeleteSchema.safeParse(input)
  if (!parsed.success || parsed.data.libraryId !== libraryId) return { ok: false, error: 'ข้อมูลแบบฝึกหัดไม่ถูกต้อง' }
  const value = parsed.data
  const existing = state.exercises.find(group => group.id === value.id)
  if (!existing) return { ok: false, error: 'ไม่พบแบบฝึกหัดที่ต้องการลบ กรุณาโหลดข้อมูลล่าสุด' }
  if (existing.revision !== value.expectedRevision) return { ok: false, conflict: true, error: 'แบบฝึกหัดถูกแก้จากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุดก่อนลบ' }
  return { ok: true, state: { ...state, exercises: state.exercises.filter(group => group.id !== value.id) } }
}
