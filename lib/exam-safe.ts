import type {
  CompositePartType,
  FileUploadConfig,
  OrderingItem,
  PythagoreanGroup,
  TrueFalseAnswerMode,
  TrueFalseExplanationMode,
  TrueFalseSelectTarget,
} from '@/lib/types'
import type { PartLabelStyle } from '@/lib/part-labels'

export interface SafeTrueFalseStatement {
  id: string
  text: string
}

export interface SafeTrueFalseConfig {
  explanation_mode: TrueFalseExplanationMode
  score_answer: number
  score_explanation: number
  statements?: SafeTrueFalseStatement[]
  part_label_style?: PartLabelStyle
  answer_mode?: TrueFalseAnswerMode
  select_target?: TrueFalseSelectTarget
}

export interface SafeFillBlankItem {
  id: number
  type: 'text' | 'fixed' | 'dropdown'
  case_sensitive: boolean
  options?: string[]
}

export interface SafeFillBlankConfig {
  blanks: SafeFillBlankItem[]
  grading_mode?: 'auto' | 'manual'
}

export interface SafeOrderingConfig {
  items: OrderingItem[]
}

export interface SafeRandomQuestionConfig {
  answer_step?: number
  pythagorean_groups?: PythagoreanGroup[]
  part_label_style?: PartLabelStyle
}

export interface SafeCompositePart {
  id: string
  type: CompositePartType
  text: string
  image_urls?: string[]
  score: number
  choices?: SafeTrueFalseStatement[]
  select_target?: TrueFalseSelectTarget
  blanks?: SafeFillBlankItem[]
  items?: OrderingItem[]
  options?: Array<{ text: string; image_url?: string }>
}

export interface SafeCompositeConfig {
  parts: SafeCompositePart[]
  part_label_style?: PartLabelStyle
}

export type SafeExamExtraData =
  | SafeTrueFalseConfig
  | SafeFillBlankConfig
  | SafeOrderingConfig
  | SafeRandomQuestionConfig
  | FileUploadConfig
  | SafeCompositeConfig
  | null

export interface SafeAnswerPart {
  id: string
  sub_text: string
  unit: string
}

export interface SafeExamAnswer {
  id: string
  question_id: string
  random_values: Record<string, number>
  student_answer: string | null
  work_images: (string | null)[] | null
  questions: {
    title: string
    question_text: string
    question_type: string
    answer_unit: string | null
    mcq_options: Array<{
      text?: string
      image_url?: string
      index?: number
      left_text?: string
      left_image?: string
    }> | null
    matching_options?: Array<{ right_text: string; right_image?: string }> | null
    variables: Array<{ name: string; unit?: string; type?: string }>
    answer_parts: SafeAnswerPart[] | null
    extra_data: SafeExamExtraData
    image_urls: string[] | null
  }
}

interface RawQuestionForExam {
  title: string
  question_text: string
  question_type: string
  answer_unit: string | null
  mcq_options: unknown[] | null
  variables: unknown[] | null
  answer_parts: unknown[] | null
  extra_data: unknown
  image_urls: string[] | null
}

interface RawExamAnswer {
  id: string
  question_id: string
  random_values: Record<string, number> | null
  student_answer: string | null
  work_images: (string | null)[] | null
  option_order: number[] | null
  questions: RawQuestionForExam | RawQuestionForExam[] | null
}

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    ? value
    : undefined
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function sanitizeTrueFalseStatement(value: unknown): SafeTrueFalseStatement {
  const statement = asRecord(value)
  return {
    id: asString(statement.id),
    text: asString(statement.text),
  }
}

function sanitizeFillBlank(value: unknown): SafeFillBlankItem {
  const blank = asRecord(value)
  const rawType = blank.type
  const type = rawType === 'fixed' || rawType === 'dropdown' ? rawType : 'text'
  const options = asStringArray(blank.options)
  return {
    id: typeof blank.id === 'number' ? blank.id : 0,
    type,
    case_sensitive: blank.case_sensitive === true,
    ...(options ? { options } : {}),
  }
}

function sanitizeOrderingItem(value: unknown): OrderingItem {
  const item = asRecord(value)
  return {
    id: asString(item.id),
    text: asString(item.text),
    ...(asOptionalString(item.image_url) ? { image_url: asOptionalString(item.image_url) } : {}),
  }
}

