import { z } from 'zod'
import { studentEducationSchema } from '@/lib/student-education'

export const ACCOUNT_ROLES = ['teacher', 'student'] as const
export type AccountRole = (typeof ACCOUNT_ROLES)[number]

export const accountRoleSchema = z.enum(ACCOUNT_ROLES, {
  message: 'กรุณาเลือกว่าคุณเป็นครูหรือนักเรียน',
})

export const emailSchema = z
  .string()
  .trim()
  .email('รูปแบบอีเมลไม่ถูกต้อง')
  .transform((email) => email.toLowerCase())

export const passwordSchema = z
  .string()
  .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
  .regex(/[A-Za-z]/, 'รหัสผ่านต้องมีตัวอักษรอย่างน้อย 1 ตัว')
  .regex(/[0-9]/, 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว')

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'กรุณากรอกชื่อที่ใช้แสดงอย่างน้อย 2 ตัวอักษร')
  .max(160, 'ชื่อที่ใช้แสดงต้องไม่เกิน 160 ตัวอักษร')

const studentEducationFormFields = {
  grade_level: z.string().optional(),
  section_number: z.string().optional(),
  student_code: z.string().optional(),
  class_number: z.string().optional(),
}

function validateStudentEducation(
  values: { role: AccountRole } & Partial<Record<keyof typeof studentEducationFormFields, string>>,
  context: z.RefinementCtx,
) {
  if (values.role !== 'student') return
  const result = studentEducationSchema.safeParse(values)
  if (!result.success) {
    for (const { path, message } of result.error.issues) {
      context.addIssue({ code: 'custom', path, message })
    }
  }
}

export const signupSchema = z.object({
  ...studentEducationFormFields,
  role: accountRoleSchema,
  full_name: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
  confirm_password: z.string({ error: 'กรุณายืนยันรหัสผ่าน' }).min(1, 'กรุณายืนยันรหัสผ่าน'),
  accept_terms: z.boolean().refine((value) => value === true, {
    message: 'กรุณายอมรับข้อกำหนดและรับทราบนโยบายความเป็นส่วนตัว',
  }),
}).superRefine(validateStudentEducation).refine((values) => values.password === values.confirm_password, {
  path: ['confirm_password'],
  message: 'รหัสผ่านไม่ตรงกัน',
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})

export const completeProfileSchema = z.object({
  ...studentEducationFormFields,
  role: accountRoleSchema,
  full_name: displayNameSchema,
  accept_terms: z.boolean().refine((value) => value === true, {
    message: 'กรุณายอมรับข้อกำหนดและรับทราบนโยบายความเป็นส่วนตัว',
  }),
}).superRefine(validateStudentEducation)

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((values) => values.password === values.confirm_password, {
    path: ['confirm_password'],
    message: 'รหัสผ่านใหม่ไม่ตรงกัน',
  })

export type SignupInput = z.infer<typeof signupSchema>
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
