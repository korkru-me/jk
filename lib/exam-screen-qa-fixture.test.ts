import { describe, expect, it } from 'vitest'
import type { CompositeConfig, FillBlankConfig, MatchingConfig, OrderingConfig, TrueFalseConfig } from '@/lib/types'
import {
  buildExamScreenQaFixture,
  buildExamScreenQaQuestions,
  EXAM_SCREEN_QA_CASES,
  matchingPairs,
} from '@/app/exam-screen-lab/_lib/fixture'

describe('exam screen QA fixture', () => {
  it('covers every persisted question type and both touch-sensitive variants', () => {
    const questions = buildExamScreenQaQuestions()
    const types = new Set(questions.map(question => question.question_type))

    expect(questions).toHaveLength(11)
    expect(types).toEqual(new Set([
      'mcq',
      'written',
      'matching',
      'essay',
      'true_false',
      'fill_blank',
      'ordering',
      'file_upload',
      'composite',
    ]))
    expect(questions
      .filter(question => question.question_type === 'matching')
      .map(question => (question.extra_data as MatchingConfig).answer_mode))
      .toEqual(['slots', 'lines'])
    expect(questions
      .filter(question => question.question_type === 'true_false')
      .map(question => (question.extra_data as TrueFalseConfig).answer_mode ?? 'judge_each'))
      .toEqual(['judge_each', 'select_matching'])
    expect(questions.filter(question => question.question_type === 'matching').every(question => matchingPairs(question).length >= 4)).toBe(true)
  })

  it('uses unique synthetic ids, valid scores, and complete section coverage', () => {
    const fixture = buildExamScreenQaFixture()
    const answerIds = fixture.answers.map(answer => answer.id)
    const questionIds = fixture.answers.map(answer => answer.question_id)
    const sectionQuestionIds = fixture.sections.flatMap(section => section.question_ids)

    expect(new Set(answerIds).size).toBe(EXAM_SCREEN_QA_CASES.length)
    expect(new Set(questionIds).size).toBe(EXAM_SCREEN_QA_CASES.length)
    expect(fixture.answers.every(answer => answer.max_score > 0)).toBe(true)
    expect(sectionQuestionIds).toEqual(questionIds)
  })

  it('keeps the mobile stress cases substantial enough to expose cramped inputs', () => {
    const questions = buildExamScreenQaQuestions()
    const byType = new Map(questions.map(question => [question.question_type, question]))
    const written = byType.get('written')!
    const mcq = byType.get('mcq')!
    const fillBlank = byType.get('fill_blank')!
    const ordering = byType.get('ordering')!
    const essay = byType.get('essay')!
    const composite = byType.get('composite')!

    expect(written.answer_parts?.length).toBeGreaterThanOrEqual(2)
    expect(mcq.image_urls?.[0]).toMatch(/^data:image\/svg\+xml/)
    expect((fillBlank.extra_data as FillBlankConfig).blanks.map(blank => blank.type))
      .toEqual(expect.arrayContaining(['fixed', 'dropdown']))
    expect((ordering.extra_data as OrderingConfig).items).toHaveLength(5)
    expect(essay.question_text).toContain('5–8 บรรทัด')
    expect(essay.answer_parts).toBeNull()
    expect((composite.extra_data as CompositeConfig).parts).toHaveLength(4)
  })

  it('contains no external URL, account identifier, or production-looking email', () => {
    const serialized = JSON.stringify({
      questions: buildExamScreenQaQuestions(),
      fixture: buildExamScreenQaFixture(),
    })

    expect(serialized).not.toMatch(/https?:\/\//i)
    expect(serialized).not.toContain('@')
    expect(serialized).not.toMatch(/supabase|vercel/i)
  })
})
