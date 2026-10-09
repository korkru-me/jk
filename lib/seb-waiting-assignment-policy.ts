import type { Assignment } from '@/lib/types'
import { WAITING_SEB_RELEASE_PROFILE_ID } from '@/lib/seb-waiting-release-policy'

export const WAITING_SEB_STREAK_UNAVAILABLE_MESSAGE = 'ห้องสอบ SEB รุ่นทดลองยังไม่รองรับข้อสอบแบบตอบถูกติดต่อกัน กรุณาแจ้งครูผู้คุมสอบ'
export const WAITING_SEB_LEGACY_CODE_UNAVAILABLE_MESSAGE = 'ข้อสอบนี้ยังมีรหัสเข้าแบบเดิม กรุณาให้ครูนำรหัสเข้าออกก่อนใช้ห้องสอบ SEB'
export const WAITING_SEB_ASSIGNMENT_UNAVAILABLE_MESSAGE = 'ข้อสอบนี้ยังไม่รองรับห้องสอบ SEB รุ่นทดลอง กรุณาแจ้งครูผู้คุมสอบ'

/** Current, question-free assignment metadata only. The independent Boolean
 * must come from an authorized `access_code IS NULL` read, not a client claim. */
export type WaitingSebAssignmentFacts = Readonly<Pick<Assignment,
  'type' | 'mode' | 'secure_browser_mode' | 'completion_rule'
>>

export type WaitingSebAssignmentPolicy =
  | Readonly<{ applies: false }>
  | Readonly<{ applies: true; supported: true }>
  | Readonly<{
    applies: true
    supported: false
    reason: 'streak' | 'assignment' | 'legacy_access_code'
    message: string
  }>

/** Pilot compatibility only, never authorization. Existing/ordinary release
 * profiles are deliberately outside this policy; `applies:false` does not
 * authorize a canonical waiting route. Callers must independently verify the
 * current release, actual user, roster, and native session.
 *
 * Apply this same current-assignment guard before data/question reads, object
 * writes, atomic start, and resume. A hidden button or GET-only guard cannot
 * prevent the partially committed streak/check/draw protocol being invoked.
 */
export function inspectWaitingSebAssignmentPolicy(input: Readonly<{
  profileId: string | null | undefined
  assignment: WaitingSebAssignmentFacts | null | undefined
  passwordless: boolean
}>): WaitingSebAssignmentPolicy {
  if (input.profileId !== WAITING_SEB_RELEASE_PROFILE_ID) return { applies: false }
  const assignment = input.assignment
  if (assignment?.completion_rule === 'streak') {
    return { applies: true, supported: false, reason: 'streak', message: WAITING_SEB_STREAK_UNAVAILABLE_MESSAGE }
  }
  // Exact fixed completion is required: unknown/missing historical metadata
  // cannot silently enable a new pilot whose check/draw protocol is excluded.
  if (!assignment || assignment.type !== 'exam' || assignment.mode !== 'online'
    || assignment.secure_browser_mode !== 'seb_required' || assignment.completion_rule !== 'fixed') {
    return { applies: true, supported: false, reason: 'assignment', message: WAITING_SEB_ASSIGNMENT_UNAVAILABLE_MESSAGE }
  }
  if (input.passwordless !== true) {
    return { applies: true, supported: false, reason: 'legacy_access_code', message: WAITING_SEB_LEGACY_CODE_UNAVAILABLE_MESSAGE }
  }
  return { applies: true, supported: true }
}
