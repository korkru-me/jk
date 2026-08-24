import { naturalMaxScore } from '@/lib/assignment-attempt'
import type { Question, EducationResearchSourceType } from '@/lib/types'
import type { QuestionSetSection } from '@/lib/question-set-sections'

export type ResearchPublicationMode = 'draft' | 'immediate' | 'scheduled'
export type ResearchQuestionSelectionMode = 'set' | 'sections' | 'individual'

export interface ResearchQuestionOption {
  id: string
  title: string
  question_text: string
  question_type: Question['question_type']
  difficulty: Question['difficulty']
  tags: string[] | null
  max_score: number
}

export interface ResearchQuestionSetOption {
  id: string
  title: string
  description: string | null
  question_ids: string[]
  sections: QuestionSetSection[]
}

export interface ResearchClassroomOption {
  id: string
  name: string
  description: string | null
  student_count: number
}

export interface ResearchOnlineMeasurementDraft {
  source_type: 'korkru_exam'
  question_ids: string[]
  selection_mode: ResearchQuestionSelectionMode
  source_set_id: string | null
  source_sections: QuestionSetSection[]
  duration_minutes: number
  publish_mode: ResearchPublicationMode
  start_at: string | null
  end_at: string | null
  access_code: string | null
  reuse_pretest_snapshot?: boolean
}

export interface ResearchOfflineMeasurementDraft {
  source_type: Exclude<EducationResearchSourceType, 'korkru_exam'>
  max_score: number
}

export type ResearchMeasurementDraft =
  | ResearchOnlineMeasurementDraft
  | ResearchOfflineMeasurementDraft

export interface CreateEducationResearchProjectInput {
  title: string
  topic: string
  classroom_id: string
  passing_threshold_percent: number
  pretest: ResearchMeasurementDraft
  posttest: ResearchMeasurementDraft
}

export function researchQuestionMaxScore(question: Pick<
  Question,
  'question_type' | 'extra_data' | 'answer_parts' | 'mcq_options'
>): number {
  return naturalMaxScore(
    question.question_type,
    question.extra_data,
    question.answer_parts,
    question.question_type === 'matching' ? (question.mcq_options?.length ?? 0) : 0,
  )
}

export function selectedResearchMaxScore(
  questionIds: readonly string[],
  questions: readonly ResearchQuestionOption[],
): number {
  const byId = new Map(questions.map(question => [question.id, question.max_score]))
  return questionIds.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0)
}

export function normalizeResearchAccessCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? ''
  return normalized || null
}

export function isValidResearchAccessCode(value: string | null | undefined): boolean {
  const normalized = normalizeResearchAccessCode(value)
  return normalized === null || /^[A-Z0-9-]{4,12}$/.test(normalized)
}

