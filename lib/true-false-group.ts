import type { CompositeConfig, QuestionType } from './types'

// The "ถูก-ผิดแบบชุด" (grouped true/false) page saves under question_type
// 'composite' — a main problem (question_text) + N sub-questions, each a
// CompositePart of type 'true_false' with `choices` (ก/ข/ค/ง the student
// ticks 1+ of). This is the only way a composite part ever gets `choices`
// (the generic composite-form.tsx has no UI for it), so checking every part
// has non-empty `choices` reliably tells the two apart — no schema/DB change
// needed to route editing/duplicating back to the right dedicated form.
export function isTrueFalseGroupQuestion(question: { question_type: QuestionType; extra_data: unknown }): boolean {
  if (question.question_type !== 'composite') return false
  const parts = (question.extra_data as CompositeConfig | undefined)?.parts
  if (!Array.isArray(parts) || parts.length === 0) return false
  return parts.every(p => p.type === 'true_false' && Array.isArray(p.choices) && p.choices.length > 0)
}

export const TRUE_FALSE_GROUP_ROUTE = 'true-false-group'
