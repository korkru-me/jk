import { describe, expect, it } from 'vitest'
import {
  createAndroidExamSessionClaims,
  isLikelyAndroidUserAgent,
  signAndroidExamSession,
  verifyAndroidExamSession,
} from '@/lib/android-exam'

const SECRET = 'android-monitored-session-secret-for-tests'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const ASSIGNMENT_ID = '22222222-2222-4222-8222-222222222222'
const TEACHER_ID = '33333333-3333-4333-8333-333333333333'

describe('Android monitored exam sessions', () => {
  it('binds a signed session to the approved student, assignment and teacher', () => {
    const claims = createAndroidExamSessionClaims({
      userId: USER_ID,
      assignmentId: ASSIGNMENT_ID,
      approvedBy: TEACHER_ID,
      approvedAt: 1_000,
      approvalExpiresAt: 60_000,
      now: 2_000,
    })
    const token = signAndroidExamSession(claims, SECRET)
    expect(verifyAndroidExamSession(token, SECRET, 3_000)).toEqual(claims)
    expect(verifyAndroidExamSession(token, SECRET, claims.expiresAt)).toBeNull()
  })

  it('rejects tampering and caps a session at 12 hours', () => {
    const claims = createAndroidExamSessionClaims({
      userId: USER_ID,
      assignmentId: ASSIGNMENT_ID,
      approvedBy: TEACHER_ID,
      approvedAt: 1_000,
      approvalExpiresAt: 99 * 60 * 60_000,
      now: 2_000,
    })
    expect(claims.expiresAt).toBe(2_000 + 12 * 60 * 60_000)
    const token = signAndroidExamSession(claims, SECRET)
    expect(verifyAndroidExamSession(`${token}x`, SECRET, 3_000)).toBeNull()
  })

  it('uses Android user agent detection only as a routing hint', () => {
    expect(isLikelyAndroidUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36')).toBe(true)
    expect(isLikelyAndroidUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(false)
  })
})
