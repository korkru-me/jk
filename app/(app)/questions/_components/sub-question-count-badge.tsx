import { subQuestionUnit } from '@/lib/question-parts'

/**
 * "3 ข้อย่อย" — how many things one question actually asks.
 *
 * A row in the คลังโจทย์ shows a title and one line of the stem, which hides
 * the difference between a question with one answer and one with six blanks.
 * The count comes from the server (see fetchSubQuestionCounts in the page), so
 * it is absent, not wrong, when that read fails — the badge then says nothing.
 */
export function SubQuestionCountBadge({
  questionType,
  count,
}: {
  questionType: string
  count?: number
}) {
  if (!count || count < 1) return null
  return (
    <span
      title={`โจทย์ข้อนี้มีคำถามข้างใน ${count} ${subQuestionUnit(questionType)}`}
      className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground"
    >
      {count} {subQuestionUnit(questionType)}
    </span>
  )
}
