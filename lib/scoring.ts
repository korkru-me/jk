import type { ScoreStrategy } from '@/lib/types'

interface ScoredRow {
  total_score: number | null
  max_score: number
}

// Proportionally rescales total_score/max_score to `displayMax` (an
// assignment's display_max_score) — e.g. a structural total of 15 shown as
// "out of 10". Pass `null` displayMax to leave rows untouched (the default,
// pre-existing behavior). Call this immediately after fetching submission
// rows, before any sorting/pass-fail/percentage math runs on them, so
// everything downstream — computePassed, selectOfficialAttempt, CSV export,
// etc — consumes the same already-rescaled numbers without needing to know
// about display_max_score itself. Because it only reads each row's already-
// stored raw score, this is safe to apply at any time, including to
// submissions from students who finished long ago.
export function rescaleToDisplayMax<T extends ScoredRow>(
  rows: T[],
  resolveDisplayMax: (row: T) => number | null
): T[] {
  return rows.map(row => {
    const displayMax = resolveDisplayMax(row)
    if (displayMax == null || row.max_score <= 0) return row
    const scale = displayMax / row.max_score
    return {
      ...row,
      total_score: row.total_score == null ? null : Math.round(row.total_score * scale * 100) / 100,
      max_score: displayMax,
    }
  })
}

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
