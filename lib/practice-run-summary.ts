import type { PracticeFeedback } from './practice-question'

export interface PracticeRunState {
  answered: boolean
  verdict?: PracticeFeedback['verdict']
}

/** A count of questions for this run, never a weighted assignment grade. */
export function practiceRunSummary(ids: readonly string[], states: Record<string, PracticeRunState>) {
  const counts = { total: ids.length, answered: 0, correct: 0, wrong: 0, partial: 0, pending: 0, unchecked: 0, unanswered: 0 }
  for (const id of ids) {
    const state = states[id]
    if (!state?.answered) { counts.unanswered++; continue }
    counts.answered++
    if (state.verdict) counts[state.verdict]++
    else counts.unchecked++
  }
  return counts
}
