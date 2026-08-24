/**
 * How many gradable parts one question actually holds — its "ข้อย่อย".
 *
 * A card in the คลังโจทย์ shows one title and one line of the stem, which says
 * nothing about whether the question asks one thing or eight: a เติมคำ with six
 * blanks, a ถูก-ผิด with five statements and a plain ปรนัย all look the same in
 * a list. The count here is the same structure `naturalMaxScore` in
 * lib/assignment-attempt.ts turns into points, so what a card claims and what
 * a งาน scores stay the same number — that is the point of keeping it in one
 * place rather than counting `blanks.length` at each call site.
 *
 * The difference is weighting: `naturalMaxScore` honours the per-statement and
 * per-part scores a teacher set (a ถูก-ผิด worth 2 คะแนน per statement), while
 * this counts the parts themselves. They agree wherever the teacher left the
 * weights alone, which is the usual case.
 */

import type { Question } from '@/lib/types'

/** The columns a part count is read from — everything else about the row is irrelevant. */
export type CountableQuestion = Pick<Question, 'question_type'> & {
  extra_data?: unknown
  answer_parts?: unknown[] | null
  /** Matching pairs live here rather than in `extra_data` (see MatchingPair). */
  mcq_options?: unknown[] | null
}

const len = (value: unknown): number => (Array.isArray(value) ? value.length : 0)

/**
 * The number of ข้อย่อย in a question. Never below 1 — a question always asks
 * at least one thing, even when its parts array is empty or missing.
 *
 * `groupPartCount` is for the parent of a โจทย์หลายขั้นตอน (order_in_group = 0),
 * whose parts are sibling rows rather than fields of its own: pass how many
 * sub-questions the group holds and it wins over the row's own shape, which is
 * only ever an empty written stem.
 */
export function subQuestionCount(q: CountableQuestion, groupPartCount?: number): number {
  if (groupPartCount != null && groupPartCount > 0) return groupPartCount

  const extra = (q.extra_data ?? {}) as Record<string, unknown>

  switch (q.question_type) {
    // The stem itself is judged alongside the extra statements (ก plus ข, ค, …),
    // so a question with two extra statements asks three things.
    case 'true_false': {
      const statements = len(extra.statements)
      return statements > 0 ? statements + 1 : 1
    }
    case 'fill_blank':
      return len(extra.blanks) || 1
    case 'ordering':
      return len(extra.items) || 1
    case 'matching':
      return len(q.mcq_options) || 1
    case 'composite':
      return len(extra.parts) || 1
    // ปรนัย choices and ไฟล์งาน attachments are not questions of their own.
    case 'mcq':
    case 'file_upload':
      return 1
    // อัตนัย/บรรยาย: one answer unless the teacher split it into ก, ข, ค.
    default:
      return len(q.answer_parts) || 1
  }
}

/**
 * What to call those parts on screen.
 *
 * "ข้อย่อย" is right for a question that asks several things in turn, but a
 * จับคู่ has คู่ and a เติมคำ has ช่อง — calling those ข้อย่อย reads as if the
 * student faces six separate questions. The number is the same either way.
 */
export function subQuestionUnit(questionType: string): string {
  switch (questionType) {
    case 'fill_blank':
      return 'ช่องเติม'
    case 'matching':
      return 'คู่จับคู่'
    case 'ordering':
      return 'รายการเรียง'
    default:
      return 'ข้อย่อย'
  }
}

/** The badge text a list row shows, e.g. "3 ข้อย่อย" or "6 ช่องเติม". */
export function subQuestionLabel(q: CountableQuestion, groupPartCount?: number): string {
  const count = subQuestionCount(q, groupPartCount)
  // A group's parts are whole sub-questions whatever type its rows happen to be.
  const unit = groupPartCount != null && groupPartCount > 0 ? 'ข้อย่อย' : subQuestionUnit(q.question_type)
  return `${count} ${unit}`
}
