import type { ScoreStrategy } from '@/lib/types'

export const SCORE_STRATEGY_LABELS: Record<ScoreStrategy, string> = {
  best: 'คะแนนครั้งที่ดีที่สุด',
  average: 'คะแนนเฉลี่ยจากทุกครั้ง',
  latest: 'คะแนนครั้งล่าสุด',
}

interface AttemptRow {
  status: string
  total_score: number | null
  max_score: number
  attempt_number: number
}

export interface OfficialScore<T extends AttemptRow> {
  representative: T
  total_score: number | null
  max_score: number
}

// Picks the "official" score across a student's attempts at one assignment,
// per the assignment's score_strategy. `representative` is the attempt row
// to use for id/status/submitted_at/users/etc — for 'average' the displayed
// total_score is a computed mean and won't match representative.total_score.
export function selectOfficialAttempt<T extends AttemptRow>(
  attempts: T[],
  strategy: ScoreStrategy
): OfficialScore<T> | null {
  if (attempts.length === 0) return null

  // Highest score wins; ties go to the more recent attempt. Also doubles as
  // the representative/fallback for 'latest'/'average' below, so an
  // in-progress attempt still surfaces when nothing is graded yet.
  const best = attempts.reduce((prev, s) =>
    (s.total_score ?? -1) > (prev.total_score ?? -1) ||
    ((s.total_score ?? -1) === (prev.total_score ?? -1) && s.attempt_number > prev.attempt_number)
      ? s : prev
  )

  if (strategy === 'best') {
    return { representative: best, total_score: best.total_score, max_score: best.max_score }
  }

  const latest = attempts.reduce((prev, s) => (s.attempt_number > prev.attempt_number ? s : prev))
  if (strategy === 'latest') {
    return { representative: latest, total_score: latest.total_score, max_score: latest.max_score }
  }

  // average: mean of graded/submitted attempts only (in-progress attempts
  // have no score yet and would skew the average)
  const graded = attempts.filter(s => (s.status === 'submitted' || s.status === 'graded') && s.total_score !== null)
  if (graded.length === 0) {
    return { representative: best, total_score: null, max_score: best.max_score }
  }
  const avg = graded.reduce((sum, s) => sum + (s.total_score as number), 0) / graded.length
  const representative = graded.reduce((prev, s) => (s.attempt_number > prev.attempt_number ? s : prev))
  return { representative, total_score: avg, max_score: representative.max_score }
}
