import { acceptedAnswers, getBlankType } from '@/lib/fill-blank'
import { classifyCorrectGrid, CLASSIFY_UNSET } from '@/lib/classify'
import type { SafeExamAnswer } from '@/lib/exam-safe'
import { imageLabelKey } from '@/lib/image-label'
import { matchingChoices } from '@/lib/matching-choices'
import { evaluateFormula, randomizeVariables } from '@/lib/math/evaluator'
import {
  practiceMatchingChoiceForToken,
  validPracticeMatchingTokens,
} from '@/lib/practice-matching'
import { questionExcerpt } from '@/lib/question-display'
import type { AnswerFeedback } from '@/lib/answer-feedback'
import type {
  ClassifyConfig,
  CompositeConfig,
  CompositePart,
  FillBlankConfig,
  ImageLabelConfig,
  MatchingConfig,
  MatchingPair,
  MCQOption,
  OrderingItem,
  Question,
  QuestionType,
  RandomQuestionConfig,
  TrueFalseConfig,
} from '@/lib/types'

export const PRACTICE_SUPPORTED_QUESTION_TYPES = [
  'mcq',
  'written',
  'matching',
  'true_false',
  'fill_blank',
  'ordering',
  'composite',
  'classify',
  'image_label',
] as const satisfies readonly QuestionType[]

export type PracticeSupportedQuestionType =
  (typeof PRACTICE_SUPPORTED_QUESTION_TYPES)[number]

export type PracticeQuestionShape = Pick<
  Question,
  | 'question_type'
  | 'variables'
  | 'logic_rules'
  | 'answer_formula'
  | 'answer_parts'
  | 'mcq_options'
  | 'extra_data'
>

export interface PracticeQuestionSupport {
  supported: boolean
  reason?: string
}

const MAX_ANSWER_LENGTH = 64 * 1024

function hasOneCorrectOption(options: MCQOption[]): boolean {
  return options.length >= 2 && options.filter(option => option.is_correct).length === 1
}

function hasUniqueItemIds(items: OrderingItem[]): boolean {
  return items.length >= 2
    && items.every(item => typeof item.id === 'string' && item.id.trim().length > 0)
    && new Set(items.map(item => item.id)).size === items.length
}

function compositePartIsAutoGradable(part: CompositePart): boolean {
  if (part.type === 'true_false') {
    return part.choices?.length
      ? part.choices.every(choice => typeof choice.correct_answer === 'boolean')
      : typeof part.correct_answer === 'boolean'
  }
  if (part.type === 'fill_blank') {
    const blank = part.blanks?.[0]
    return Boolean(
      blank
      && getBlankType(undefined, blank) !== 'text'
      && acceptedAnswers(blank).length > 0,
    )
  }
  if (part.type === 'mcq') return hasOneCorrectOption(part.options ?? [])
  if (part.type === 'ordering') return hasUniqueItemIds(part.items ?? [])
  return false
}

function writtenFormulaeAreFinite(question: PracticeQuestionShape): boolean {
  const variables = question.variables ?? []
  if (variables.some(variable => variable.type === 'reference')) return false
  const config = question.extra_data as RandomQuestionConfig
  const formulas = (question.answer_parts ?? []).length > 0
    ? (question.answer_parts ?? []).map(part => part.formula)
    : [question.answer_formula]
  if (formulas.length === 0) return false

  // Parse/evaluate several deterministic representatives. One midpoint alone
  // can miss a denominator that is zero at an edge of the configured range.
  for (const draw of [0, 0.25, 0.5, 0.75, 0.999999]) {
    const scope = randomizeVariables(variables, question.logic_rules ?? [], {
      maxAttempts: 50,
      pythagoreanGroups: config?.pythagorean_groups ?? [],
      rng: () => draw,
    })
    for (let index = 0; index < formulas.length; index += 1) {
      const formula = formulas[index]
      if (typeof formula !== 'string' || !formula.trim()) return false
      const result = evaluateFormula(formula, scope)
      if (typeof result !== 'number' || !Number.isFinite(result)) return false
      scope[`ans${index}`] = result
    }
  }
  return true
}

