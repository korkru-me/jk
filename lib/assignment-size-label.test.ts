import { describe, it, expect } from 'vitest'
import { assignmentSizeLabel } from './assignment-size-label'

const pool = (n: number) => Array.from({ length: n }, (_, i) => `q${i}`)

describe('assignmentSizeLabel', () => {
  it('names its own length when nothing is drawn', () => {
    expect(assignmentSizeLabel({ question_ids: pool(12) })).toBe('12 ข้อ')
  })

  it('names the draw and the คลัง it came from', () => {
    expect(assignmentSizeLabel({ question_ids: pool(20), random_question_count: 5 }))
      .toBe('5 ข้อ (สุ่มจาก 20)')
  })

  // A streak งาน has no fixed number of ข้อ, so neither the draw nor the คลัง
  // size is what a student will answer — saying "20 ข้อ" would be wrong.
  it('names the run, not a count, for a streak งาน', () => {
    expect(assignmentSizeLabel({
      question_ids: pool(20), completion_rule: 'streak', streak_target: 5,
    })).toBe('ถูกติดกัน 5 ข้อ · คลัง 20')
  })

  it('prefers the run over a draw when both are set', () => {
    expect(assignmentSizeLabel({
      question_ids: pool(20), random_question_count: 5, completion_rule: 'streak', streak_target: 4,
    })).toBe('ถูกติดกัน 4 ข้อ · คลัง 20')
  })

  it('falls back to the plain count when a streak has no target', () => {
    expect(assignmentSizeLabel({ question_ids: pool(9), completion_rule: 'streak', streak_target: null }))
      .toBe('9 ข้อ')
  })
})
