import type { Question, QuestionType } from '@/lib/types'

const DUPLICATE_SEED_KEY = 'korkru:question-duplicate-seed'

export const NEW_QUESTION_ROUTE_BY_TYPE: Record<QuestionType, string> = {
  mcq: 'mcq',
  true_false: 'true-false',
  fill_blank: 'fill-blank',
  ordering: 'ordering',
  matching: 'matching',
  essay: 'essay',
  written: 'random',
  file_upload: 'file-upload',
  composite: 'composite',
}

export function storeDuplicateSeed(question: Question) {
  const seed: Question = {
    ...question,
    id: '',
    created_by: '',
    group_id: null,
    parent_question_id: null,
    order_in_group: null,
    created_at: '',
    updated_at: '',
    rejected_reason: null,
    title: `(สำเนา) ${question.title}`,
  }

  sessionStorage.setItem(DUPLICATE_SEED_KEY, JSON.stringify(seed))
}

export function readDuplicateSeed(expectedType: QuestionType): Question | null {
  const raw = sessionStorage.getItem(DUPLICATE_SEED_KEY)
  if (!raw) return null
  sessionStorage.removeItem(DUPLICATE_SEED_KEY)

  try {
    const seed = JSON.parse(raw) as Question
    if (seed.question_type !== expectedType) return null
    return seed
  } catch {
    return null
  }
}
