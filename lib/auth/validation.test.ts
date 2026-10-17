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
      confirm_password: 'teacher123',
      accept_terms: true,
    })

    expect(result).toEqual({
      role: 'teacher',
      full_name: 'ครูสมชาย ใจดี',
      email: 'teacher@example.com',
      password: 'teacher123',
      confirm_password: 'teacher123',
      accept_terms: true,
    })
  })

  it('rejects unsupported roles and weak passwords on the server schema', () => {
    expect(signupSchema.safeParse({
      role: 'admin',
      full_name: 'ผู้ดูแลระบบ',
      email: 'admin@example.com',
      password: 'password1',
      confirm_password: 'password1',
      accept_terms: true,
    }).success).toBe(false)

    expect(signupSchema.safeParse({
      role: 'student',
      full_name: 'สมชาย ใจดี',
      email: 'student@example.com',
      password: 'abcdefgh',
      confirm_password: 'abcdefgh',
      accept_terms: true,
    }).success).toBe(false)
  })

  it('uses the same role and name rules for OAuth profile completion', () => {
    expect(completeProfileSchema.safeParse({
      role: 'student',
      full_name: 'นักเรียนทดลอง',
      accept_terms: true,
    }).success).toBe(true)

    expect(completeProfileSchema.safeParse({
      role: '',
      full_name: 'นักเรียนทดลอง',
      accept_terms: true,
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

  it('requires explicit acknowledgement on email and Google profile signup', () => {
    const emailSignup = { role: 'student', full_name: 'นักเรียนทดสอบ', email: 'student@example.com', password: 'password1', confirm_password: 'password1' }
    for (const accept_terms of [undefined, false, 'true', 1]) {
      expect(signupSchema.safeParse({ ...emailSignup, accept_terms }).success).toBe(false)
      expect(completeProfileSchema.safeParse({ role: 'student', full_name: 'นักเรียนทดสอบ', accept_terms }).success).toBe(false)
    }
    expect(signupSchema.safeParse({ ...emailSignup, accept_terms: true }).success).toBe(true)
  })

  it('rejects malformed email addresses', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false)
  })

  it('requires exact password confirmation without trimming or changing case', () => {
    const base = { role: 'student', full_name: 'นักเรียนทดสอบ', email: 'student@example.com', password: 'Password1', accept_terms: true }
    for (const confirm_password of [undefined, null, '', 'password1', 'Password1 ', 'different1']) {
      const result = signupSchema.safeParse({ ...base, confirm_password })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === 'confirm_password')).toBe(true)
    }
    const password = ' Password1 '
    expect(signupSchema.parse({ ...base, password, confirm_password: password })).toMatchObject({ password, confirm_password: password })
  })
})
