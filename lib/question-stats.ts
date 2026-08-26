/**
 * Item analysis for a question, computed from real graded answers.
 *
 * Pure functions — the caller does the fetching. This replaces a `mockStats()`
 * that derived plausible-looking p and r values from a hash of the question id
 * and rendered them as if they were measured.
 */

/** One graded answer, joined to the total score of the attempt it belongs to. */
export interface GradedAnswerRow {
  question_id: string
  /** Points earned on this question. */
  score: number
  /** Points available for this question. */
  max_score: number
  /** Total points earned across the whole attempt. */
  submission_total: number
  assignment_id: string
  /** When the attempt this answer belongs to was made, ISO. Optional: it is
   *  only read to answer "when was this question last used", and a caller that
   *  does not need that need not fetch it. */
  submitted_at?: string | null
}

export interface QuestionStats {
  /** Graded answers this is based on. */
  attempts: number
  /**
   * Difficulty index p — mean fraction of the question's points earned.
   * 1 = everyone got full marks, 0 = nobody scored.
   */
  pValue: number
  /**
   * Discrimination — point-biserial correlation between scoring on this
   * question and scoring on the attempt overall. Roughly: do the students who
   * do well overall also do well here?
   *
   * `null` when it cannot be computed: too few attempts, or every student
   * scored the same (on the item or overall), which leaves no variance to
   * correlate.
   */
  discrimination: number | null
  /** Distinct assignments this question has been used in. */
  usedIn: number
  /**
   * The most recent attempt on this question, ISO — "when did I last put this
   * in front of students". `null` when no answer carried a date.
   */
  lastUsedAt: string | null
}

/** Below this, a correlation says more about the sample size than the item. */
const MIN_ATTEMPTS_FOR_DISCRIMINATION = 5

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function populationStdDev(xs: number[]): number {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)))
}

/**
 * Point-biserial correlation between per-item scores and total scores.
 *
 * Uses the item's score fraction split at its own mean rather than a strict
 * right/wrong flag, so partially-credited questions still contribute.
 */
function pointBiserial(fractions: number[], totals: number[]): number | null {
  if (fractions.length < MIN_ATTEMPTS_FOR_DISCRIMINATION) return null

  const totalSd = populationStdDev(totals)
  if (totalSd === 0) return null

  const itemMean = mean(fractions)
  const high: number[] = []
  const low: number[] = []
  fractions.forEach((f, i) => (f >= itemMean ? high : low).push(totals[i]))
  if (high.length === 0 || low.length === 0) return null

  const p = high.length / fractions.length
  return ((mean(high) - mean(low)) / totalSd) * Math.sqrt(p * (1 - p))
}

/**
 * Aggregate graded answers into per-question stats.
 *
 * Questions with no graded answers are absent from the result — the caller
 * should show "no data yet" rather than a zero.
 */
export function computeQuestionStats(rows: GradedAnswerRow[]): Map<string, QuestionStats> {
  const byQuestion = new Map<string, GradedAnswerRow[]>()
  for (const row of rows) {
    if (row.max_score <= 0) continue
    byQuestion.set(row.question_id, [...(byQuestion.get(row.question_id) ?? []), row])
  }

  const out = new Map<string, QuestionStats>()
  for (const [questionId, answers] of byQuestion) {
    const fractions = answers.map(a => Math.min(1, Math.max(0, a.score / a.max_score)))
    const totals = answers.map(a => a.submission_total)
    out.set(questionId, {
      attempts: answers.length,
      pValue: mean(fractions),
      discrimination: pointBiserial(fractions, totals),
      usedIn: new Set(answers.map(a => a.assignment_id)).size,
      lastUsedAt: latest(answers),
    })
  }
  return out
}

/** The most recent attempt among a question's answers, or null if none is dated. */
function latest(answers: GradedAnswerRow[]): string | null {
  let newest: string | null = null
  for (const answer of answers) {
    const at = answer.submitted_at
    if (!at) continue
    if (newest === null || at > newest) newest = at
  }
  return newest
}

/** Teacher-facing reading of a difficulty index. */
export function difficultyLabel(pValue: number): string {
  const percent = pValue * 100
  if (percent <= 30) return 'ยากมาก'
  if (percent <= 50) return 'ยาก'
  if (percent <= 70) return 'ปานกลาง'
  return 'ง่าย'
}

/** Teacher-facing reading of a discrimination index, with a colour to match. */
export function discriminationLabel(r: number): { label: string; color: string } {
  if (r >= 0.4) return { label: 'ดีมาก', color: 'text-success' }
  if (r >= 0.3) return { label: 'ดี', color: 'text-primary' }
  if (r >= 0.2) return { label: 'พอใช้', color: 'text-warning' }
  return { label: 'ต่ำ', color: 'text-destructive' }
}
