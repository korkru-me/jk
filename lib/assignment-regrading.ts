import {
  buildQuestionAnswerKeyAtValues, gradeAnswer,
  type GradableAnswer, type GradingConfig,
} from './assignment-attempt'
import { acceptedAnswers, getBlankType } from './fill-blank'
import { classifyCorrectAnswer } from './classify'
import { imageLabelCorrectAnswer } from './image-label'
import { evaluateFormula } from './math/evaluator'
import type { Question } from './types'

type Data = Record<string, any>

/** Only the rules used by gradeAnswer; display/solution fields are not a rubric. */
export function gradingSnapshot(question: Question): GradingConfig {
  return JSON.parse(JSON.stringify({
    question_type: question.question_type,
    answer_tolerance: question.answer_tolerance ?? 0.1,
    answer_parts: question.answer_parts ?? null,
    extra_data: question.extra_data ?? {},
  })) as GradingConfig
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => (
      JSON.stringify(key) + ':' + canonical((value as Data)[key])
    )).join(',') + '}'
  }
  return JSON.stringify(value) ?? 'null'
}

const list = (value: any): Data[] => Array.isArray(value) ? value : []
const identities = (items: Data[]): unknown[] => items.map((item, index) => item.id ?? index)
const options = (items: Data[]): unknown[] => items.map(item => ({ text: item.text ?? '', image_url: item.image_url ?? '' }))
const orderedIds = (items: Data[]): unknown[] => identities(items).sort((a, b) => String(a).localeCompare(String(b)))

function blankShape(config: Data | undefined, blanks: Data[]): unknown[] {
  return blanks.map((blank, index) => {
    const type = getBlankType(config, blank as any)
    return { id: blank.id ?? index, type, options: type === 'dropdown' ? blank.options ?? [] : [] }
  })
}

function partShape(part: Data): unknown {
  if (part.type === 'mcq') return options(list(part.options))
  if (part.type === 'ordering') return orderedIds(list(part.items))
  if (part.type === 'fill_blank') return blankShape(undefined, list(part.blanks))
  if (part.type === 'true_false') return identities(list(part.choices))
  return null
}

/** Positions with no stable id must retain their visible identity and order. */
function answerShape(question: Question): unknown {
  const extra = (question.extra_data ?? {}) as Data
  switch (question.question_type) {
    case 'mcq': return options(list(question.mcq_options))
    case 'written': return {
      parts: identities(list(question.answer_parts)),
      variables: (question.variables ?? []).map(variable => variable.name).sort(),
    }
    case 'true_false': return {
      statements: identities(list(extra.statements)),
      answer_mode: extra.answer_mode ?? 'judge_each',
    }
    case 'fill_blank': return blankShape(extra, list(extra.blanks))
    case 'ordering': return orderedIds(list(extra.items))
    case 'matching': {
      // A key correction may reassign existing right-hand choices to prompts.
      // Their strings are what students submitted, so the available set stays.
      const pairs = list(question.mcq_options)
      const choices = [
        ...pairs.map(pair => ({ text: pair.right_text ?? '', image: pair.right_image ?? '' })),
        ...list(extra.distractors).map(item => ({ text: item.text ?? '', image: item.image ?? '' })),
      ].map(canonical).sort()
      return { left: pairs.map(pair => ({ text: pair.left_text ?? '', image: pair.left_image ?? '' })), choices }
    }
    case 'composite': return list(extra.parts).map((part, index) => ({
      id: part.id ?? index, type: part.type, shape: partShape(part),
    }))
    case 'classify': return {
      rows: identities(list(extra.rows)),
      columns: list(extra.columns).map((column, index) => ({ id: column.id ?? index, options: column.options ?? [] })),
    }
    case 'image_label': return identities(list(extra.markers))
    default: return null
  }
}

