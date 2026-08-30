import 'server-only'

import { getAndroidExamSession } from '@/lib/android-exam-session'
import { getSebSession } from '@/lib/seb-session'

export type ExamAccessSession =
  | {
      mode: 'seb'
      issuedAt: number
      platform: 'windows' | 'macos' | 'ios'
      version: string
    }
  | {
      mode: 'android_monitored'
      issuedAt: number
      approvedAt: number
      approvedBy: string
    }

export async function getExamAccessSession(
  userId: string,
  assignmentId: string,
  androidMonitoredAllowed: boolean,
): Promise<ExamAccessSession | null> {
  const seb = await getSebSession(userId, assignmentId)
  if (seb) {
    return {
      mode: 'seb',
      issuedAt: seb.issuedAt,
      platform: seb.platform,
      version: seb.version,
    }
  }

  if (!androidMonitoredAllowed) return null
  const android = await getAndroidExamSession(userId, assignmentId)
  if (!android) return null
  return {
    mode: 'android_monitored',
    issuedAt: android.issuedAt,
    approvedAt: android.approvedAt,
    approvedBy: android.approvedBy,
  }
}
