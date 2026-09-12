/**
 * What a list row should say a งาน is made of.
 *
 * Three different answers, and getting them mixed up is how a list lies: a
 * streak งาน has no fixed number of ข้อ at all, a drawn งาน hands out fewer
 * than its คลัง holds, and everything else is simply its own length. Shared so
 * the assignment list, the classroom tab, and the dashboard cannot disagree
 * about the same row.
 */
export function assignmentSizeLabel(a: {
  question_ids: string[]
  random_question_count?: number | null
  completion_rule?: string | null
  streak_target?: number | null
}): string {
  if (a.completion_rule === 'streak' && a.streak_target) {
    return `ถูกติดกัน ${a.streak_target} ข้อ · คลัง ${a.question_ids.length}`
  }
  if (a.random_question_count) {
    return `${a.random_question_count} ข้อ (สุ่มจาก ${a.question_ids.length})`
  }
  return `${a.question_ids.length} ข้อ`
}