/**
 * The authoring picker and student route share this exact allowlist. A type is
 * not practice-ready merely because the evaluator knows its name: every part
 * must be auto-gradable because no answer is retained for a teacher to mark.
 */
export function practiceQuestionSupport(
  question: PracticeQuestionShape,
): PracticeQuestionSupport {
  const type = question.question_type
  if (!(PRACTICE_SUPPORTED_QUESTION_TYPES as readonly string[]).includes(type)) {
    return { supported: false, reason: 'คลังฝึกรองรับเฉพาะโจทย์ที่ตรวจอัตโนมัติได้' }
  }

  if (type === 'written') {
    return writtenFormulaeAreFinite(question)
      ? { supported: true }
      : { supported: false, reason: 'โจทย์ตัวเลขต้องมีสูตรคำตอบที่คำนวณได้ครบทุกช่อง' }
  }

  if (type === 'mcq') {
    return hasOneCorrectOption((question.mcq_options ?? []) as MCQOption[])
      ? { supported: true }
      : { supported: false, reason: 'โจทย์ปรนัยต้องมีคำตอบถูกหนึ่งตัวเลือก' }
  }

  if (type === 'matching') {
    const pairs = (question.mcq_options ?? []) as unknown as MatchingPair[]
    return pairs.length > 0
      && pairs.every(pair => (
        (typeof pair.right_text === 'string' && pair.right_text.trim().length > 0)
        || (typeof pair.right_image === 'string' && pair.right_image.trim().length > 0)
      ))
      ? { supported: true }
      : { supported: false, reason: 'โจทย์จับคู่ต้องมีคู่คำตอบครบ' }
  }

  if (type === 'true_false') {
    const config = question.extra_data as TrueFalseConfig
    const hasKey = typeof config?.correct_answer === 'boolean'
      && (config.statements ?? []).every(statement => typeof statement.correct_answer === 'boolean')
    return config?.explanation_mode === 'none' && hasKey
      ? { supported: true }
      : { supported: false, reason: 'โจทย์ถูก–ผิดต้องมีเฉลยครบและไม่ใช้คำอธิบายที่ครูตรวจ' }
  }

  if (type === 'fill_blank') {
    const config = question.extra_data as FillBlankConfig
    const blanks = config?.blanks ?? []
    const auto = blanks.length > 0 && blanks.every(blank => (
      getBlankType(config, blank) !== 'text' && acceptedAnswers(blank).length > 0
    ))
    return auto
      ? { supported: true }
      : { supported: false, reason: 'ช่องเติมคำต้องมีเฉลยตรวจอัตโนมัติครบทุกช่อง' }
  }

  if (type === 'ordering') {
    const items = (question.extra_data as { items?: OrderingItem[] })?.items ?? []
    return hasUniqueItemIds(items)
      ? { supported: true }
      : { supported: false, reason: 'โจทย์เรียงลำดับต้องมีรายการอย่างน้อยสองรายการ' }
  }

  if (type === 'composite') {
    const parts = (question.extra_data as CompositeConfig)?.parts ?? []
    return parts.length > 0 && parts.every(compositePartIsAutoGradable)
      ? { supported: true }
      : { supported: false, reason: 'โจทย์ผสมต้องตรวจอัตโนมัติได้ครบทุกข้อย่อย' }
  }

  if (type === 'classify') {
    const config = question.extra_data as ClassifyConfig
    const grid = classifyCorrectGrid(config)
    const expectedCells = (config?.rows?.length ?? 0) * (config?.columns?.length ?? 0)
    const everyCellIsKeyed = expectedCells > 0
      && grid.length === (config?.rows?.length ?? 0)
      && grid.every(row => row.length === (config?.columns?.length ?? 0)
        && row.every(cell => cell !== CLASSIFY_UNSET))
    return everyCellIsKeyed
      ? { supported: true }
      : { supported: false, reason: 'ตารางจำแนกต้องมีเฉลยครบทุกช่อง' }
  }

  if (type === 'image_label') {
    const config = question.extra_data as ImageLabelConfig
    const markerKeys = imageLabelKey(config)
    const everyMarkerIsKeyed = (config?.markers?.length ?? 0) > 0
      && markerKeys.length === config.markers.length
      && markerKeys.every(marker => marker.answers.length > 0)
    return config?.image_url?.trim() && everyMarkerIsKeyed
      ? { supported: true }
      : { supported: false, reason: 'โจทย์เติมคำในรูปต้องมีรูปและเฉลยครบทุกจุด' }
  }

  return { supported: false, reason: 'ชนิดโจทย์นี้ยังไม่รองรับในคลังฝึก' }
}

