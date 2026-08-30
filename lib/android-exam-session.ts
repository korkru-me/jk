import 'server-only'

import { cookies } from 'next/headers'
import {
  verifyAndroidExamSession,
  type AndroidExamSessionClaims,
} from '@/lib/android-exam'

export function androidExamSessionCookieName(assignmentId: string) {
  return `korkru-android-exam-${assignmentId}`
}

export async function getAndroidExamSession(
  userId: string,
  assignmentId: string,
): Promise<AndroidExamSessionClaims | null> {
  const secret = process.env.SEB_SESSION_SECRET?.trim() ?? ''
  if (secret.length < 32) return null
  const token = (await cookies()).get(androidExamSessionCookieName(assignmentId))?.value
  if (!token) return null
  const claims = verifyAndroidExamSession(token, secret)
  if (
    !claims
    || claims.userId !== userId
    || claims.assignmentId !== assignmentId
  ) return null
  return claims
}
