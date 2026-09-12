import { SAMPLE_QUESTIONS } from '@/app/(app)/questions/new/_data/sample-questions'
import { buildAssignmentAttempt } from '@/lib/assignment-attempt'
import { toSafeExamAnswer, type SafeExamAnswer } from '@/lib/exam-safe'
import type {
  MCQOption,
  MatchingPair,
  Question,
  QuestionType,
} from '@/lib/types'
import type { QuestionSetSection } from '@/lib/question-set-sections'

/**
 * Synthetic cases for the physical-device exam-screen checklist.
 *
 * This module deliberately has no Supabase or auth imports. The lab route uses
 * the real ExamClient in previewMode, while every record below exists only in
 * memory for the lifetime of the page request.
 */
export const EXAM_SCREEN_QA_CASES = [
  { slug: 'written', source: 'written', label: 'คำตอบตัวเลขหลายข้อย่อย' },
  { slug: 'mcq', source: 'mcq', label: 'ปรนัยพร้อมรูปประกอบ' },
  { slug: 'true-false-judge', source: 'true_false', label: 'ถูก–ผิดทีละข้อความ' },
  { slug: 'true-false-select', source: 'true_false', label: 'เลือกข้อความที่ไม่ถูกต้อง' },
  { slug: 'fill-blank', source: 'fill_blank', label: 'เติมคำและรายการเลือก' },
  { slug: 'matching-slots', source: 'matching', label: 'จับคู่แบบช่อง' },
  { slug: 'matching-lines', source: 'matching', label: 'จับคู่แบบลากเส้น' },
  { slug: 'ordering', source: 'ordering', label: 'เรียงลำดับ' },
  { slug: 'composite', source: 'composite', label: 'โจทย์หลายรูปแบบในข้อเดียว' },
  { slug: 'essay', source: 'essay', label: 'คำตอบยาวภาษาไทย' },
  { slug: 'file-upload', source: 'file_upload', label: 'แนบรูปหรือ PDF' },
] as const satisfies ReadonlyArray<{
  slug: string
  source: QuestionType
  label: string
}>

const QA_DIAGRAM = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="240" viewBox="0 0 640 240">
    <rect width="640" height="240" rx="24" fill="#eff6ff"/>
    <path d="M80 190H580M80 190V35" stroke="#334155" stroke-width="5"/>
    <path d="M95 178L230 132L365 88L540 48" fill="none" stroke="#2563eb" stroke-width="8" stroke-linecap="round"/>
    <circle cx="95" cy="178" r="8" fill="#ea580c"/><circle cx="365" cy="88" r="8" fill="#ea580c"/><circle cx="540" cy="48" r="8" fill="#ea580c"/>
    <text x="260" y="225" font-family="sans-serif" font-size="24" fill="#334155">เวลา</text>
    <text x="14" y="28" font-family="sans-serif" font-size="24" fill="#334155">ความเร็ว</text>
  </svg>
`)}`

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z'

function extraDataFor(
  source: QuestionType,
  slug: (typeof EXAM_SCREEN_QA_CASES)[number]['slug'],
) {
  const props = SAMPLE_QUESTIONS[source].props

  if (source === 'true_false') {
    return slug === 'true-false-select'
      ? {
          ...props.trueFalseConfig!,
          answer_mode: 'select_matching' as const,
          select_target: 'wrong' as const,
        }
      : props.trueFalseConfig!
  }
  if (source === 'fill_blank') return props.fillBlankConfig!
  if (source === 'ordering') return props.orderingConfig!
  if (source === 'matching') {
    return slug === 'matching-lines'
      ? { answer_mode: 'lines' as const }
      : { answer_mode: 'slots' as const }
  }
  if (source === 'file_upload') {
    return { attachment_urls: props.attachmentUrls ?? [] }
  }
  if (source === 'composite') return props.compositeConfig!
  return {}
}