export function isPracticeLibraryEnabled(
  environment: NodeJS.ProcessEnv | { PRACTICE_LIBRARY_ENABLED?: string },
): boolean {
  return 'PRACTICE_LIBRARY_ENABLED' in environment
    && environment.PRACTICE_LIBRARY_ENABLED === 'true'
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    ? value
    : null
}

function exactOrdering(raw: string, items: OrderingItem[]): boolean {
  const parsed = stringArray(parseJson(raw))
  if (!parsed || parsed.length !== items.length) return false
  const expected = new Set(items.map(item => item.id))
  return new Set(parsed).size === parsed.length && parsed.every(id => expected.has(id))
}

function meaningfulStrings(values: readonly string[]): boolean {
  return values.some(value => value.trim().length > 0)
}

function validCompositeAnswer(parts: CompositePart[], raw: string): boolean {
  const answers = stringArray(parseJson(raw))
  if (!answers || answers.length !== parts.length) return false
  let meaningful = false

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    const answer = answers[index] ?? ''
    if (part.type === 'true_false') {
      if (part.choices?.length) {
        if (!answer) continue
        const ticks = stringArray(parseJson(answer))
        if (!ticks || ticks.length !== part.choices.length
          || ticks.some(value => value !== 'true' && value !== 'false')) return false
        meaningful = true
      } else {
        if (answer && answer !== 'true' && answer !== 'false') return false
        meaningful ||= answer.length > 0
      }
      continue
    }
    if (part.type === 'fill_blank') {
      meaningful ||= answer.trim().length > 0
      continue
    }
    if (part.type === 'mcq') {
      if (answer) {
        const match = /^MCQ:(\d+)$/.exec(answer)
        if (!match || Number(match[1]) >= (part.options?.length ?? 0)) return false
        meaningful = true
      }
      continue
    }
    if (part.type === 'ordering') {
      if (!answer) continue
      if (!exactOrdering(answer, part.items ?? [])) return false
      meaningful = true
    }
  }

  return meaningful
}

/**
 * Validates the browser's encoded answer against the trusted question shape.
 * The returned string may be graded in memory; it must never be persisted or
 * included in logs.
 */
export function validatedPracticeAnswer(
  question: PracticeQuestionShape,
  answer: unknown,
): string | null {
  if (typeof answer !== 'string' || answer.length > MAX_ANSWER_LENGTH) return null
  const type = question.question_type

  if (type === 'written') {
    const partCount = Math.max(1, question.answer_parts?.length ?? 0)
    if (partCount === 1) return answer.trim() ? answer : null
    const values = stringArray(parseJson(answer))
    return values?.length === partCount && meaningfulStrings(values) ? answer : null
  }

  if (type === 'mcq') {
    const match = /^MCQ:(\d+)$/.exec(answer)
    return match && Number(match[1]) < (question.mcq_options?.length ?? 0) ? answer : null
  }

  if (type === 'matching') {
    const values = stringArray(parseJson(answer))
    const pairs = (question.mcq_options ?? []) as unknown as MatchingPair[]
    const choices = matchingChoices(pairs, question.extra_data as MatchingConfig | undefined)
    return values && validPracticeMatchingTokens(values, choices, pairs.length) ? answer : null
  }

  if (type === 'true_false') {
    const config = question.extra_data as TrueFalseConfig
    const count = 1 + (config?.statements?.length ?? 0)
    if (count === 1) {
      const payload = answer.startsWith('{') ? parseJson(answer) : null
      const value = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>).answer
        : answer
      return value === 'true' || value === 'false' ? answer : null
    }
    const payload = parseJson(answer)
    const values = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? stringArray((payload as Record<string, unknown>).answers)
      : null
    return values?.length === count
      && values.every(value => value === 'true' || value === 'false' || value === '')
      && (config.answer_mode === 'select_matching' || meaningfulStrings(values))
      ? answer
      : null
  }

  if (type === 'fill_blank') {
    const count = (question.extra_data as FillBlankConfig)?.blanks?.length ?? 0
    const values = stringArray(parseJson(answer))
    return values?.length === count && meaningfulStrings(values) ? answer : null
  }

  if (type === 'ordering') {
    const items = (question.extra_data as { items?: OrderingItem[] })?.items ?? []
    return exactOrdering(answer, items) ? answer : null
  }

  if (type === 'composite') {
    const parts = (question.extra_data as CompositeConfig)?.parts ?? []
    return validCompositeAnswer(parts, answer) ? answer : null
  }

  if (type === 'classify') {
    const config = question.extra_data as ClassifyConfig
    const parsed = parseJson(answer)
    if (!Array.isArray(parsed) || parsed.length !== (config?.rows?.length ?? 0)) return null
    let meaningful = false
    for (const row of parsed) {
      if (!Array.isArray(row) || row.length !== (config?.columns?.length ?? 0)) return null
      for (let column = 0; column < row.length; column += 1) {
        const choice = row[column]
        if (!Number.isInteger(choice) || choice < CLASSIFY_UNSET
          || choice >= (config.columns[column]?.options?.length ?? 0)) return null
        meaningful ||= choice !== CLASSIFY_UNSET
      }
    }
    return meaningful ? answer : null
  }

  if (type === 'image_label') {
    const count = (question.extra_data as ImageLabelConfig)?.markers?.length ?? 0
    const values = stringArray(parseJson(answer))
    return values?.length === count && meaningfulStrings(values) ? answer : null
  }

  return null
}

