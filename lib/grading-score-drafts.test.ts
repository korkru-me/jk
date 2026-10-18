import { describe, expect, it } from 'vitest'
import { editGradingScoreDraft, prepareGradingScoreDrafts, settleGradingScoreDrafts, type GradingScoreDraftSource, type GradingScoreDrafts } from './grading-score-drafts'

function source(answerId = 'answer-1', options: { pending?: boolean; revision?: string | null; answerScore?: number; answerMax?: number; workPending?: boolean } = {}): GradingScoreDraftSource {
  return {
    answerId, scoreEditedAt: options.revision ?? null,
    parts: {
      answer: { score: options.answerScore ?? 3, maxScore: options.answerMax ?? 6, pending: options.pending ?? false, enabled: true, source: 'automatic' },
      work: { score: 0, maxScore: 4, pending: options.workPending ?? true, enabled: true, source: 'none' },
      total: 3, maxScore: 10, rawMaxScore: 10, pending: true, hasWork: true, needsAllocation: false,
    },
  }
}

function edited(row: GradingScoreDraftSource, kind: 'answer' | 'work', value: string) {
  return editGradingScoreDraft(undefined, row, kind, value)!
}

describe('grading score drafts', () => {
  it('submits only the changed touched part and leaves untouched pending work alone', () => {
    const row = source()
    const draft = edited(row, 'answer', '4.5')
    expect(prepareGradingScoreDrafts('assignment', { [row.answerId]: draft }, new Map([[row.answerId, row]]))).toEqual({
      inputs: [{ assignmentId: 'assignment', answerId: row.answerId, expectedScoreEditedAt: null, answerScore: 4.5 }], errors: {},
    })
  })

  it('explicitly typing pending zero creates a review; untouched zero creates no write', () => {
    const row = source('pending', { pending: true, answerScore: 0 })
    expect(prepareGradingScoreDrafts('assignment', {}, new Map([[row.answerId, row]])).inputs).toEqual([])
    const draft = edited(row, 'answer', '0')
    expect(prepareGradingScoreDrafts('assignment', { pending: draft }, new Map([[row.answerId, row]])).inputs).toEqual([
      { assignmentId: 'assignment', answerId: 'pending', expectedScoreEditedAt: null, answerScore: 0 },
    ])
    expect(draft.fields).toEqual({ answer: '0' })
  })

  it('editing pending work does not mark a pending answer as reviewed', () => {
    const row = source('pending', { pending: true, answerScore: 0 })
    expect(prepareGradingScoreDrafts('assignment', { pending: edited(row, 'work', '0') }, new Map([[row.answerId, row]])).inputs).toEqual([
      { assignmentId: 'assignment', answerId: 'pending', expectedScoreEditedAt: null, workScore: 0 },
    ])
  })

  it('returns to clean when a reviewed score is reverted, including equivalent numeric text', () => {
    const row = source()
    expect(editGradingScoreDraft(edited(row, 'answer', '4'), row, 'answer', '3.00')).toBeUndefined()
    expect(editGradingScoreDraft(undefined, row, 'answer', '3')).toBeUndefined()
  })

  it('does not discard an explicitly reviewed pending zero when it is reverted to zero', () => {
    const row = source('pending', { pending: true, answerScore: 0 })
    expect(editGradingScoreDraft(edited(row, 'answer', '4'), row, 'answer', '0')?.fields).toEqual({ answer: '0' })
  })

  it.each(['', ' ', '-1', '6.01', 'NaN', 'Infinity', 'abc'])('blocks the entire batch before writes for an invalid value: %j', value => {
    const first = source('valid'), second = source('invalid')
    const result = prepareGradingScoreDrafts('assignment', {
      valid: edited(first, 'answer', '4'), invalid: edited(second, 'answer', value),
    }, new Map([['valid', first], ['invalid', second]]))
    expect(result.inputs).toEqual([])
    expect(result.errors).toEqual({ invalid: 'คะแนนคำตอบต้องอยู่ระหว่าง 0–6' })
  })

  it('validates against refreshed limits while preserving the first-edit revision', () => {
    const before = source('changed', { revision: 'revision-one' })
    const draft = edited(before, 'answer', '5')
    const refreshed = source('changed', { revision: 'revision-two', answerMax: 4 })
    expect(prepareGradingScoreDrafts('assignment', { changed: draft }, new Map([['changed', refreshed]]))).toEqual({
      inputs: [], errors: { changed: 'คะแนนคำตอบต้องอยู่ระหว่าง 0–4' },
    })
    const nextDraft = editGradingScoreDraft(draft, refreshed, 'answer', '4')!
    expect(nextDraft.source.scoreEditedAt).toBe('revision-one')
    expect(prepareGradingScoreDrafts('assignment', { changed: nextDraft }, new Map([['changed', refreshed]])).inputs[0].expectedScoreEditedAt).toBe('revision-one')
  })

  it('rejects unavailable/disabled/void rows and disabled grading parts', () => {
    const row = source()
    const draft = edited(row, 'work', '1')
    for (const current of [undefined, { ...row, disabled: true }, { ...row, parts: { ...row.parts, maxScore: 0 } }, { ...row, parts: { ...row.parts, work: { ...row.parts.work, enabled: false } } }]) {
      const result = prepareGradingScoreDrafts('assignment', { [row.answerId]: draft }, new Map(current ? [[row.answerId, current]] : []))
      expect(result.inputs).toEqual([])
      expect(result.errors[row.answerId]).toBeTruthy()
    }
  })

  it('combines two touched parts into one answer action, with no duplicate input', () => {
    const row = source()
    const draft = editGradingScoreDraft(edited(row, 'answer', '5'), row, 'work', '3')!
    expect(prepareGradingScoreDrafts('assignment', { [row.answerId]: draft }, new Map([[row.answerId, row]])).inputs).toEqual([
      { assignmentId: 'assignment', answerId: row.answerId, expectedScoreEditedAt: null, answerScore: 5, workScore: 3 },
    ])
  })

  it('clears only confirmed successes after partial failure and retains failed CAS revisions', () => {
    const saved = source('saved', { revision: 'saved-old' }), conflict = source('conflict', { revision: 'conflict-old' }), uncertain = source('uncertain')
    const submitted: GradingScoreDrafts = { saved: edited(saved, 'answer', '5'), conflict: edited(conflict, 'answer', '4'), uncertain: edited(uncertain, 'work', '2') }
    const remaining = settleGradingScoreDrafts(submitted, submitted, new Set(['saved']))
    expect(Object.keys(remaining)).toEqual(['conflict', 'uncertain'])
    expect(remaining.conflict).toBe(submitted.conflict)
    expect(remaining.uncertain).toBe(submitted.uncertain)
    const result = prepareGradingScoreDrafts('assignment', remaining, new Map([['saved', { ...saved, scoreEditedAt: 'saved-new' }], ['conflict', { ...conflict, scoreEditedAt: 'conflict-new' }], ['uncertain', uncertain]]))
    expect(result.inputs.map(input => input.answerId)).toEqual(['conflict', 'uncertain'])
    expect(result.inputs[0].expectedScoreEditedAt).toBe('conflict-old')
  })

  it('preserves a newer edit even when its previously submitted draft succeeds', () => {
    const row = source()
    const submitted = { [row.answerId]: edited(row, 'answer', '4') }
    const current = { [row.answerId]: editGradingScoreDraft(submitted[row.answerId], row, 'answer', '5')! }
    expect(settleGradingScoreDrafts(current, submitted, new Set([row.answerId]))).toEqual(current)
  })

  it('a clean subsequent edit captures the latest server revision', () => {
    const refreshed = source('saved', { revision: 'new-revision', answerScore: 5 })
    expect(edited(refreshed, 'answer', '4').source.scoreEditedAt).toBe('new-revision')
  })
})
