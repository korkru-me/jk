import { describe, expect, it } from 'vitest'
import {
  completeProfileSchema,
  emailSchema,
  resetPasswordSchema,
  signupSchema,
} from './validation'

describe('authentication input validation', () => {
  it('normalizes email while keeping the chosen account role', () => {
    const result = signupSchema.parse({
      role: 'teacher',
      full_name: '  ครูสมชาย ใจดี  ',
      email: ' Teacher@Example.COM ',
      password: 'teacher123',
    })

    expect(result).toEqual({
      role: 'teacher',
      full_name: 'ครูสมชาย ใจดี',
      email: 'teacher@example.com',
      password: 'teacher123',
    })
  })

  it('rejects unsupported roles and weak passwords on the server schema', () => {
    expect(signupSchema.safeParse({
      role: 'admin',
      full_name: 'ผู้ดูแลระบบ',
      email: 'admin@example.com',
      password: 'password1',
    }).success).toBe(false)

    expect(signupSchema.safeParse({
      role: 'student',
      full_name: 'สมชาย ใจดี',
      email: 'student@example.com',
      password: 'abcdefgh',
    }).success).toBe(false)
  })

  it('uses the same role and name rules for OAuth profile completion', () => {
    expect(completeProfileSchema.safeParse({
      role: 'student',
      full_name: 'นักเรียนทดลอง',
    }).success).toBe(true)

    expect(completeProfileSchema.safeParse({
      role: '',
      full_name: 'นักเรียนทดลอง',
    }).success).toBe(false)
  })

  it('requires matching reset passwords', () => {
    expect(resetPasswordSchema.safeParse({
      password: 'newpassword1',
      confirm_password: 'newpassword1',
    }).success).toBe(true)

    expect(resetPasswordSchema.safeParse({
      password: 'newpassword1',
      confirm_password: 'different1',
    }).success).toBe(false)
  })

  it('rejects malformed email addresses', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false)
  })
})
