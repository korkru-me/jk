export type PassingType = 'score' | 'percent'

// Pass/fail is opt-in per assignment — returns null (no verdict) whenever
// the assignment has no threshold set or the submission has no score yet.
export function computePassed(
  score: number | null,
  maxScore: number,
  passingType: PassingType | null,
  passingValue: number | null
): boolean | null {
  if (!passingType || passingValue == null || score == null) return null
  if (passingType === 'percent') {
    const pct = maxScore > 0 ? (score / maxScore) * 100 : 0
    return pct >= passingValue
  }
  return score >= passingValue
}

// For display: converts a passing threshold into an equivalent percent of
// max_score, used by charts that only work on a 0-100 scale.
export function passingPercent(
  maxScore: number,
  passingType: PassingType | null,
  passingValue: number | null
): number | null {
  if (!passingType || passingValue == null) return null
  if (passingType === 'percent') return passingValue
  return maxScore > 0 ? (passingValue / maxScore) * 100 : null
}

// Human-readable threshold, e.g. "70%" or "7 คะแนน" — null when unset.
export function formatPassingThreshold(
  passingType: PassingType | null,
  passingValue: number | null
): string | null {
  if (!passingType || passingValue == null) return null
  return passingType === 'percent' ? `${passingValue}%` : `${passingValue} คะแนน`
}

// True when a still-"in_progress" attempt's timer has already run out —
// e.g. the student closed the tab mid-exam and came back much later.
// startSubmission() force-finalizes these instead of resuming into an
// already-expired countdown; list views use this same check so they never
// offer a misleading "ทำต่อ" (continue) for an attempt that's effectively
// already over.
export function isAttemptExpired(startedAt: string, durationMinutes: number | null): boolean {
  if (durationMinutes == null) return false
  return Date.now() > new Date(startedAt).getTime() + durationMinutes * 60_000
}
