import { z } from 'zod'

export const GRADE_LEVELS = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6', 'อื่นๆ'] as const
export const SECTION_NUMBERS = Array.from({ length: 15 }, (_, index) => index + 1)
export const STUDENT_CODE_MAX_LENGTH = 64
export const CLASS_NUMBER_MAX = 32767

export const STUDENT_EDUCATION_FIELDS = [
  { name: 'grade_level', label: 'ระดับชั้น' },
  { name: 'section_number', label: 'ห้อง' },
  { name: 'student_code', label: 'รหัสนักเรียน' },
  { name: 'class_number', label: 'เลขที่' },
] as const

export type StudentEducationField = (typeof STUDENT_EDUCATION_FIELDS)[number]['name']

export const studentEducationSchema = z.object({
  grade_level: z.enum(GRADE_LEVELS, { error: 'กรุณาเลือกระดับชั้น' }),
  section_number: z.string({ error: 'กรุณาเลือกห้อง' })
    .refine((value) => SECTION_NUMBERS.some((number) => String(number) === value), 'กรุณาเลือกห้อง')
    .transform(Number),
  student_code: z.string({ error: 'กรุณากรอกรหัสนักเรียน' }).trim()
    .min(1, 'กรุณากรอกรหัสนักเรียน')
    .max(STUDENT_CODE_MAX_LENGTH, 'รหัสนักเรียนต้องไม่เกิน 64 ตัวอักษร'),
  class_number: z.string({ error: 'กรุณากรอกเลขที่' }).trim()
    .refine((value) => /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= CLASS_NUMBER_MAX,
      'กรุณากรอกเลขที่เป็นจำนวนเต็มตั้งแต่ 1 ถึง 32767')
    .transform(Number),
})