/** Call only after determining that the question already has student answers. */
export function assertCompatibleGradingChange(previous: Question, next: Question): void {
  if (previous.question_type !== next.question_type) {
    throw new Error('เปลี่ยนประเภทโจทย์ที่มีนักเรียนทำแล้วไม่ได้ กรุณาสร้างโจทย์ข้อใหม่')
  }
  if (canonical(answerShape(previous)) !== canonical(answerShape(next))) {
    throw new Error('เปลี่ยนจำนวน ตัวตน หรือลำดับช่องคำตอบของโจทย์ที่มีนักเรียนทำแล้วไม่ได้ กรุณาสร้างโจทย์ข้อใหม่')
  }
}

function blankDefinition(config: Data | undefined, blank: Data): unknown {
  return {
    type: getBlankType(config, blank as any),
    answers: [...new Set(acceptedAnswers(blank as any).map(answer => answer.trim()))].sort(),
    case_sensitive: blank.case_sensitive ?? false,
  }
}

function gradingDefinition(question: Question): unknown {
  const extra = (question.extra_data ?? {}) as Data
  let key: unknown = null
  switch (question.question_type) {
    case 'mcq': key = list(question.mcq_options).map(option => !!option.is_correct); break
    case 'written': key = {
      formulas: question.answer_parts?.length ? question.answer_parts.map(part => part.formula) : [question.answer_formula],
      tolerance: question.answer_tolerance ?? 0.1,
      part_tolerances: (question.answer_parts ?? []).map(part => part.tolerance ?? question.answer_tolerance ?? 0.1),
    }; break
    case 'true_false': key = {
      correct_answer: !!extra.correct_answer,
      statements: list(extra.statements).map(statement => !!statement.correct_answer),
      select_target: extra.select_target ?? 'correct',
      choice_scoring: extra.choice_scoring ?? 'partial',
      // Legacy undefined modes still allocate explanation points in naturalMaxScore.
      explanation_mode: extra.explanation_mode ?? null,
      score_answer: extra.score_answer ?? 1,
      score_explanation: extra.score_explanation ?? 1,
    }; break
    case 'fill_blank': key = list(extra.blanks).map(blank => blankDefinition(extra, blank)); break
    case 'ordering': key = identities(list(extra.items)); break
    case 'matching': key = list(question.mcq_options).map(pair => pair.right_text ?? ''); break
    case 'composite': key = list(extra.parts).map(part => ({
      score: typeof part.score === 'number' && part.score > 0 ? part.score : 1,
      correct_answer: part.type === 'true_false' ? !!part.correct_answer : null,
      choices: part.type === 'true_false' ? list(part.choices).map(choice => !!choice.correct_answer) : [],
      select_target: part.type === 'true_false' ? part.select_target ?? 'correct' : null,
      choice_scoring: part.type === 'true_false' ? part.choice_scoring ?? 'partial' : null,
      blanks: part.type === 'fill_blank' ? list(part.blanks).map(blank => blankDefinition(undefined, blank)) : [],
      items: part.type === 'ordering' ? identities(list(part.items)) : [],
      options: part.type === 'mcq' ? list(part.options).map(option => !!option.is_correct) : [],
    })); break
    case 'classify': key = classifyCorrectAnswer(extra); break
    case 'image_label': key = imageLabelCorrectAnswer(extra); break
  }
  return { question_type: question.question_type, shape: answerShape(question), key }
}

/** Question-level display/solution fields and sampling ranges do not re-mark work. */
export function isGradingDefinitionChanged(previous: Question, next: Question): boolean {
  return canonical(gradingDefinition(previous)) !== canonical(gradingDefinition(next))
}

export type RegradableAnswer = Pick<GradableAnswer, 'id' | 'student_answer' | 'math_input_modes'> & {
  correct_answer: string
  random_values: Record<string, number>
  max_score: number
  score: number | null
  is_correct: boolean | null
  score_edited_by?: string | null
  /** Component reviews supersede the legacy whole-question override marker. */
  answer_reviewed_at?: string | null
  answer_max_score?: number | null
  work_max_score?: number | null
  option_order?: number[] | null
  grading_config?: GradingConfig | null
  is_void?: boolean
}

export type RegradedAnswer = {
  id: string
  correct_answer: string
  is_correct: boolean | null
  score: number
  max_score: number
  is_void: boolean
  grading_config: GradingConfig | null
  skipped: boolean
  skip_reason?: 'teacher_override' | 'manual_only' | 'void'
}

