import type {
  CompositePartType,
  FileUploadConfig,
  ImageLabelAnswerMode,
  MatchingAnswerMode,
  MathInputMode,
  OrderingItem,
  PythagoreanGroup,
  TrueFalseAnswerMode,
  TrueFalseExplanationMode,
  TrueFalseSelectTarget,
} from '@/lib/types'
import type { PartLabelStyle } from '@/lib/part-labels'
import { sanitizeMathInputModes } from '@/lib/math/input-mode'
import { normalizeImageLabelMode } from '@/lib/image-label'

export interface SafeTrueFalseStatement {
  id: string
  text: string
}

export interface SafeTrueFalseConfig {
  /** The lead-in. Safe to send: it is the โจทย์, not the key. */
  prompt?: string
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

/**
 * Which matching layout the student gets. Carries no answer — the pairs
 * themselves are split into prompts and a shuffled option list elsewhere — so
 * it passes through to the exam as-is.
 */
export interface SafeMatchingConfig {
  answer_mode?: MatchingAnswerMode
}

/**
 * A ตารางจำแนก as the student may see it.
 *
 * The whole answer key of this type lives inside the rows — ClassifyRow.answers
 * maps each column id to the position of the option that column's cell should
 * hold — so unlike ปรนัย, where the key is one `is_correct` flag beside each
 * option, dropping a single field here is the difference between a worksheet
 * and a worksheet with the answers printed on it. SafeClassifyRow therefore has
 * no `answers` member at all: it cannot be forgotten, because there is nowhere
 * for it to go.
 *
 * Order is load-bearing. The student's answer is a row-major grid of option
 * positions compared against a key frozen from this same config, so the
 * sanitiser must not shuffle rows, columns or options — it copies them through
 * in place. (ปรนัย can shuffle because its attempt persists an option_order to
 * map the shuffle back; classify has no such record and needs none.)
 */
export interface SafeClassifyColumn {
  id: string
  title: string
  options: string[]
}

export interface SafeClassifyRow {
  id: string
  text: string
  image_urls?: string[]
}

export interface SafeClassifyConfig {
  columns: SafeClassifyColumn[]
  rows: SafeClassifyRow[]
  row_label_style?: PartLabelStyle
}

/**
 * A ใบงานติดป้ายบนรูป as the student may see it.
 *
 * Two things have to leave, and they leave for different reasons.
 *
 * `answers` is the key itself, so SafeImageLabelMarker has no such member at
 * all — it cannot be forgotten, because there is nowhere for it to go. So does
 * `label`, which is subtler and more dangerous for being so: it is the teacher's
 * private name for a point, used to say *which* point a line on the grading
 * screen is about, and a teacher naming the point over the trachea almost
 * always names it "หลอดลม". It is the answer under a field name that does not
 * say so.
 *
 * What stays is decided by the mode, not copied wholesale. A 'drag' question's
 * `bank` is the thing the student drags from, so it must ship; the same array
 * on a 'typed' question is the full answer vocabulary of a question that asks
 * them to write the words from memory, so it must not. A point's own `options`
 * ship only in 'dropdown', the only mode that puts a list in front of the
 * student — a leftover two-item list on a typed question would turn writing an
 * answer into a coin flip for anyone who reads the payload.
 *
 * Order is load-bearing and every marker is copied through, including the ones
 * the teacher never keyed. The student's answer is one string per point in the
 * points' own order, compared against a key frozen from this same config, so
 * dropping or reordering a marker here slides every later answer onto the wrong
 * point.
 */
export interface SafeImageLabelMarker {
  id: string
  /** Percentages of the displayed image, clamped to 0–100 — see ImageLabelMarker.point. */
  point: { x: number; y: number }
  box?: { x: number; y: number }
  /** Present only in 'dropdown', and only when this point has a list of its own. */
  options?: string[]
}

export interface SafeImageLabelConfig {
  image_url: string
  answer_mode: ImageLabelAnswerMode
  /** Present only when the mode actually puts it in front of the student. */
  bank?: string[]
  markers: SafeImageLabelMarker[]
}

export interface SafeCompositeConfig {
  parts: SafeCompositePart[]
  part_label_style?: PartLabelStyle
}

export type SafeExamExtraData =
  | SafeTrueFalseConfig
  | SafeFillBlankConfig
  | SafeOrderingConfig
  | SafeMatchingConfig
  | SafeRandomQuestionConfig
  | FileUploadConfig
  | SafeCompositeConfig
  | SafeClassifyConfig
  | SafeImageLabelConfig
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
  math_input_modes: Record<string, MathInputMode>
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
  math_input_modes?: unknown
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

/**
 * A `{ x, y }` pair of percentages, clamped into the picture.
 *
 * Clamped rather than trusted because these are read back out of jsonb: a file
 * import, or a form from before the bounds existed, can carry a point at 140%,
 * which renders a box the student cannot reach. A pair that is not two finite
 * numbers is not a position at all and comes back undefined.
 */
function asPercentPoint(value: unknown): { x: number; y: number } | undefined {
  const point = asRecord(value)
  if (typeof point.x !== 'number' || typeof point.y !== 'number') return undefined
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined
  const clamp = (n: number) => Math.min(100, Math.max(0, n))
  return { x: clamp(point.x), y: clamp(point.y) }
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
      ...(asOptionalString(extra.prompt) ? { prompt: asOptionalString(extra.prompt) } : {}),
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

  if (questionType === 'matching') {
    return extra.answer_mode === 'lines' ? { answer_mode: 'lines' as const } : {}
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

  if (questionType === 'classify') {
    const columns: SafeClassifyColumn[] = Array.isArray(extra.columns)
      ? extra.columns.map((rawColumn) => {
          const column = asRecord(rawColumn)
          return {
            id: asString(column.id),
            title: asString(column.title),
            options: asStringArray(column.options) ?? [],
          }
        })
      : []
    // Rebuilt field by field, like every other branch here: a row is copied as
    // id, text and images and nothing else, so `answers` is left behind by
    // construction rather than by a delete that a later edit could drop.
    const rows: SafeClassifyRow[] = Array.isArray(extra.rows)
      ? extra.rows.map((rawRow) => {
          const row = asRecord(rawRow)
          const imageUrls = asStringArray(row.image_urls)
          return {
            id: asString(row.id),
            text: asString(row.text),
            ...(imageUrls ? { image_urls: imageUrls } : {}),
          }
        })
      : []
    return {
      columns,
      rows,
      ...(asOptionalString(extra.row_label_style) ? { row_label_style: extra.row_label_style as PartLabelStyle } : {}),
    }
  }

  if (questionType === 'image_label') {
    // The same verdict lib/image-label.ts keys the question by. Reaching it
    // separately here is how a student ends up with a list the grader is not
    // marking against.
    const answerMode = normalizeImageLabelMode(extra.answer_mode)
    const bank = asStringArray(extra.bank)

    // Rebuilt field by field, like every other branch here: a marker is copied
    // as an id, a position and — in one mode only — a list of choices. `answers`
    // and `label` are left behind by construction rather than by a delete a
    // later edit could drop.
    const markers: SafeImageLabelMarker[] = Array.isArray(extra.markers)
      ? extra.markers.map((rawMarker) => {
          const marker = asRecord(rawMarker)
          const box = asPercentPoint(marker.box)
          const own = answerMode === 'dropdown' ? asStringArray(marker.options) : undefined
          return {
            id: asString(marker.id),
            // A marker with an unreadable position is still a marker: dropping
            // it would shift every later answer onto the wrong point. It gets
            // the middle of the picture, where it is at least visible and can
            // be answered.
            point: asPercentPoint(marker.point) ?? { x: 50, y: 50 },
            ...(box ? { box } : {}),
            ...(own && own.length > 0 ? { options: own } : {}),
          }
        })
      : []

    // 'typed' is never given the bank — that question asks the student to write
    // the words from memory, and the bank is the list of words. 'dropdown' gets
    // it only where some point actually falls back to it; where every point
    // brought its own list, the bank is answer vocabulary nothing renders.
    const bankIsOffered = bank !== undefined && (
      answerMode === 'drag'
      || (answerMode === 'dropdown' && markers.some(marker => marker.options === undefined))
    )

    return {
      image_url: asString(extra.image_url),
      answer_mode: answerMode,
      ...(bankIsOffered ? { bank } : {}),
      markers,
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
    math_input_modes: sanitizeMathInputModes(row.math_input_modes),
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
