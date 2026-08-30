import type { SebPlatform } from './seb'

export const SEB_PREFLIGHT_VALIDITY_HOURS = 12
const SEB_PREFLIGHT_VALIDITY_MS = SEB_PREFLIGHT_VALIDITY_HOURS * 60 * 60 * 1_000

export interface SebPreflightCheckinRow {
  assignment_id: string
  student_id: string
  verified_at: string
  valid_until: string
  platform: SebPlatform
  version: string
}

export type SebPreflightState = 'ready' | 'expired' | 'missing'

export interface SebPreflightSummary {
  total: number
  ready: number
  expired: number
  missing: number
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function newerCheckin(
  current: SebPreflightCheckinRow | undefined,
  candidate: SebPreflightCheckinRow,
): SebPreflightCheckinRow {
  if (!current) return candidate

  const currentVerifiedAt = timestamp(current.verified_at)
  const candidateVerifiedAt = timestamp(candidate.verified_at)
  if (candidateVerifiedAt === null) return current
  if (currentVerifiedAt === null || candidateVerifiedAt >= currentVerifiedAt) return candidate
  return current
}

/** Normalize a snapshot without allowing a duplicate older row to win. */
export function normalizeSebPreflightCheckins(
  snapshot: SebPreflightCheckinRow[],
): SebPreflightCheckinRow[] {
  const byStudent = new Map<string, SebPreflightCheckinRow>()

  for (const row of snapshot) {
    byStudent.set(row.student_id, newerCheckin(byStudent.get(row.student_id), row))
  }

  return [...byStudent.values()]
}

/** A persisted row is ready only while its coherent server-issued window is active. */
export function getSebPreflightState(
  checkin: SebPreflightCheckinRow | null | undefined,
  now = Date.now(),
): SebPreflightState {
  if (!checkin) return 'missing'

  const verifiedAt = timestamp(checkin.verified_at)
  const validUntil = timestamp(checkin.valid_until)
  if (
    verifiedAt === null
    || validUntil === null
    || !Number.isFinite(now)
    || verifiedAt > now
    || validUntil <= verifiedAt
    || validUntil - verifiedAt > SEB_PREFLIGHT_VALIDITY_MS
    || validUntil <= now
  ) return 'expired'

  return 'ready'
}

export function summarizeSebPreflight(
  rosterStudentIds: string[],
  checkins: SebPreflightCheckinRow[],
  now = Date.now(),
): SebPreflightSummary {
  const uniqueRosterStudentIds = new Set(rosterStudentIds)
  const checkinsByStudent = new Map(
    normalizeSebPreflightCheckins(checkins)
      .filter(checkin => uniqueRosterStudentIds.has(checkin.student_id))
      .map(checkin => [checkin.student_id, checkin]),
  )
  const summary: SebPreflightSummary = {
    total: uniqueRosterStudentIds.size,
    ready: 0,
    expired: 0,
    missing: 0,
  }

  for (const studentId of uniqueRosterStudentIds) {
    summary[getSebPreflightState(checkinsByStudent.get(studentId), now)] += 1
  }

  return summary
}
