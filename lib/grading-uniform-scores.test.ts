import { describe, expect, it } from 'vitest'
import { scoreParts, type GradingAnswer } from './grading-workspace'
import type { GradingScoreDraftSource } from './grading-score-drafts'
import type { Question } from './types'
import { prepareUniformGradingScore, uniformGradingScope } from './grading-uniform-scores'

function source(id: string, answerMaxScore = 3, workMaxScore = 5, disabled = false): GradingScoreDraftSource {
  const answer = { id, maxScore: answerMaxScore + workMaxScore, answerMaxScore, workMaxScore, gradingPartsConfigured: true,
    answerScore: 0, workScore: null, isCorrect: true, score: 0 } as GradingAnswer
  return { answerId: id, scoreEditedAt: null, disabled, parts: scoreParts(answer, { question_type: 'written', requires_work_image: true } as Question) }
}

describe('uniform grading drafts across all rows', () => {
  it('includes all applicable sources, independently of page size, and retains their original revisions', () => {
    const sources = Array.from({ length: 67 }, (_, index) => source(`answer-${index}`))
    const result = prepareUniformGradingScore(sources, 'answer', '2.5')
    expect(result.ok).toBe(true)
    if (result.ok) { expect(result.targets).toHaveLength(67); expect(result.targets[66]).toBe(sources[66]); expect(result.score).toBe(2.5) }
  })
  it('validates the lowest historical part maximum before returning any editable targets', () => {
    const sources = [source('first', 3, 5), source('smaller', 2, 6)]
    expect(uniformGradingScope(sources, 'answer').maxScore).toBe(2)
    expect(prepareUniformGradingScore(sources, 'answer', '2.5')).toEqual({ ok: false, error: 'คะแนนต้องอยู่ระหว่าง 0–2 เพื่อใช้กับทุกคำตอบที่เลือก' })
    expect(prepareUniformGradingScore(sources, 'work', '5')).toMatchObject({ ok: true, score: 5 })
  })
  it.each(['', ' ', 'NaN', 'Infinity', '-1', '3.000001'])('rejects invalid or excessive values without returning a partial fill (%j)', value => {
    expect(prepareUniformGradingScore([source('first'), source('second')], 'answer', value).ok).toBe(false)
  })
  it('allows an explicit zero to review a pending method component', () => {
    expect(prepareUniformGradingScore([source('first')], 'work', '0')).toMatchObject({ ok: true, score: 0 })
  })
  it('reports non-applicable and disabled rows instead of assigning their absent parts', () => {
    const sources = [source('applicable'), source('zero-work', 8, 0), source('disabled', 3, 5, true)]
    const scope = uniformGradingScope(sources, 'work')
    expect(scope.targets.map(item => item.answerId)).toEqual(['applicable'])
    expect(scope.excludedCount).toBe(2)
    expect(prepareUniformGradingScore([source('zero-work', 8, 0)], 'work', '0').ok).toBe(false)
  })
  it('does not mutate parts or scores while preparing the complete fill', () => {
    const sources = [source('first'), source('second')]
    const before = structuredClone(sources)
    prepareUniformGradingScore(sources, 'work', '4')
    expect(sources).toEqual(before)
  })
})
