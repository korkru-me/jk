import type { SafeExamAnswer } from '@/lib/exam-safe'
import type { PracticeAnswerResult } from '@/lib/actions/practice-answers'

export interface PracticeRunQuestion {
  question: SafeExamAnswer
  variantReceipt: string
  changesOnRefresh: boolean
  calculatorEnabled: boolean
  scratchpadEnabled: boolean
}
export type PracticeRunQuestionResult = { ok: true; data: PracticeRunQuestion } | { ok: false; error: string }
export type PracticeRunQuestionLoader = (libraryId: string, questionId: string) => Promise<PracticeRunQuestionResult>
export type PracticeRunAnswerAction = (input: unknown) => Promise<PracticeAnswerResult>
export const PRACTICE_FLAG_DESCRIPTION = 'ปักธงข้อที่ต้องการกลับมาทบทวนระหว่างฝึกทำ'
