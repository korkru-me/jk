import type {
  Question, QuestionType, Difficulty, Variable, LogicRule, AnswerPart, MCQOption,
  TrueFalseConfig, FillBlankConfig, OrderingConfig, RandomQuestionConfig, FileUploadConfig,
} from '@/lib/types'

export const EXPORT_FORMAT = 'korkru.question_export'
export const EXPORT_VERSION = 1

export interface PortableQuestion {
  question_type: QuestionType
  title: string
  question_text: string
  difficulty: Difficulty
  grade_level: string | null
  subject: string | null
  category_name: string | null
  is_random: boolean
  variables: Variable[]
  logic_rules: LogicRule[]
  answer_formula: string
  answer_unit: string | null
  answer_tolerance: number
  answer_parts: AnswerPart[] | null
  mcq_options: MCQOption[] | null
  extra_data: TrueFalseConfig | FillBlankConfig | OrderingConfig | RandomQuestionConfig | FileUploadConfig | Record<string, never>
  solution_text: string | null
  solution_image_urls: string[]
  tags: string[] | null
  image_urls: string[]
  requires_work_image: boolean
}

export interface QuestionExportFile {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exported_at: string
  kind: 'questions' | 'question_set'
  set?: { title: string; description: string | null; tags: string[] }
  questions: PortableQuestion[]
}

type QuestionWithCategoryName = Question & { question_categories?: { name: string } | null }

export function toPortableQuestion(q: QuestionWithCategoryName): PortableQuestion {
  return {
    question_type: q.question_type,
    title: q.title,
    question_text: q.question_text,
    difficulty: q.difficulty,
    grade_level: q.grade_level,
    subject: q.subject,
    category_name: q.question_categories?.name ?? null,
    is_random: q.is_random,
    variables: q.variables,
    logic_rules: q.logic_rules,
    answer_formula: q.answer_formula,
    answer_unit: q.answer_unit,
    answer_tolerance: q.answer_tolerance,
    answer_parts: q.answer_parts,
    mcq_options: q.mcq_options,
    extra_data: q.extra_data,
    solution_text: q.solution_text,
    solution_image_urls: q.solution_image_urls,
    tags: q.tags,
    image_urls: q.image_urls,
    requires_work_image: q.requires_work_image,
  }
}

export function buildExportFile(
  questions: PortableQuestion[],
  set?: { title: string; description: string | null; tags: string[] },
): QuestionExportFile {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    kind: set ? 'question_set' : 'questions',
    ...(set ? { set } : {}),
    questions,
  }
}

export function parseExportFile(raw: string): { data: QuestionExportFile } | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: 'ไฟล์ไม่ใช่ JSON ที่ถูกต้อง' }
  }

  if (
    typeof parsed !== 'object' || parsed === null ||
    (parsed as Record<string, unknown>).format !== EXPORT_FORMAT
  ) {
    return { error: 'ไฟล์นี้ไม่ใช่ไฟล์ส่งออกโจทย์จาก Korkru' }
  }

  const data = parsed as QuestionExportFile
  if (data.version !== EXPORT_VERSION) {
    return { error: `เวอร์ชันไฟล์ (${data.version}) ไม่รองรับ` }
  }
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    return { error: 'ไฟล์นี้ไม่มีโจทย์อยู่ข้างใน' }
  }

  return { data }
}