function sanitizeExtraData(questionType: string, value: unknown, random: () => number): SafeExamExtraData {
  const extra = asRecord(value)

  if (questionType === 'true_false') {
    const statements = Array.isArray(extra.statements)
      ? extra.statements.map(sanitizeTrueFalseStatement)
      : undefined
    return {
      explanation_mode: extra.explanation_mode === 'wrong_only' || extra.explanation_mode === 'always'
        ? extra.explanation_mode
        : 'none',
      score_answer: typeof extra.score_answer === 'number' ? extra.score_answer : 1,
      score_explanation: typeof extra.score_explanation === 'number' ? extra.score_explanation : 0,
      ...(statements ? { statements } : {}),
      ...(asOptionalString(extra.part_label_style) ? { part_label_style: extra.part_label_style as PartLabelStyle } : {}),
      ...(extra.answer_mode === 'select_matching' ? { answer_mode: 'select_matching' as const } : {}),
      ...(extra.select_target === 'wrong' ? { select_target: 'wrong' as const } : {}),
    }
  }

  if (questionType === 'fill_blank') {
    return {
      blanks: Array.isArray(extra.blanks) ? extra.blanks.map(sanitizeFillBlank) : [],
      ...(extra.grading_mode === 'auto' || extra.grading_mode === 'manual'
        ? { grading_mode: extra.grading_mode }
        : {}),
    }
  }

  if (questionType === 'ordering') {
    const items = Array.isArray(extra.items) ? extra.items.map(sanitizeOrderingItem) : []
    return { items: shuffle(items, random) }
  }

  if (questionType === 'file_upload') {
    const attachmentUrls = asStringArray(extra.attachment_urls)
    return attachmentUrls ? { attachment_urls: attachmentUrls } : {}
  }

  if (questionType === 'composite') {
    const parts: SafeCompositePart[] = Array.isArray(extra.parts)
      ? extra.parts.map((rawPart) => {
          const part = asRecord(rawPart)
          const rawPartType = part.type
          const type: CompositePartType = rawPartType === 'fill_blank' || rawPartType === 'ordering' || rawPartType === 'mcq'
            ? rawPartType
            : 'true_false'
          const imageUrls = asStringArray(part.image_urls)
          const choices = Array.isArray(part.choices) ? part.choices.map(sanitizeTrueFalseStatement) : undefined
          const blanks = Array.isArray(part.blanks) ? part.blanks.map(sanitizeFillBlank) : undefined
          const items = Array.isArray(part.items)
            ? shuffle(part.items.map(sanitizeOrderingItem), random)
            : undefined
          const options = Array.isArray(part.options)
            ? part.options.map((rawOption) => {
                const option = asRecord(rawOption)
                return {
                  text: asString(option.text),
                  ...(asOptionalString(option.image_url) ? { image_url: asOptionalString(option.image_url) } : {}),
                }
              })
            : undefined

          return {
            id: asString(part.id),
            type,
            text: asString(part.text),
            score: typeof part.score === 'number' ? part.score : 1,
            ...(imageUrls ? { image_urls: imageUrls } : {}),
            ...(choices ? { choices } : {}),
            ...(part.select_target === 'wrong' ? { select_target: 'wrong' as const } : {}),
            ...(blanks ? { blanks } : {}),
            ...(items ? { items } : {}),
            ...(options ? { options } : {}),
          }
        })
      : []
    return {
      parts,
      ...(asOptionalString(extra.part_label_style) ? { part_label_style: extra.part_label_style as PartLabelStyle } : {}),
    }
  }

  const pythagoreanGroups = Array.isArray(extra.pythagorean_groups)
    ? extra.pythagorean_groups.map((rawGroup) => {
        const group = asRecord(rawGroup)
        return {
          id: asString(group.id),
          a_var: asString(group.a_var),
          b_var: asString(group.b_var),
          c_var: asString(group.c_var),
        }
      })
    : undefined
  return {
    ...(typeof extra.answer_step === 'number' ? { answer_step: extra.answer_step } : {}),
    ...(pythagoreanGroups ? { pythagorean_groups: pythagoreanGroups } : {}),
    ...(asOptionalString(extra.part_label_style) ? { part_label_style: extra.part_label_style as PartLabelStyle } : {}),
  }
}

/**
 * Converts a trusted server-side answer snapshot into the only shape that an
 * in-progress student exam may receive. Every field is explicitly rebuilt so
 * new answer-key columns cannot accidentally start flowing to the browser.
 */
export function toSafeExamAnswer(row: RawExamAnswer, random: () => number = Math.random): SafeExamAnswer | null {
  const question = Array.isArray(row.questions) ? row.questions[0] : row.questions
  if (!question) return null

  const rawOptions = question.mcq_options ?? []
  let mcqOptions: SafeExamAnswer['questions']['mcq_options'] = null
  let matchingOptions: SafeExamAnswer['questions']['matching_options'] = null

  if (question.question_type === 'mcq') {
    const positions = row.option_order ?? rawOptions.map((_, index) => index)
    mcqOptions = positions.flatMap((index) => {
      const option = asRecord(rawOptions[index])
      if (!rawOptions[index]) return []
      return [{
        text: asString(option.text),
        image_url: asOptionalString(option.image_url),
        index,
      }]
    })
  } else if (question.question_type === 'matching') {
    mcqOptions = rawOptions.map((rawPair) => {
      const pair = asRecord(rawPair)
      return {
        left_text: asString(pair.left_text),
        left_image: asOptionalString(pair.left_image),
      }
    })
    const positions = row.option_order ?? rawOptions.map((_, index) => index)
    matchingOptions = positions.flatMap((index) => {
      const pair = asRecord(rawOptions[index])
      if (!rawOptions[index]) return []
      return [{
        right_text: asString(pair.right_text),
        right_image: asOptionalString(pair.right_image),
      }]
    })
  }

  const variables = (question.variables ?? []).map((rawVariable) => {
    const variable = asRecord(rawVariable)
    return {
      name: asString(variable.name),
      ...(asOptionalString(variable.unit) ? { unit: asOptionalString(variable.unit) } : {}),
      ...(asOptionalString(variable.type) ? { type: asOptionalString(variable.type) } : {}),
    }
  })

  const answerParts = question.answer_parts
    ? question.answer_parts.map((rawPart) => {
        const part = asRecord(rawPart)
        return {
          id: asString(part.id),
          sub_text: asString(part.sub_text),
          unit: asString(part.unit),
        }
      })
    : null

  return {
    id: row.id,
    question_id: row.question_id,
    random_values: row.random_values ?? {},
    student_answer: row.student_answer,
    work_images: row.work_images,
    questions: {
      title: question.title,
      question_text: question.question_text,
      question_type: question.question_type,
      answer_unit: question.answer_unit,
      mcq_options: mcqOptions,
      ...(matchingOptions ? { matching_options: matchingOptions } : {}),
      variables,
      answer_parts: answerParts,
      extra_data: sanitizeExtraData(question.question_type, question.extra_data, random),
      image_urls: question.image_urls,
    },
  }
}
