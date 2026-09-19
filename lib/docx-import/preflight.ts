/**
 * What the file turned out to be, checked against what the teacher said it was.
 *
 * Until now a file the reader could make nothing of produced one line — "ไม่พบ
 * ข้อไหนเลย" — which names the symptom and not the cause, and leaves a teacher
 * with a worksheet, a rejection, and no idea which part of it to change. That
 * is the moment this feature is most likely to lose someone: they already have
 * the file, and reformatting blind is worse than typing the โจทย์ in.
 *
 * So every finding here points back at a rule by its `id` — the same rules,
 * in the same order, that the screen showed on the way in. "กฎข้อ 2 ไม่ผ่าน" is
 * only useful next to a rule 2 the teacher can read.
 *
 * Nothing here blocks an import. Whether a โจทย์ may be saved is decided per
 * โจทย์ by `validateForImport`; this is the file-level account of what was
 * found, and its worst verdict is "this file is not in the shape you said".
 */
import type { DraftQuestion, DraftResult } from './draft'
import type { ImportProfile } from './profiles'

export type CheckStatus = 'pass' | 'warn' | 'fail'

export interface PreflightCheck {
  /** The `ImportRule.id` this is about, so the screen can show them together. */
  ruleId: string
  status: CheckStatus
  /** What was actually found, in numbers a teacher can go and look at. */
  detail: string
}

export interface PreflightReport {
  /** False when the file produced no โจทย์ at all — the only blocking state. */
  readable: boolean
  questionCount: number
  /** โจทย์ that need a look before they can be imported. */
  needsAttention: number
  checks: PreflightCheck[]
}

const isMcq = (question: DraftQuestion) => question.type === 'mcq'
const hasKey = (question: DraftQuestion) => question.choices.some(choice => choice.isCorrect)

/** A check is only reported when the profile actually lists that rule. */
function checkFor(profile: ImportProfile, ruleId: string, build: () => PreflightCheck | null): PreflightCheck | null {
  return profile.rules.some(rule => rule.id === ruleId) ? build() : null
}

