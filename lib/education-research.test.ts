import { describe, expect, it } from 'vitest'
import {
  isValidResearchAccessCode,
  normalizeResearchAccessCode,
  researchQuestionMaxScore,
  selectedResearchMaxScore,
} from '@/lib/education-research'

describe('education research helpers', () => {
  it('normalizes research access codes without changing their meaning', () => {
    expect(normalizeResearchAccessCode('  m41-post ')).toBe('M41-POST')
    expect(normalizeResearchAccessCode('')).toBeNull()
    expect(isValidResearchAccessCode('M41-POST')).toBe(true)
    expect(isValidResearchAccessCode('รหัสสอบ')).toBe(false)
    expect(isValidResearchAccessCode('ABC')).toBe(false)
  })

  it('uses the same structural score rules as assignment attempts', () => {
    expect(researchQuestionMaxScore({
      question_type: 'matching',
      extra_data: {},
      answer_parts: null,
      mcq_options: [{ left_text: 'A', right_text: '1' }, { left_text: 'B', right_text: '2' }] as never,
    })).toBe(2)

    expect(researchQuestionMaxScore({
      question_type: 'composite',
      extra_data: { parts: [{ type: 'mcq', score: 2 }, { type: 'ordering', score: 3 }] } as never,
      answer_parts: null,
      mcq_options: null,
    })).toBe(5)
  })

  it('totals only questions that are present in the available bank', () => {
    expect(selectedResearchMaxScore(['q2', 'missing', 'q1'], [
      { id: 'q1', title: '1', question_text: '', question_type: 'mcq', difficulty: 'easy', tags: null, max_score: 1 },
      { id: 'q2', title: '2', question_text: '', question_type: 'matching', difficulty: 'medium', tags: null, max_score: 4 },
    ])).toBe(5)
  })
})
