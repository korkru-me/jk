import type { SaveGradingReviewInput } from './actions/grading-review'
import type { GradingScoreParts } from './grading-workspace'

export type GradingScoreKind = 'answer' | 'work'
export interface GradingScoreDraftSource {
  answerId: string
  scoreEditedAt: string | null
  parts: GradingScoreParts
  disabled?: boolean
}
export interface GradingScoreDraft {
  /** Capture the revision and comparison values on first edit, never a refresh. */
  source: GradingScoreDraftSource
  fields: Partial<Record<GradingScoreKind, string>>
}
export type GradingScoreDrafts = Record<string, GradingScoreDraft>

export function editGradingScoreDraft(
  draft: GradingScoreDraft | undefined, source: GradingScoreDraftSource, kind: GradingScoreKind, value: string,
): GradingScoreDraft | undefined {
  const baseline = draft?.source ?? source
  const fields = { ...draft?.fields, [kind]: value }
  const part = baseline.parts[kind]
  // Typing zero explicitly reviews a pending part. Reverting an already
  // reviewed part to its original value must not create a write.
  if (!part.pending && value.trim() !== '' && Number(value) === part.score) delete fields[kind]
  return Object.keys(fields).length ? { source: baseline, fields } : undefined
}

/** Validate the entire page before the first action. Only touched parts appear
 * in inputs; an untouched pending component must never be marked reviewed. */
export function prepareGradingScoreDrafts(
  assignmentId: string, drafts: GradingScoreDrafts, sources: ReadonlyMap<string, GradingScoreDraftSource>,
): { inputs: SaveGradingReviewInput[]; errors: Record<string, string> } {
  const inputs: SaveGradingReviewInput[] = []
  const errors: Record<string, string> = {}
  for (const [answerId, draft] of Object.entries(drafts)) {
    const current = sources.get(answerId)
    if (!current || current.disabled || current.parts.maxScore <= 0) {
      errors[answerId] = 'ไม่สามารถแก้คะแนนคำตอบนี้ได้ กรุณาโหลดหน้าใหม่'
      continue
    }
    const input: SaveGradingReviewInput = { assignmentId, answerId, expectedScoreEditedAt: draft.source.scoreEditedAt }
    for (const kind of ['answer', 'work'] as const) {
      const value = draft.fields[kind]
      if (value === undefined) continue
      const part = current.parts[kind]
      const score = value.trim() === '' ? NaN : Number(value)
      if (!part.enabled || (kind === 'work' && !current.parts.hasWork)) {
        errors[answerId] = 'สัดส่วนคะแนนเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก'
      } else if (!Number.isFinite(score) || score < 0 || score > part.maxScore) {
        errors[answerId] = `${kind === 'work' ? 'คะแนนวิธีทำ' : 'คะแนนคำตอบ'}ต้องอยู่ระหว่าง 0–${part.maxScore}`
      } else {
        input[kind === 'work' ? 'workScore' : 'answerScore'] = score
      }
    }
    if (!errors[answerId] && (input.answerScore !== undefined || input.workScore !== undefined)) inputs.push(input)
  }
  return { inputs: Object.keys(errors).length ? [] : inputs, errors }
}

/** Remove only acknowledged writes, preserving failed/ambiguous writes and any
 * newer edit which was not part of the submitted snapshot. */
export function settleGradingScoreDrafts(
  current: GradingScoreDrafts, submitted: GradingScoreDrafts, successfulIds: ReadonlySet<string>,
): GradingScoreDrafts {
  const remaining = { ...current }
  for (const id of successfulIds) if (remaining[id] === submitted[id]) delete remaining[id]
  return remaining
}
