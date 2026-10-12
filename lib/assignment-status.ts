import type { AssignmentStatus } from '@/lib/types'

interface ShouldClearExpiredEndAtOptions {
  currentStatus: AssignmentStatus
  endAt: string | null
  now?: number
}

export function shouldClearExpiredEndAt({
  currentStatus,
  endAt,
  now = Date.now(),
}: ShouldClearExpiredEndAtOptions) {
  if (currentStatus !== 'closed' || endAt === null) return false

  const endTime = Date.parse(endAt)
  return Number.isFinite(endTime) && endTime <= now
}