export function preflight(result: DraftResult, profile: ImportProfile): PreflightReport {
  const { questions } = result
  const checks: PreflightCheck[] = []
  const add = (check: PreflightCheck | null) => { if (check) checks.push(check) }

  add(checkFor(profile, 'numbering', () => {
    if (questions.length === 0) {
      return {
        ruleId: 'numbering',
        status: 'fail',
        detail: 'ไม่พบเลขข้อที่ Word สร้างให้ จึงแยกไม่ออกว่าข้อไหนคือข้อไหน',
      }
    }
    if (result.numbering === 'typed') {
      return {
        ruleId: 'numbering',
        status: 'warn',
        detail: `อ่านได้ ${questions.length} ข้อ จากเลขที่พิมพ์เอง — ใช้ได้ แต่ถ้าแทรกข้อกลางไฟล์ทีหลังเลขจะเพี้ยน`,
      }
    }
    return { ruleId: 'numbering', status: 'pass', detail: `อ่านได้ ${questions.length} ข้อ` }
  }))

  // Only meaningful where the teacher said the file holds ตัวเลือก. On the
  // automatic reader a โจทย์ without them is an อัตนัย, not a mistake.
  const expectsChoices = profile.type === 'mcq'
  add(checkFor(profile, 'choices', () => {
    if (questions.length === 0) return null
    const without = questions.filter(question => !isMcq(question))
    if (without.length === 0) {
      return { ruleId: 'choices', status: 'pass', detail: `พบตัวเลือกครบทั้ง ${questions.length} ข้อ` }
    }
    const numbers = without.map(question => question.number).join(', ')
    return expectsChoices
      ? {
        ruleId: 'choices',
        status: 'fail',
        detail: `ข้อ ${numbers} ไม่พบตัวเลือก — ตรวจว่าขึ้นต้นด้วย 1) 2) 3) 4) หรือเปลี่ยนชนิดของข้อนั้นบนการ์ด`,
      }
      : {
        ruleId: 'choices',
        status: 'pass',
        detail: `ปรนัย ${questions.length - without.length} ข้อ · ข้อเขียน ${without.length} ข้อ`,
      }
  }))

  add(checkFor(profile, 'answer-mark', () => {
    const mcq = questions.filter(isMcq)
    if (mcq.length === 0) return null
    const unmarked = mcq.filter(question => !hasKey(question))
    if (unmarked.length === 0) {
      return { ruleId: 'answer-mark', status: 'pass', detail: `พบเฉลยครบทั้ง ${mcq.length} ข้อ` }
    }
    return {
      ruleId: 'answer-mark',
      status: 'warn',
      detail: `ข้อ ${unmarked.map(question => question.number).join(', ')} ไม่พบเครื่องหมายเฉลย — ติ๊กข้อที่ถูกบนการ์ดได้เลย`,
    }
  }))

  // A โจทย์ that came back as `essay` is one no เฉลย was found for: either the
  // bracket is missing or it held something that is not an answer.
  add(checkFor(profile, 'answer-position', () => {
    if (questions.length === 0) return null
    const read = questions.filter(question => question.type === 'written')
    const unread = questions.filter(question => question.type === 'essay')

    if (unread.length === 0) {
      return { ruleId: 'answer-position', status: 'pass', detail: `อ่านเฉลยได้ครบทั้ง ${read.length} ข้อ` }
    }
    const numbers = unread.map(question => question.number).join(', ')
    return profile.type === 'written'
      ? {
        ruleId: 'answer-position',
        status: 'warn',
        detail: `ข้อ ${numbers} ไม่พบเฉลย — ตรวจว่าทำเครื่องหมายไว้ท้ายข้อแล้ว หรือปล่อยให้เข้ามาเป็นบรรยายให้ครูตรวจเอง`,
      }
      : {
        ruleId: 'answer-position',
        status: 'pass',
        detail: `อ่านเฉลยได้ ${read.length} ข้อ · อีก ${unread.length} ข้อเป็นข้อเขียนที่ครูตรวจเอง`,
      }
  }))

  add(checkFor(profile, 'blank-answer', () => {
    if (questions.length === 0) return null
    const without = questions.filter(question => question.blanks.length === 0)
    const total = questions.reduce((sum, question) => sum + question.blanks.length, 0)

    if (without.length === 0) {
      return { ruleId: 'blank-answer', status: 'pass', detail: `พบช่องเติมคำรวม ${total} ช่อง จาก ${questions.length} ข้อ` }
    }
    return {
      ruleId: 'blank-answer',
      status: 'fail',
      detail: `ข้อ ${without.map(question => question.number).join(', ')} ไม่พบคำที่ทำเครื่องหมายไว้ — ข้อนั้นยังไม่มีช่องให้นักเรียนกรอก`,
    }
  }))

  add(checkFor(profile, 'statements', () => {
    if (questions.length === 0) return null
    const without = questions.filter(question => question.statements.length === 0)
    const total = questions.reduce((sum, question) => sum + question.statements.length, 0)

    if (without.length === 0) {
      return { ruleId: 'statements', status: 'pass', detail: `พบข้อความให้ตัดสินรวม ${total} ข้อความ จาก ${questions.length} ข้อ` }
    }
    return {
      ruleId: 'statements',
      status: 'fail',
      detail: `ข้อ ${without.map(question => question.number).join(', ')} ไม่พบข้อความย่อย — ตรวจว่าเขียนเป็น 8.1 8.2 ใต้ข้อหลัก หรือใช้รายการย่อยของ Word`,
    }
  }))

  add(checkFor(profile, 'tick', () => {
    const marked = questions.flatMap(question => question.statements)
    if (marked.length === 0) return null
    const unmarked = marked.filter(statement => statement.isTrue === null)
    if (unmarked.length === 0) {
      return { ruleId: 'tick', status: 'pass', detail: `อ่านเฉลย ✓/x ได้ครบทั้ง ${marked.length} ข้อความ` }
    }
    return {
      ruleId: 'tick',
      status: 'warn',
      detail: `มี ${unmarked.length} ข้อความที่ไม่พบ ✓ หรือ x — ระบบจะถือว่าผิด แก้ได้บนการ์ด`,
    }
  }))

  add(checkFor(profile, 'equation', () => {
    const withMath = questions.filter(question =>
      question.warnings.some(warning => warning.code === 'equation'))
    if (withMath.length === 0) return null
    return {
      ruleId: 'equation',
      status: 'warn',
      detail: `ข้อ ${withMath.map(question => question.number).join(', ')} มีสมการที่แปลงมา ควรเปิดดูก่อนนำเข้า`,
    }
  }))

  // Matches the card-level rule: an mcq with no key cannot be imported, and
  // anything else the teacher is only asked to look at.
  const needsAttention = questions.filter(question =>
    (isMcq(question) && !hasKey(question)) || question.warnings.length > 0).length

  return {
    readable: questions.length > 0,
    questionCount: questions.length,
    needsAttention,
    checks,
  }
}