function isManualOnly(question: Question): boolean {
  const extra = (question.extra_data ?? {}) as Data
  if (question.question_type === 'essay' || question.question_type === 'file_upload') return true
  if (question.question_type === 'fill_blank') {
    const blanks = list(extra.blanks)
    return blanks.length > 0 && blanks.every(blank => getBlankType(extra, blank as any) === 'text')
  }
  if (question.question_type === 'composite') {
    const parts = list(extra.parts)
    return parts.length > 0 && parts.every(part => part.type === 'fill_blank'
      && (!part.blanks?.[0] || getBlankType(undefined, part.blanks[0]) === 'text'))
  }
  return false
}

function preservedScore(answer: RegradableAnswer, key: string, config: GradingConfig, reason: RegradedAnswer['skip_reason']): RegradedAnswer {
  return {
    id: answer.id, correct_answer: key,
    is_correct: answer.is_correct, score: answer.score ?? 0, max_score: answer.max_score,
    is_void: answer.is_void === true,
    grading_config: config,
    skipped: true, skip_reason: reason,
  }
}

/** Void explicitly removes both the earned points and the question's ceiling. */
export function voidAnswer(answer: RegradableAnswer): RegradedAnswer {
  return {
    id: answer.id, correct_answer: answer.correct_answer,
    is_correct: true, score: 0, max_score: 0, is_void: true,
    grading_config: answer.grading_config ?? null,
    skipped: false,
  }
}

/** Pure: caller owns authorization, locking, persistence and total/streak updates. */
export function regradeAnswer(
  previous: Question,
  next: Question,
  answer: RegradableAnswer,
  options: { preserveTeacherOverrides?: boolean } = {},
): RegradedAnswer {
  assertCompatibleGradingChange(previous, next)
  if (answer.is_void) return { ...voidAnswer(answer), skipped: true, skip_reason: 'void' }

  // evaluatePartsChained historically substitutes zero for an invalid formula.
  // A correction must fail before any score write instead of accepting that zero.
  if (next.question_type === 'written') {
    const scope = { ...answer.random_values }
    const formulas = next.answer_parts?.length
      ? next.answer_parts.map(part => part.formula) : [next.answer_formula]
    for (const [index, formula] of formulas.entries()) {
      const value = evaluateFormula(formula, { ...scope })
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error('เฉลยใหม่คำนวณกับชุดตัวเลขเดิมของนักเรียนไม่ได้ กรุณาตรวจสูตรเฉลย')
      }
      scope[`ans${index}`] = value
    }
  }
  const skeleton = buildQuestionAnswerKeyAtValues(next, answer.random_values ?? {})
  if (next.question_type === 'written') {
    const values: unknown[] = skeleton.correct_answer.startsWith('[')
      ? JSON.parse(skeleton.correct_answer) : [skeleton.correct_answer]
    if (values.some(value => typeof value !== 'string' || value.trim() === '' || !Number.isFinite(Number(value)))) {
      throw new Error('เฉลยใหม่คำนวณกับชุดตัวเลขเดิมของนักเรียนไม่ได้ กรุณาตรวจสูตรเฉลย')
    }
  }
  const config = gradingSnapshot(next)
  const hasParts = answer.answer_max_score != null && answer.work_max_score != null
  const teacherAnswer = hasParts ? !!answer.answer_reviewed_at : !!answer.score_edited_by
  if (options.preserveTeacherOverrides !== false && teacherAnswer) return preservedScore(answer, skeleton.correct_answer, config, 'teacher_override')
  if (isManualOnly(next)) return preservedScore(answer, skeleton.correct_answer, config, 'manual_only')
  const grade = gradeAnswer({
    ...answer, correct_answer: skeleton.correct_answer,
    grading_config: config, questions: config,
  })
  return {
    ...grade, correct_answer: skeleton.correct_answer,
    max_score: answer.max_score, is_void: false, grading_config: config, skipped: false,
  }
}
