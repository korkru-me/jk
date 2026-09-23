import 'server-only'

import { getAndroidExamSession } from '@/lib/android-exam-session'
import { getSebSession } from '@/lib/seb-session'
import {
  readAssignmentSebRelease,
  readCurrentAssignmentSebRelease,
} from '@/lib/seb-assignment-release.server'

export type ExamAccessSession =
  | {
      mode: 'seb'
      issuedAt: number
      platform: 'windows' | 'macos' | 'ios'
      version: string
      configRevision: string
      assignmentConfigRevision: number
    }
  | {
      mode: 'android_monitored'
      issuedAt: number
      approvedAt: number
      approvedBy: string
    }

export type BoundExamAccessMode = 'seb' | 'android_monitored'

export async function getExamAccessSession(
  userId: string,
  assignmentId: string,
  androidMonitoredAllowed: boolean,
  expectedAssignmentConfigRevision?: number | null,
  expectedAccessMode?: BoundExamAccessMode | null,
): Promise<ExamAccessSession | null> {
  // Once an attempt exists, its access mode is immutable. A browser/legacy
  // mode passed as null fails closed, an Android attempt never accepts a SEB
  // cookie, and a SEB attempt never falls back to Android approval.
  if (expectedAccessMode === null) return null

  const release = expectedAssignmentConfigRevision === null
    ? null
    : typeof expectedAssignmentConfigRevision === 'number'
      ? await readAssignmentSebRelease(assignmentId, expectedAssignmentConfigRevision)
      : await readCurrentAssignmentSebRelease(assignmentId)
  const seb = expectedAccessMode !== 'android_monitored' && release
    ? await getSebSession(userId, assignmentId, release.releaseId, release.revision)
    : null
  if (seb) {
    return {
      mode: 'seb',
      issuedAt: seb.issuedAt,
      platform: seb.platform,
      version: seb.version,
      configRevision: seb.configRevision,
      assignmentConfigRevision: seb.assignmentConfigRevision,
    }
  }

  if (expectedAccessMode === 'seb') return null

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
