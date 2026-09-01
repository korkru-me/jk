import { z } from 'zod'

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

export const signupSchema = z.object({
  role: accountRoleSchema,
  full_name: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})

export const completeProfileSchema = z.object({
  role: accountRoleSchema,
  full_name: displayNameSchema,
})

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
