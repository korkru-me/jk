import type { GradingScoreDraftSource, GradingScoreKind } from './grading-score-drafts'

export function uniformGradingScope(sources: readonly GradingScoreDraftSource[], kind: GradingScoreKind) {
  const targets = sources.filter(source => !source.disabled && source.parts.maxScore > 0
    && source.parts[kind].enabled && source.parts[kind].maxScore > 0
    && (kind !== 'work' || source.parts.hasWork))
  return {
    targets,
    excludedCount: sources.length - targets.length,
    maxScore: targets.length ? targets.reduce((minimum, source) => Math.min(minimum, source.parts[kind].maxScore), Number.POSITIVE_INFINITY) : 0,
  }
}

/** Validate every applicable row before changing the first draft. Different
 * historical weights share their lowest ceiling; no row is silently clamped. */
export function prepareUniformGradingScore(sources: readonly GradingScoreDraftSource[], kind: GradingScoreKind, value: string) {
  const scope = uniformGradingScope(sources, kind)
  if (!scope.targets.length) return { ok: false as const, error: 'ไม่มีคำตอบที่ให้คะแนนส่วนนี้ได้' }
  const score = value.trim() === '' ? NaN : Number(value)
  if (!Number.isFinite(score) || score < 0 || scope.targets.some(source => score > source.parts[kind].maxScore)) {
    return { ok: false as const, error: `คะแนนต้องอยู่ระหว่าง 0–${scope.maxScore} เพื่อใช้กับทุกคำตอบที่เลือก` }
  }
  return { ok: true as const, targets: scope.targets, score }
}