export interface PracticeFeedback {
  verdict: AnswerFeedback['verdict']
  revealed: boolean
  rows: Array<{
    label?: string
    student: string
    correct?: string
    unit?: string
    status: 'correct' | 'wrong' | 'pending'
  }>
  choices?: Array<{
    label: string
    text: string
    imageUrl?: string
    picked: boolean
    correct: boolean
  }>
  note?: string
}

type PracticeFeedbackQuestion = Pick<
  SafeExamAnswer['questions'],
  'question_type' | 'mcq_options' | 'matching_options'
>

function readablePracticeMatchingToken(
  token: string,
  choices: NonNullable<PracticeFeedbackQuestion['matching_options']>,
): string {
  if (!token) return '—'
  const resolved = practiceMatchingChoiceForToken(token, choices)
  if (!resolved) return '—'
  const text = questionExcerpt(resolved.choice.right_text)
  if (text) return text
  return resolved.choice.right_image ? `รูปตัวเลือกที่ ${resolved.index + 1}` : '—'
}

/**
 * Drops score/maxScore by construction before feedback crosses the server
 * boundary, and turns practice-only matching tokens back into visible labels.
 */
export function toPracticeFeedback(
  feedback: AnswerFeedback,
  question?: PracticeFeedbackQuestion,
): PracticeFeedback {
  const matchingOptions = question?.question_type === 'matching'
    ? question.matching_options ?? []
    : null
  return {
    verdict: feedback.verdict,
    revealed: feedback.revealed,
    rows: feedback.rows.map((row, index) => ({
      ...((row.label || matchingOptions) ? {
        label: row.label || (question?.mcq_options?.[index]?.left_image
          ? `รูปโจทย์ที่ ${index + 1}`
          : `ข้อ ${index + 1}`),
      } : {}),
      student: matchingOptions
        ? readablePracticeMatchingToken(row.student, matchingOptions)
        : row.student,
      ...(row.correct ? {
        correct: matchingOptions
          ? readablePracticeMatchingToken(row.correct, matchingOptions)
          : row.correct,
      } : {}),
      ...(row.unit ? { unit: row.unit } : {}),
      status: row.status,
    })),
    ...(feedback.choices ? {
      choices: feedback.choices.map(choice => ({
        label: choice.label,
        text: choice.text,
        ...(choice.imageUrl ? { imageUrl: choice.imageUrl } : {}),
        picked: choice.picked,
        correct: choice.correct,
      })),
    } : {}),
    ...(feedback.note ? { note: feedback.note } : {}),
  }
}
