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

  add(checkFor(profile, 'label-box', () => {
    if (questions.length === 0) return null
    const noPicture = questions.filter(question => !question.imageLabel?.relId)
    if (noPicture.length > 0) {
      return {
        ruleId: 'label-box',
        status: 'fail',
        detail: `ข้อ ${noPicture.map(question => question.number).join(', ')} ไม่พบรูป — วางรูปแบบอยู่ในบรรทัด (In Line with Text) ไม่ใช่รูปลอย`,
      }
    }

    const without = questions.filter(question => (question.imageLabel?.blanks.length ?? 0) === 0)
    const total = questions.reduce((sum, question) => sum + (question.imageLabel?.blanks.length ?? 0), 0)
    if (without.length === 0) {
      return { ruleId: 'label-box', status: 'pass', detail: `พบช่องเติมคำรวม ${total} ช่อง จาก ${questions.length} ข้อ` }
    }
    return {
      ruleId: 'label-box',
      status: 'fail',
      detail: `ข้อ ${without.map(question => question.number).join(', ')} ไม่พบกล่องข้อความบนรูป — ช่องให้เติมคำต้องเป็นกล่องข้อความ (Insert → Text Box)`,
    }
  }))

  // Not a formatting mistake: the copy handed to students has every box empty
  // on purpose, and the teacher fills the เฉลย in on the web. Reported so they
  // know how much is still theirs to do.
  add(checkFor(profile, 'label-answer', () => {
    const withBlanks = questions.filter(question => (question.imageLabel?.blanks.length ?? 0) > 0)
    if (withBlanks.length === 0) return null
    const short = withBlanks.filter(question =>
      question.imageLabel!.blanks.some(blank => !blank.answer))

    if (short.length === 0) {
      const total = withBlanks.reduce((sum, question) => sum + question.imageLabel!.blanks.length, 0)
      return { ruleId: 'label-answer', status: 'pass', detail: `อ่านเฉลยได้ครบทั้ง ${total} ช่อง` }
    }
    return {
      ruleId: 'label-answer',
      status: 'warn',
      detail: `ข้อ ${short.map(question => question.number).join(', ')} มีช่องที่ยังไม่มีเฉลย — พิมพ์เฉลยตอนกด "แก้ไข" ได้`,
    }
  }))

  // Always said, and never a pass: no Word file states where a point lands on
  // the picture. It is on the report so that "ทุกข้อต้องเปิดแก้ไขก่อน" is
  // something the teacher reads before uploading, not after.
  add(checkFor(profile, 'label-place', () => {
    if (questions.length === 0) return null
    return {
      ruleId: 'label-place',
      status: 'warn',
      detail: `ต้องกด "แก้ไข" แล้วลากจุดไปวางบนรูปให้ครบทั้ง ${questions.length} ข้อก่อนนำเข้า — ไฟล์ Word ไม่มีข้อมูลตำแหน่งจุด`,
    }
  }))

  add(checkFor(profile, 'match-table', () => {
    if (questions.length === 0) return null
    const without = questions.filter(question => (question.matching?.pairs.length ?? 0) < 2)
    const total = questions.reduce((sum, question) => sum + (question.matching?.pairs.length ?? 0), 0)

    if (without.length === 0) {
      return { ruleId: 'match-table', status: 'pass', detail: `พบคู่จับคู่รวม ${total} คู่ จาก ${questions.length} ข้อ` }
    }
    return {
      ruleId: 'match-table',
      status: 'fail',
      detail: `ข้อ ${without.map(question => question.number).join(', ')} ไม่พบตาราง 2 คอลัมน์ — ตรวจว่าใช้ตารางของ Word ไม่ใช่การกด Tab ให้ตรงคอลัมน์`,
    }
  }))

  // Not a formatting mistake — a worksheet handed to students has most of its
  // blanks empty on purpose. It is reported so the teacher knows how much of
  // the pairing is still theirs to do, not to tell them off.
  add(checkFor(profile, 'match-key', () => {
    const withPairs = questions.filter(question => (question.matching?.pairs.length ?? 0) > 0)
    if (withPairs.length === 0) return null
    const short = withPairs.filter(question =>
      question.matching!.keyedCount < question.matching!.pairs.length)

    if (short.length === 0) {
      const total = withPairs.reduce((sum, question) => sum + question.matching!.keyedCount, 0)
      return { ruleId: 'match-key', status: 'pass', detail: `อ่านเฉลยได้ครบทั้ง ${total} คู่` }
    }
    return {
      ruleId: 'match-key',
      status: 'warn',
      detail: `ข้อ ${short.map(question => question.number).join(', ')} ยังจับคู่ไม่ครบ — นำเข้าได้หลังจับคู่บนการ์ดหรือในฟอร์มแล้ว`,
    }
  }))

  add(checkFor(profile, 'order-items', () => {
    if (questions.length === 0) return null
    const without = questions.filter(question => question.orderItems.length < 2)
    const total = questions.reduce((sum, question) => sum + question.orderItems.length, 0)

    if (without.length === 0) {
      return { ruleId: 'order-items', status: 'pass', detail: `พบรายการที่ต้องเรียงรวม ${total} รายการ จาก ${questions.length} ข้อ` }
    }
    return {
      ruleId: 'order-items',
      status: 'fail',
      detail: `ข้อ ${without.map(question => question.number).join(', ')} ไม่พบรายการที่ต้องเรียง — ตรวจว่าพิมพ์บรรทัดละรายการ ขึ้นต้นด้วย 1. 2. 3. 4.`,
    }
  }))

  // Only the ข้อ that offered orders to pick between can be missing a key. A
  // worksheet that lists its steps in the right order has already answered.
  add(checkFor(profile, 'order-key', () => {
    const offered = questions.filter(question => question.orderChoices.length > 0)
    if (offered.length === 0) {
      if (questions.length === 0) return null
      return {
        ruleId: 'order-key',
        status: 'pass',
        detail: `ไม่มีข้อไหนมีตัวเลือกลำดับ — ถือว่าลำดับที่พิมพ์ในไฟล์คือลำดับที่ถูก ทั้ง ${questions.length} ข้อ`,
      }
    }
    const unmarked = offered.filter(question => !question.orderChoices.some(choice => choice.isCorrect))
    if (unmarked.length === 0) {
      return { ruleId: 'order-key', status: 'pass', detail: `อ่านลำดับที่ถูกได้ครบทั้ง ${offered.length} ข้อ` }
    }
    return {
      ruleId: 'order-key',
      status: 'warn',
      detail: `ข้อ ${unmarked.map(question => question.number).join(', ')} ไม่พบเครื่องหมายเฉลย — เลือกลำดับที่ถูกบนการ์ดได้เลย`,
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

  // Matches the card-level rule: an mcq with no key, and a เรียงลำดับ ข้อ whose
  // paper offered orders without marking one, cannot be imported. Anything
  // else the teacher is only asked to look at.
  const needsAttention = questions.filter(question =>
    (isMcq(question) && !hasKey(question))
    || (question.orderChoices.length > 0 && !question.orderChoices.some(choice => choice.isCorrect))
    || (question.matching ? question.matching.keyedCount < question.matching.pairs.length : false)
    || question.warnings.length > 0).length

  return {
    readable: questions.length > 0,
    questionCount: questions.length,
    needsAttention,
    checks,
  }
}
