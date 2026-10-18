import type { GradingSavedDraft } from './grading-draft-types'
import { editGradingScoreDraft, type GradingScoreDraftSource, type GradingScoreDrafts, type GradingScoreKind } from './grading-score-drafts'

export function privateDraftBaseline(source: GradingScoreDraftSource, saved?: GradingSavedDraft): GradingScoreDraftSource {
  if (!saved) return source
  return { ...source, scoreEditedAt: saved.expectedScoreEditedAt, parts: { ...source.parts,
    answer: saved.answerScore === undefined ? source.parts.answer : { ...source.parts.answer, score: saved.answerScore, pending: false },
    work: saved.workScore === undefined ? source.parts.work : { ...source.parts.work, score: saved.workScore, pending: false },
  } }
}

/** Published scores remain untouched. Only differences from the last durable
 * private draft count as unsaved browser edits. */
export function editPrivateGradingDraft(edits: GradingScoreDrafts, source: GradingScoreDraftSource, saved: GradingSavedDraft | undefined, kind: GradingScoreKind, value: string): GradingScoreDrafts {
  const next = { ...edits }
  const draft = editGradingScoreDraft(next[source.answerId], privateDraftBaseline(source, saved), kind, value)
  if (draft) next[source.answerId] = draft
  else delete next[source.answerId]
  return next
}

export function combinedGradingDrafts(edits: GradingScoreDrafts, saved: Record<string, GradingSavedDraft>, sources: ReadonlyMap<string, GradingScoreDraftSource>): GradingScoreDrafts {
  const combined: GradingScoreDrafts = {}
  for (const [id, draft] of Object.entries(saved)) {
    const source = sources.get(id)
    if (!source) continue
    combined[id] = { source: privateDraftBaseline(source, draft), fields: {
      ...(draft.answerScore === undefined ? {} : { answer: String(draft.answerScore) }),
      ...(draft.workScore === undefined ? {} : { work: String(draft.workScore) }),
    } }
  }
  for (const [id, edit] of Object.entries(edits)) combined[id] = { source: edit.source, fields: { ...combined[id]?.fields, ...edit.fields } }
  return combined
}
