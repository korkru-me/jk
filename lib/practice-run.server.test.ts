import { afterEach, expect, it, vi } from 'vitest'
import type { Question } from './types'
import { preparePracticeRunQuestion } from './practice-run.server'
import { practiceQuestionRevision } from './practice-question-variant.server'
import { verifyPracticeVariantReceipt } from './practice-variant.server'
vi.mock('server-only', () => ({}))
afterEach(() => vi.unstubAllEnvs())
const actorId = '11111111-1111-4111-8111-111111111111'
const library = { id: '22222222-2222-4222-8222-222222222222', classroomId: actorId, title: 'ฝึก', description: null, revealAnswerKey: false, requiresAccessCode: false, calculatorEnabled: false, scratchpadEnabled: true, shuffleOptions: true }
const question = { id: '33333333-3333-4333-8333-333333333333', title: 'แรง', question_text: '<p>เลือกคำตอบ</p>', question_type: 'mcq', answer_formula: '', answer_unit: null, answer_tolerance: 0, answer_parts: null,
  mcq_options: [{ text: 'หนึ่ง', is_correct: true }, { text: 'สอง', is_correct: false }], variables: [], logic_rules: [], extra_data: {}, image_urls: null, tags: [] } as unknown as Question
it('does not repeat the last displayed numeric variant and signs its new answer binding', () => {
  vi.stubEnv('PRACTICE_VARIANT_SECRET', 'test-only-signing-secret-at-least-32-characters')
  const numeric = { ...question, question_type: 'written', answer_formula: 'x * 2', question_text: 'หา {x}', variables: [{ name: 'x', min: 1, max: 9, step: 1 }], mcq_options: null } as Question
  const result = preparePracticeRunQuestion(actorId, library, numeric, { x: 1 })!
  expect(result.question.random_values).not.toEqual({ x: 1 })
  expect(result.changesOnRefresh).toBe(true)
  expect(JSON.stringify(result)).not.toContain('answer_formula')
})
it('does not produce a run payload without a signing secret', () => {
  vi.stubEnv('PRACTICE_VARIANT_SECRET', '')
  expect(preparePracticeRunQuestion(actorId, library, question)).toBeNull()
})
it('binds a safe variant to the actor and exact question and preserves authorized tool flags', () => {
  const secret = 'test-only-practice-run-secret-with-more-than-32-characters'
  vi.stubEnv('PRACTICE_VARIANT_SECRET', secret)
  const result = preparePracticeRunQuestion(actorId, library, question)!
  const identity = { actorId, libraryId: library.id, questionId: question.id, questionRevision: practiceQuestionRevision(question, library.shuffleOptions) }
  expect(verifyPracticeVariantReceipt(result.variantReceipt, identity, secret)).not.toBeNull()
  expect(verifyPracticeVariantReceipt(result.variantReceipt, { ...identity, actorId: library.id }, secret)).toBeNull()
  expect(result.calculatorEnabled).toBe(false)
  expect(result.scratchpadEnabled).toBe(true)
  expect(JSON.stringify(result)).not.toMatch(/is_correct|answer_formula|correctAnswer|solution_text|optionOrder/)
})
