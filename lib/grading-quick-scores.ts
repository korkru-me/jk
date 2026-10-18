export const DEFAULT_GRADING_QUICK_SCORES = [100, 90, 80, 70, 60, 50, 40] as const
export const GRADING_QUICK_SCORE_COUNT = DEFAULT_GRADING_QUICK_SCORES.length

export function isGradingQuickScores(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === GRADING_QUICK_SCORE_COUNT
    && value.every(percentage => typeof percentage === 'number'
      && Number.isFinite(percentage) && percentage >= 0 && percentage <= 100)
}

/** Browser preferences contain only percentages, never student scores or drafts. */
export function gradingQuickScoresStorageKey(assignmentId: string, viewerId?: string): string {
  const viewer = viewerId ? `viewer:${encodeURIComponent(viewerId)}` : 'browser'
  return `korkru:grading-quick-scores:v1:${encodeURIComponent(assignmentId)}:${viewer}`
}

export function parseGradingQuickScores(raw: string | null): number[] {
  if (!raw || raw.length > 2048) return [...DEFAULT_GRADING_QUICK_SCORES]
  try {
    const value: unknown = JSON.parse(raw)
    return isGradingQuickScores(value) ? [...value] : [...DEFAULT_GRADING_QUICK_SCORES]
  } catch {
    return [...DEFAULT_GRADING_QUICK_SCORES]
  }
}

export function readGradingQuickScores(storage: { getItem: (key: string) => string | null }, key: string): number[] {
  try {
    return parseGradingQuickScores(storage.getItem(key))
  } catch {
    return [...DEFAULT_GRADING_QUICK_SCORES]
  }
}

export function writeGradingQuickScores(storage: { setItem: (key: string, value: string) => void }, key: string, percentages: readonly number[]): boolean {
  if (!isGradingQuickScores(percentages)) return false
  try {
    storage.setItem(key, JSON.stringify(percentages))
    return true
  } catch {
    return false
  }
}

/** Apply to the part's raw maximum; display-total scaling belongs elsewhere. */
export function gradingQuickScore(maxScore: number, percentage: number): number | null {
  if (!Number.isFinite(maxScore) || maxScore < 0 || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null
  if (percentage === 100) return maxScore
  return Math.min(maxScore, Math.max(0, Number((maxScore * (percentage / 100)).toFixed(6))))
}
