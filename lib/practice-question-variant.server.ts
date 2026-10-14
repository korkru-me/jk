import 'server-only'

import { createHash } from 'node:crypto'
import { buildAttemptQuestion } from '@/lib/assignment-attempt'
import { evaluateFormula } from '@/lib/math/evaluator'
import { toSafeExamAnswer, type SafeExamAnswer } from '@/lib/exam-safe'
import { matchingChoices } from '@/lib/matching-choices'
import { practiceMatchingChoiceToken } from '@/lib/practice-matching'
import {
  drawsRandomValues,
  isSharedRandomSeed,
  questionRandom,
} from '@/lib/math/shared-random'
import type { MatchingConfig, MatchingPair, Question } from '@/lib/types'

export interface PracticeQuestionVariant {
  safeQuestion: SafeExamAnswer
  correctAnswer: string
  maxScore: number
  optionOrder: number[] | null
  randomValues: Record<string, number>
}

function exactCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(exactCanonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, exactCanonical(nested)]),
    )
  }
  return value ?? null
}

function assertFiniteWrittenAnswer(question: Question, correctAnswer: string): void {
  if (question.question_type !== 'written') return
  const expectedParts = question.answer_parts?.length ?? 0
  const values: unknown[] = expectedParts > 1
    ? (() => {
        try {
          const parsed = JSON.parse(correctAnswer)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      })()
    : [correctAnswer]
  if (values.length !== Math.max(1, expectedParts)
    || values.some(value => typeof value !== 'string'
      || !value.trim()
      || !Number.isFinite(Number(value)))) {
    throw new Error('practice variant generated a non-finite answer')
  }
}

function exactWrittenCorrectAnswer(
  question: Question,
  randomValues: Record<string, number>,
  fallback: string,
): string {
  if (question.question_type !== 'written') return fallback
  const parts = question.answer_parts ?? []
  const formulas = parts.length > 0
    ? parts.map(part => part.formula)
    : [question.answer_formula]
  const scope = { ...randomValues }
  const answers: number[] = []
  for (let index = 0; index < formulas.length; index += 1) {
    const result = evaluateFormula(formulas[index], scope)
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      throw new Error('practice variant generated a non-finite answer')
    }
    answers.push(result)
    scope[`ans${index}`] = result
  }
  return formulas.length > 1 ? JSON.stringify(answers.map(String)) : String(answers[0])
}

function exactPracticeCorrectAnswer(
  question: Question,
  randomValues: Record<string, number>,
  fallback: string,
): string {
  if (question.question_type === 'matching') {
    const pairs = (question.mcq_options ?? []) as unknown as MatchingPair[]
    return `MATCH:${JSON.stringify(pairs.map(practiceMatchingChoiceToken))}`
  }
  return exactWrittenCorrectAnswer(question, randomValues, fallback)
}

/**
 * Binds a browser-carried variant receipt to the exact question content that
 * was rendered. The fingerprint covers what the student sees and what counts
 * as correct, but not labels such as tags or difficulty.
 */
export function practiceQuestionRevision(question: Question, shuffleOptions = true): string {
  // Unlike the bank's duplicate-detection fingerprint, a signed attempt must
  // preserve exact case, markup, and nested response-token IDs. Those values
  // can change what is rendered or graded even when two questions still look
  // similar enough to be considered duplicates.
  const content = exactCanonical({
    title: question.title,
    question_text: question.question_text,
    question_type: question.question_type,
    image_urls: question.image_urls,
    mcq_options: question.mcq_options,
    answer_formula: question.answer_formula,
    answer_unit: question.answer_unit,
    answer_tolerance: question.answer_tolerance,
    answer_parts: question.answer_parts,
    variables: question.variables,
    logic_rules: question.logic_rules,
    is_random: question.is_random,
    extra_data: question.extra_data,
    shuffle_options: shuffleOptions,
  })
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

function shuffledPositions(length: number, random: () => number): number[] {
  const positions = Array.from({ length }, (_, index) => index)
  for (let index = positions.length - 1; index > 0; index -= 1) {
    const picked = Math.floor(random() * (index + 1))
    ;[positions[index], positions[picked]] = [positions[picked], positions[index]]
  }
  return positions
}

function practiceOptionOrder(question: Question, seed: number, shuffleOptions: boolean): number[] | null {
  if (question.question_type !== 'mcq' && question.question_type !== 'matching') return null
  const count = question.question_type === 'matching'
    ? matchingChoices(
        (question.mcq_options ?? []) as unknown as MatchingPair[],
        question.extra_data as MatchingConfig | undefined,
      ).length
    : (question.mcq_options ?? []).length
  if (question.question_type === 'mcq' && !shuffleOptions) {
    return Array.from({ length: count }, (_, index) => index)
  }
  return shuffledPositions(
    count,
    questionRandom(seed, `${question.id}:practice-option-order`),
  )
}

/**
 * Builds both halves of one ephemeral attempt. Only `safeQuestion` may cross
 * into a Client Component; the remaining fields stay on the server for grade.
 */
export function buildPracticeQuestionVariant(
  question: Question,
  seed: number,
  shuffleOptions = true,
): PracticeQuestionVariant {
  if (!isSharedRandomSeed(seed)) throw new Error('invalid practice question seed')
  const skeleton = buildAttemptQuestion(question, {
    orderIndex: 0,
    shuffleOptions: false,
    sharedRandomSeed: seed,
  })
  const correctAnswer = exactPracticeCorrectAnswer(
    question,
    skeleton.random_values,
    skeleton.correct_answer,
  )
  assertFiniteWrittenAnswer(question, correctAnswer)
  const optionOrder = practiceOptionOrder(question, seed, shuffleOptions)
  const safeQuestion = toSafeExamAnswer({
    id: `practice-${question.id}`,
    question_id: question.id,
    random_values: skeleton.random_values,
    student_answer: null,
    work_images: null,
    math_input_modes: {},
    option_order: optionOrder,
    questions: {
      title: question.title,
      question_text: question.question_text,
      question_type: question.question_type,
      answer_unit: question.answer_unit,
      mcq_options: question.mcq_options,
      variables: question.variables,
      answer_parts: question.answer_parts,
      extra_data: question.extra_data,
      image_urls: question.image_urls,
    },
  }, questionRandom(seed, `${question.id}:practice-safe`))
  if (!safeQuestion) throw new Error('could not build safe practice question')

  return {
    safeQuestion,
    correctAnswer,
    maxScore: skeleton.max_score,
    optionOrder,
    randomValues: skeleton.random_values,
  }
}

export function practiceVariantChangesOnRefresh(question: Question, shuffleOptions = true): boolean {
  return (question.question_type === 'mcq' && shuffleOptions)
    || question.question_type === 'matching'
    || drawsRandomValues(question)
}
