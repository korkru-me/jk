import { describe, expect, it } from 'vitest'
import { combinedGradingDrafts, editPrivateGradingDraft } from './grading-private-drafts'
import { prepareGradingScoreDrafts, type GradingScoreDraftSource } from './grading-score-drafts'
import type { GradingSavedDraft } from './grading-draft-types'
const source: GradingScoreDraftSource = { answerId: 'a', scoreEditedAt: 'published-v1', parts: {
  answer: { score: 2, maxScore: 2, pending: false, enabled: true, source: 'automatic' },
  work: { score: 0, maxScore: 3, pending: true, enabled: true, source: 'none' },
  total: 2, maxScore: 5, rawMaxScore: 5, pending: true, hasWork: true, needsAllocation: false,
} }
const saved: GradingSavedDraft = { answerId: 'a', expectedScoreEditedAt: 'published-v1', updatedAt: 'draft-v1', answerScore: 1 }
const sources = new Map([['a', source]])

describe('private grade draft editing against published scores', () => {
  it('resumes a saved draft without an unsaved browser edit or changing published grades', () => {
    expect(combinedGradingDrafts({}, { a: saved }, sources).a.fields).toEqual({ answer: '1' })
    expect(source.parts.answer.score).toBe(2)
    expect(source.parts.work.pending).toBe(true)
  })
  it('reverting to the saved value clears only the new unsaved edit', () => {
    const edited = editPrivateGradingDraft({}, source, saved, 'answer', '0.5')
    const reverted = editPrivateGradingDraft(edited, source, saved, 'answer', '1')
    expect(reverted).toEqual({})
    expect(combinedGradingDrafts(reverted, { a: saved }, sources).a.fields.answer).toBe('1')
  })
  it('returning to the published value after saving a different draft remains an intentional edit', () => {
    const edited = editPrivateGradingDraft({}, source, saved, 'answer', '2')
    expect(edited.a.fields.answer).toBe('2')
  })
  it('merges separate answer/work values without silently marking an untouched pending part reviewed', () => {
    const draft = combinedGradingDrafts({}, { a: saved }, sources)
    expect(prepareGradingScoreDrafts('assignment', draft, sources).inputs[0]).toEqual({ assignmentId: 'assignment', answerId: 'a', expectedScoreEditedAt: 'published-v1', answerScore: 1 })
    const edited = editPrivateGradingDraft({}, source, saved, 'work', '0')
    const combined = combinedGradingDrafts(edited, { a: saved }, sources)
    expect(prepareGradingScoreDrafts('assignment', combined, sources).inputs[0]).toMatchObject({ answerScore: 1, workScore: 0 })
  })
  it('does not silently rebase a private grade when another teacher publishes a new grade', () => {
    const refreshed = { ...source, scoreEditedAt: 'published-v2' }
    const edited = editPrivateGradingDraft({}, refreshed, saved, 'answer', '0')
    const combined = combinedGradingDrafts(edited, { a: saved }, new Map([['a', refreshed]]))
    expect(prepareGradingScoreDrafts('assignment', combined, new Map([['a', refreshed]])).inputs[0].expectedScoreEditedAt).toBe('published-v1')
  })
  it('retains invalid new values for correction and blocks the entire save batch', () => {
    const edited = editPrivateGradingDraft({}, source, saved, 'work', '4')
    const combined = combinedGradingDrafts(edited, { a: saved }, sources)
    const prepared = prepareGradingScoreDrafts('assignment', combined, sources)
    expect(prepared.inputs).toEqual([])
    expect(prepared.errors.a).toBeTruthy()
  })
})
