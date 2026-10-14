import { z } from 'zod'
import {
  canManagePracticeLibrary,
  type PracticeClassroomAccess,
  type PracticeLibraryRow,
  type PracticeLibraryStatus,
} from '@/lib/practice-library-contracts'

export type { PracticeLibraryStatus } from '@/lib/practice-library-contracts'

export const PRACTICE_LIBRARY_STATUS_LABELS: Record<PracticeLibraryStatus, string> = {
  draft: 'ร่าง',
  published: 'เผยแพร่แล้ว',
  closed: 'ปิดแล้ว',
}

export type PracticeLibraryTeacherRow = PracticeLibraryRow

export interface PracticeClassroomOption {
  id: string
  orgId: string
  name: string
  description: string | null
}

export interface PracticeLibraryEditorValue {
  title: string
  description: string
  classroomIds: string[]
  questionIds: string[]
  revealAnswerKey: boolean
  accessCode: string | null
  calculatorEnabled: boolean
  scratchpadEnabled: boolean
  shuffleQuestions: boolean
  shuffleOptions: boolean
}

export type PracticeLibraryActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fields?: Record<string, string[]> }

const uuidSchema = z.string().uuid('รหัสอ้างอิงไม่ถูกต้อง')
const questionIdsSchema = z
  .array(uuidSchema)
  .max(1_000, 'คลังฝึกหนึ่งชุดมีได้ไม่เกิน 1,000 ข้อ')
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'รายการโจทย์มีข้อซ้ำ',
      })
    }
  })

const classroomIdsSchema = z
  .array(uuidSchema)
  .min(1, 'เลือกห้องเรียนอย่างน้อย 1 ห้อง')
  .max(50, 'เลือกห้องเรียนได้ไม่เกิน 50 ห้อง')
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'รายการห้องเรียนมีห้องซ้ำ',
      })
    }
  })

const practiceLibraryFields = {
  title: z
    .string()
    .trim()
    .min(1, 'กรุณาตั้งชื่อคลังฝึก')
    .max(160, 'ชื่อคลังฝึกต้องไม่เกิน 160 ตัวอักษร'),
  description: z
    .string()
    .trim()
    .max(2_000, 'คำชี้แจงต้องไม่เกิน 2,000 ตัวอักษร'),
  questionIds: questionIdsSchema,
  revealAnswerKey: z.boolean(),
  accessCode: z.string()
    .trim()
    .min(1, 'กรุณากรอกรหัสผ่าน')
    .max(100, 'รหัสผ่านต้องไม่เกิน 100 ตัวอักษร')
    .nullable(),
  calculatorEnabled: z.boolean(),
  scratchpadEnabled: z.boolean(),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
}

/**
 * Strict schemas are a privacy boundary as well as validation: score, answer,
 * correctness, dates, and assignment fields cannot hitch a ride in a teacher
 * mutation even if a caller bypasses the form.
 */
export const createPracticeLibrarySchema = z.object({
  ...practiceLibraryFields,
  classroomIds: classroomIdsSchema,
  intent: z.enum(['draft', 'publish']),
}).strict()

export const updatePracticeLibrarySchema = z.object({
  ...practiceLibraryFields,
  libraryId: uuidSchema,
}).strict()

export const practiceLibraryIdSchema = z.object({
  libraryId: uuidSchema,
}).strict()

export const practiceBulkTagSchema = z.object({
  libraryId: uuidSchema,
  questionIds: questionIdsSchema.min(1, 'เลือกโจทย์อย่างน้อย 1 ข้อ'),
  operation: z.enum(['add', 'remove']),
  tag: z
    .string()
    .trim()
    .min(1, 'กรุณากรอกแท็ก')
    .max(80, 'แท็กต้องไม่เกิน 80 ตัวอักษร'),
}).strict()

export type CreatePracticeLibraryInput = z.input<typeof createPracticeLibrarySchema>
export type UpdatePracticeLibraryInput = z.input<typeof updatePracticeLibrarySchema>
export type PracticeBulkTagInput = z.input<typeof practiceBulkTagSchema>

export type ClassroomCoTeacherPermission = 'admin' | 'manage' | 'view' | null

export function canManagePracticeClassroom(input: {
  actorId: string
  teacherId: string
  coTeacherPermission: ClassroomCoTeacherPermission
}): boolean {
  let access: PracticeClassroomAccess = 'none'
  if (input.actorId === input.teacherId) access = 'classroom_owner'
  else if (input.coTeacherPermission === 'admin') access = 'co_teacher_admin'
  else if (input.coTeacherPermission === 'manage') access = 'co_teacher_manage'
  else if (input.coTeacherPermission === 'view') access = 'co_teacher_view'
  return canManagePracticeLibrary(access)
}

export function isEligiblePracticeClassroom(input: {
  status: string
  classroomType: string
}): boolean {
  return input.status === 'active' && input.classroomType !== 'homeroom'
}

export function canChangePracticeQuestionMembership(status: PracticeLibraryStatus): boolean {
  return status === 'draft'
}

export function canDeletePracticeLibrary(status: PracticeLibraryStatus): boolean {
  return status === 'draft'
}

export function practiceQuestionOrderChanged(
  currentIds: readonly string[],
  nextIds: readonly string[],
): boolean {
  return currentIds.length !== nextIds.length
    || currentIds.some((id, index) => id !== nextIds[index])
}

export function canTransitionPracticeLibrary(
  from: PracticeLibraryStatus,
  to: PracticeLibraryStatus,
): boolean {
  return (from === 'draft' && to === 'published')
    || (from === 'published' && to === 'closed')
}

export function fieldsFromZodError(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    ;(fields[key] ??= []).push(issue.message)
  }
  return fields
}
