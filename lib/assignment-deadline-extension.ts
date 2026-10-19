import { z } from 'zod'
import { normalizeAssignmentLateSchedule, type AssignmentLateBandInput } from '@/lib/late-submission'

export const assignmentDeadlineExtensionIdSchema = z.string().uuid()
const instantSchema = z.iso.datetime({ offset: true })

export const assignmentDeadlineExtensionInputSchema = z.object({
  endAt: instantSchema,
  expectedEndAt: instantSchema,
  expectedUpdatedAt: instantSchema,
}).strict()

export type ExtendAssignmentDeadlineInput = z.infer<typeof assignmentDeadlineExtensionInputSchema>

export interface AssignmentDeadlineExtensionSnapshot {
  id: string
  title: string
  endAt: string
  updatedAt: string
  startAt: string | null
  dueAt: string | null
  durationMinutes: number | null
  linkedClassroomCount: number
}

export const assignmentDeadlineExtensionRowSchema = z.object({
  id: assignmentDeadlineExtensionIdSchema,
  title: z.string(),
  classroom_id: assignmentDeadlineExtensionIdSchema.nullable(),
  type: z.string(),
  mode: z.string(),
  status: z.string(),
  start_at: instantSchema.nullable(),
  due_at: instantSchema.nullable(),
  late_bands: z.array(z.unknown()),
  end_at: instantSchema.nullable(),
  duration_minutes: z.number().finite().nonnegative().nullable(),
  updated_at: instantSchema,
})

export const assignmentDeadlineExtensionReceiptSchema = z.object({
  id: assignmentDeadlineExtensionIdSchema,
  end_at: instantSchema,
  updated_at: instantSchema,
})

export type AssignmentDeadlineExtensionRow = z.infer<typeof assignmentDeadlineExtensionRowSchema>

export function assignmentDeadlineExtensionEligibility(row: Pick<AssignmentDeadlineExtensionRow, 'type' | 'mode' | 'status' | 'end_at'>): string | null {
  if (row.mode !== 'online' || (row.type !== 'exercise' && row.type !== 'exam')) {
    return 'ขยายเวลาได้เฉพาะแบบฝึกหัดหรือข้อสอบออนไลน์'
  }
  if (row.status !== 'published') return 'ขยายเวลาได้เฉพาะงานที่เผยแพร่อยู่ กรุณาตรวจสถานะงานก่อน'
  if (row.end_at === null) return 'งานนี้ไม่จำกัดเวลาปิดรับ จึงไม่ต้องขยายเวลา'
  if (!instantSchema.safeParse(row.end_at).success) return 'เวลาปิดรับเดิมไม่ถูกต้อง กรุณาตรวจการตั้งค่างาน'
  return null
}

/** Only the hard close changes. Existing due dates and ordered colour bands
 * are checked together, never resampled or written back to the assignment. */
export function validateAssignmentDeadlineExtension(
  row: Pick<AssignmentDeadlineExtensionRow, 'type' | 'mode' | 'status' | 'end_at' | 'start_at' | 'due_at' | 'late_bands'>,
  nextEndAt: unknown,
  now = Date.now(),
): { endAt: string } | { error: string } {
  const eligibilityError = assignmentDeadlineExtensionEligibility(row)
  if (eligibilityError) return { error: eligibilityError }
  const parsed = instantSchema.safeParse(nextEndAt)
  if (!parsed.success) return { error: 'กรุณาระบุวันและเวลาปิดรับใหม่ให้ถูกต้อง' }
  const endTime = Date.parse(parsed.data)
  if (endTime <= now) return { error: 'เวลาปิดรับใหม่ต้องอยู่หลังเวลาปัจจุบัน' }
  if (endTime <= Date.parse(row.end_at!)) return { error: 'เวลาปิดรับใหม่ต้องช้ากว่าเวลาปิดรับเดิม' }
  if (row.start_at && endTime <= Date.parse(row.start_at)) return { error: 'เวลาปิดรับใหม่ต้องอยู่หลังเวลาเปิดรับ' }
  const schedule = normalizeAssignmentLateSchedule({
    dueAt: row.due_at,
    endAt: parsed.data,
    startAt: row.start_at,
    bands: row.late_bands as AssignmentLateBandInput[],
  }, { requireClose: row.due_at !== null })
  if ('error' in schedule) return { error: schedule.error }
  return { endAt: new Date(endTime).toISOString() }
}