/** Build the trusted, server-side-looking questions used to seed the lab. */
export function buildExamScreenQaQuestions(): Question[] {
  return EXAM_SCREEN_QA_CASES.map((testCase, index) => {
    const sample = SAMPLE_QUESTIONS[testCase.source]
    const props = sample.props
    const stableVariables = props.variables.map(variable => ({
      ...variable,
      // Repeatable values make screenshots comparable across device widths.
      max: variable.min,
    }))

    const options = testCase.source === 'matching'
      ? (props.matchingPairs ?? []) as unknown as MCQOption[]
      : props.mcqOptions ?? null

    return {
      id: `qa-question-${testCase.slug}`,
      created_by: 'qa-synthetic-teacher',
      org_id: null,
      team_edit_allowed: false,
      is_research_snapshot: false,
      research_snapshot_project_id: null,
      research_snapshot_source_id: null,
      category_id: 'qa-synthetic-category',
      grade_level: 'มัธยมศึกษา',
      subject: 'วิทยาศาสตร์',
      title: `${index + 1}. ${testCase.label}`,
      question_text: props.questionText,
      question_type: testCase.source,
      difficulty: 'medium',
      visibility: 'private',
      is_random: props.isRandom,
      variables: stableVariables,
      logic_rules: [],
      answer_formula: props.answerParts[0]?.formula ?? '',
      answer_unit: props.answerParts[0]?.unit ?? null,
      answer_tolerance: props.answerTolerance ?? 0.01,
      answer_parts: props.answerParts.length > 0 ? props.answerParts : null,
      mcq_options: options,
      solution_text: 'ข้อมูลจำลองสำหรับตรวจหน้าจอเท่านั้น',
      solution_image_urls: [],
      tags: ['qa-synthetic'],
      rejected_reason: null,
      image_urls: testCase.source === 'mcq' ? [QA_DIAGRAM] : [],
      requires_work_image: testCase.source === 'written',
      extra_data: extraDataFor(testCase.source, testCase.slug),
      parent_question_id: null,
      group_id: null,
      order_in_group: null,
      content_fingerprint: null,
      search_text: '',
      tag_count: 1,
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    }
  })
}

export type ExamScreenQaAnswer = SafeExamAnswer & {
  correct_answer: string
  max_score: number
  questions: SafeExamAnswer['questions'] & {
    answer_tolerance: number
    solution_text: string | null
    solution_image_urls: string[]
  }
}

export interface ExamScreenQaFixture {
  answers: ExamScreenQaAnswer[]
  sections: QuestionSetSection[]
}

export function buildExamScreenQaFixture(): ExamScreenQaFixture {
  const questions = buildExamScreenQaQuestions()
  const questionIds = questions.map(question => question.id)
  const skeletons = buildAssignmentAttempt({
    question_ids: questionIds,
    shuffle_questions: false,
    shuffle_options: false,
    question_points: null,
    random_question_count: null,
  }, questions)
  const questionsById = new Map(questions.map(question => [question.id, question]))

  const answers = skeletons.map((skeleton): ExamScreenQaAnswer => {
    const question = questionsById.get(skeleton.question_id)!
    const rawOptions = question.mcq_options ?? []
    const optionOrder = question.question_type === 'matching'
      ? rawOptions.map((_, index) => index).reverse()
      : skeleton.option_order

    const safe = toSafeExamAnswer({
      id: `qa-answer-${question.id}`,
      question_id: question.id,
      random_values: skeleton.random_values,
      student_answer: null,
      work_images: [],
      math_input_modes: {},
      option_order: optionOrder,
      questions: question,
    }, () => 0.37)

    if (!safe) throw new Error(`QA question ${question.id} could not be sanitized`)

    return {
      ...safe,
      correct_answer: skeleton.correct_answer,
      max_score: skeleton.max_score,
      questions: {
        ...safe.questions,
        answer_tolerance: question.answer_tolerance,
        solution_text: question.solution_text,
        solution_image_urls: question.solution_image_urls,
      },
    }
  })

  return {
    answers,
    sections: [
      { id: 'qa-section-input', title: 'การตอบพื้นฐาน', question_ids: questionIds.slice(0, 5) },
      { id: 'qa-section-touch', title: 'การลากและจัดลำดับ', question_ids: questionIds.slice(5, 9) },
      { id: 'qa-section-long', title: 'คำตอบยาวและไฟล์', question_ids: questionIds.slice(9) },
    ],
  }
}

/** Raw pair helper used only by fixture-invariant tests. */
export function matchingPairs(question: Question): MatchingPair[] {
  return question.question_type === 'matching'
    ? (question.mcq_options ?? []) as unknown as MatchingPair[]
    : []
}
