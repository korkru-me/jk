import { getBlankType, isBlankCorrect } from '@/lib/fill-blank'
import { evaluateStudentAnswer } from '@/lib/math/evaluator'
import { gradeValue } from '@/lib/assignment-attempt'
import { partLabels, type PartLabelStyle } from '@/lib/part-labels'
import type { AnswerPart, FillBlankItem } from '@/lib/types'

/**
 * What one ข้อ of a แบบฝึกหัด looks like right after the student presses
 * "ตรวจคำตอบข้อนี้", built entirely on the server.
 *
 * The exam page never receives an answer key — `toSafeExamAnswer` strips it
 * before the questions are sent, and RLS keeps `submission_answers` unreadable
 * from the browser while the attempt is in progress. So this module turns the
 * frozen `correct_answer` into finished display rows instead of shipping the
 * key down for the client to compare: the server decides exactly what is
 * revealed, and a เฉลย the teacher chose to withhold is never in the response
 * at all rather than merely hidden by CSS.
 *
 * It also keeps mathjs off the exam page. Deciding whether "9+1" answers 10
 * needs the evaluator (~640 KB), which the exam bundle deliberately does not
 * carry — see the import comment at the top of components/exam/exam-client.tsx.
 *
 * Pure and side-effect free, like gradeAnswer, which it always runs alongside:
 * gradeAnswer owns the verdict and the score, this owns how they read.
 */

/** One line of the ตรวจแล้ว panel — a whole ข้อ, one ข้อย่อย, or one ช่องกรอก. */
export interface FeedbackRow {
  /** "ก", "ช่อง 2", … — omitted when the ข้อ has only one line. */
  label?: string
  /** What the student put in, already formatted for reading. */
  student: string
  /** The เฉลย. Absent when the teacher withheld it, or when the ข้อ has none
   *  to show (an ordering answer is a sequence, not a value). */
  correct?: string
  unit?: string
  status: 'correct' | 'wrong' | 'pending'
}

/** One option of a ปรนัย question, as it should be coloured after checking. */
export interface FeedbackChoice {
  label: string
  text: string
  imageUrl?: string
  picked: boolean
  /** Only ever true when the เฉลย is being revealed. */
  correct: boolean
}

export interface AnswerFeedback {
  /** `pending` = auto-grading cannot decide; a teacher still has to read it. */
  verdict: 'correct' | 'partial' | 'wrong' | 'pending'
  score: number
  maxScore: number
  /** Whether this response actually carries the เฉลย. */
  revealed: boolean
  rows: FeedbackRow[]
  choices?: FeedbackChoice[]
  solutionText?: string | null
  solutionImageUrls?: string[]
  /** Shown above the rows when the student needs to know why there is no
   *  verdict, e.g. a ช่องกรอก their teacher marks by hand. */
  note?: string
}

export interface FeedbackQuestion {
  question_type: string
  answer_unit: string | null
  answer_parts: AnswerPart[] | null
  answer_tolerance: number | null
  extra_data: any
  /** ปรนัย: the options **in the order this student saw them**, each carrying
   *  its `index` in the question's own list — the position an MCQ answer is
   *  recorded as. Both callers already hold them that way (the exam route
   *  through toSafeExamAnswer, a teacher preview through its own reorder), so
   *  the shuffle is never undone and re-applied here.
   *  จับคู่: the pairs in authored order instead; only the right-hand column
   *  is ever shuffled, so pair i still lines up with answer i. */
  mcq_options: Array<{
    text?: string
    image_url?: string
    index?: number
    left_text?: string
  }> | null
  solution_text: string | null
  solution_image_urls: string[] | null
}

export interface FeedbackInput {
  correct_answer: string
  student_answer: string | null
  question: FeedbackQuestion
  /** gradeAnswer's verdict for this same row — never recomputed here, so the
   *  panel can never disagree with the score that gets banked. */
  isCorrect: boolean | null
  score: number
  maxScore: number
  /** `instant_check_answer_key`. False shows ถูก/ผิด and nothing else. */
  revealAnswerKey: boolean
}

const CHOICE_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ']

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed == null ? fallback : (parsed as T)
  } catch {
    return fallback
  }
}

/** Same readable rounding the results page uses, so one เฉลย reads the same
 *  in both places. */
function formatNumber(value: string): string {
  const n = parseFloat(value)
  if (isNaN(n)) return value
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(3)
  return parseFloat(n.toPrecision(4)).toString()
}

function blank(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? '—' : trimmed
}

/**
 * A verdict for the whole ข้อ, derived from the banked score rather than from
 * a second comparison. `partial` exists so a ข้อ worth several marks does not
 * read as a flat "ผิด" when the student got most of it — the reason to check
 * one ข้อ at a time is to see exactly which part went wrong.
 */
function toVerdict(isCorrect: boolean | null, score: number, maxScore: number): AnswerFeedback['verdict'] {
  if (isCorrect === null) return 'pending'
  if (isCorrect) return 'correct'
  return score > 0 && score < maxScore ? 'partial' : 'wrong'
}

function rowStatus(correct: boolean): FeedbackRow['status'] {
  return correct ? 'correct' : 'wrong'
}

/**
 * Turns one graded answer into the panel the student reads.
 *
 * Every branch mirrors the corresponding branch of `gradeAnswer` — the frozen
 * `correct_answer` prefixes (TF:, FILL:, COMP:, MCQ:, MATCH:, ORDER:, a JSON
 * array, or a bare value) are the same discriminator there. When the two ever
 * need changing, change them together: a panel that disagrees with the score
 * is worse than no panel.
 */
export function buildAnswerFeedback(input: FeedbackInput): AnswerFeedback {
  const { question, revealAnswerKey } = input
  const correctAns = input.correct_answer ?? ''
  const studentAns = input.student_answer ?? ''

  const base = {
    verdict: toVerdict(input.isCorrect, input.score, input.maxScore),
    score: input.score,
    maxScore: input.maxScore,
    revealed: revealAnswerKey,
    ...(revealAnswerKey
      ? {
          solutionText: question.solution_text,
          solutionImageUrls: question.solution_image_urls ?? [],
        }
      : {}),
  }

  const reveal = (value: string) => (revealAnswerKey ? { correct: value } : {})
  const unitOf = (unit: string | null | undefined) => (unit ? { unit } : {})

  // ─── ส่งไฟล์งาน — "did a file arrive" is the whole grade ──────────────────
  if (question.question_type === 'file_upload') {
    const files = parseJson<unknown[]>(studentAns, [])
    const submitted = Array.isArray(files) && files.length > 0
    return {
      ...base,
      rows: [{
        student: submitted ? `แนบไฟล์แล้ว ${files.length} ไฟล์` : 'ยังไม่ได้แนบไฟล์',
        status: rowStatus(submitted),
      }],
    }
  }

  // ─── ถูก/ผิด แบบข้อความเดียว ──────────────────────────────────────────────
  if (correctAns === 'true' || correctAns === 'false') {
    const payload = studentAns.startsWith('{')
      ? parseJson<{ answer?: string }>(studentAns, {})
      : { answer: studentAns }
    const picked = (payload.answer ?? '').trim()
    const label = (v: string) => (v === 'true' ? 'ถูก' : v === 'false' ? 'ผิด' : '—')
    return {
      ...base,
      rows: [{
        student: label(picked),
        ...reveal(label(correctAns)),
        status: rowStatus(picked === correctAns),
      }],
    }
  }

  // ─── ถูก/ผิด หลายข้อความย่อย ──────────────────────────────────────────────
  if (correctAns.startsWith('TF:')) {
    const correctList = parseJson<string[]>(correctAns.slice(3), [])
    const studentList = parseJson<{ answers?: string[] }>(studentAns, {}).answers ?? []
    const labels = partLabels((question.extra_data?.part_label_style as PartLabelStyle) ?? null)
    const label = (v: string) => (v === 'true' ? 'ถูก' : v === 'false' ? 'ผิด' : '—')
    return {
      ...base,
      rows: correctList.map((correct, i) => ({
        label: labels[i] ?? String(i + 1),
        student: label((studentList[i] ?? '').trim()),
        ...reveal(label(correct)),
        status: rowStatus((studentList[i] ?? '').trim() === correct),
      })),
    }
  }

  // ─── เติมคำ แบบเก่าที่ครูตรวจเองทั้งข้อ ───────────────────────────────────
  if (correctAns.startsWith('FILL_MANUAL:')) {
    const studentList = parseJson<string[]>(studentAns, [])
    return {
      ...base,
      note: 'ข้อนี้ครูเป็นคนตรวจ ระบบจึงยังบอกถูก/ผิดให้ไม่ได้',
      rows: studentList.map((student, i) => ({
        label: `ช่อง ${i + 1}`,
        student: blank(student),
        status: 'pending' as const,
      })),
    }
  }

  // ─── เติมคำ รายช่อง ──────────────────────────────────────────────────────
  if (correctAns.startsWith('FILL:')) {
    const correctList = parseJson<string[][]>(correctAns.slice(5), [])
    const studentList = parseJson<string[]>(studentAns, [])
    const blanks: FillBlankItem[] = question.extra_data?.blanks ?? []
    let hasManual = false
    const rows: FeedbackRow[] = correctList.map((accepted, i) => {
      const student = studentList[i] ?? ''
      const type = getBlankType(question.extra_data, blanks[i])
      if (type === 'text') {
        hasManual = true
        return { label: `ช่อง ${i + 1}`, student: blank(student), status: 'pending' as const }
      }
      const caseSensitive = blanks[i]?.case_sensitive ?? false
      return {
        label: `ช่อง ${i + 1}`,
        student: blank(student),
        ...reveal(accepted.join(' หรือ ')),
        status: rowStatus(isBlankCorrect(student, accepted, type, caseSensitive)),
      }
    })
    return {
      ...base,
      ...(hasManual ? { note: 'บางช่องเป็นคำตอบที่ครูตรวจเอง คะแนนส่วนนั้นจะมาภายหลัง' } : {}),
      rows,
    }
  }

  // ─── ข้อความรวมหลายรูปแบบ (composite) ────────────────────────────────────
  if (correctAns.startsWith('COMP:')) {
    type CorrectPart = { type: string; correct: unknown; blankType?: any; caseSensitive?: boolean }
    const correctParts = parseJson<CorrectPart[]>(correctAns.slice(5), [])
    const studentList = parseJson<string[]>(studentAns, [])
    const labels = partLabels((question.extra_data?.part_label_style as PartLabelStyle) ?? null)
    let hasManual = false

    const rows: FeedbackRow[] = correctParts.map((part, i) => {
      const label = labels[i] ?? String(i + 1)
      const student = studentList[i] ?? ''

      // A fill_blank part with no accepted values is its ครูตรวจเอง sub-type.
      if (part.type === 'fill_blank' && Array.isArray(part.correct) && part.correct.length === 0) {
        hasManual = true
        return { label, student: blank(student), status: 'pending' as const }
      }

      if (part.type === 'true_false' && Array.isArray(part.correct)) {
        const targets = part.correct as string[]
        const picks = parseJson<string[]>(student, [])
        const matched = targets.filter((t, j) => (picks[j] ?? '').trim() === t).length
        const readable = (list: string[]) =>
          list.map(v => (v === 'true' ? 'ถูก' : v === 'false' ? 'ผิด' : '—')).join(', ')
        return {
          label,
          student: picks.length > 0 ? readable(picks) : '—',
          ...reveal(readable(targets)),
          status: rowStatus(matched === targets.length),
        }
      }

      if (part.type === 'true_false') {
        const label2 = (v: string) => (v === 'true' ? 'ถูก' : v === 'false' ? 'ผิด' : '—')
        return {
          label,
          student: label2(student),
          ...reveal(label2(String(part.correct ?? ''))),
          status: rowStatus(student === part.correct),
        }
      }

      if (part.type === 'mcq') {
        return {
          label,
          student: blank(student),
          ...reveal(String(part.correct ?? '—')),
          status: rowStatus(student === part.correct),
        }
      }

      if (part.type === 'fill_blank') {
        const accepted = (part.correct as string[]) ?? []
        return {
          label,
          student: blank(student),
          ...reveal(accepted.join(' หรือ ')),
          status: rowStatus(
            isBlankCorrect(student, accepted, part.blankType ?? 'fixed', !!part.caseSensitive)
          ),
        }
      }

      if (part.type === 'ordering') {
        const correctOrder = (part.correct as string[]) ?? []
        const studentOrder = parseJson<string[]>(student, [])
        const ok = correctOrder.length > 0
          && studentOrder.length === correctOrder.length
          && correctOrder.every((id, idx) => studentOrder[idx] === id)
        // The stored order is a list of item ids, which would mean nothing on
        // screen — the ordering UI itself already shows the sequence.
        return {
          label,
          student: studentOrder.length > 0 ? (ok ? 'เรียงถูกต้อง' : 'ยังเรียงไม่ถูก') : '—',
          status: rowStatus(ok),
        }
      }

      return { label, student: blank(student), status: 'pending' as const }
    })

    return {
      ...base,
      ...(hasManual ? { note: 'บางข้อย่อยเป็นคำตอบที่ครูตรวจเอง คะแนนส่วนนั้นจะมาภายหลัง' } : {}),
      rows,
    }
  }

  // ─── ปรนัย ────────────────────────────────────────────────────────────────
  if (correctAns.startsWith('MCQ:')) {
    const correctIndex = parseInt(correctAns.slice(4), 10)
    const studentIndex = studentAns.startsWith('MCQ:') ? parseInt(studentAns.slice(4), 10) : NaN
    // Already in the order this student read them, so ก/ข/ค/ง here are the
    // same letters that were on their screen; `index` is the position the
    // answer was recorded as.
    const choices: FeedbackChoice[] = (question.mcq_options ?? []).map((option, seen) => {
      const optionIndex = option.index ?? seen
      return {
        label: CHOICE_LABELS[seen] ?? String(seen + 1),
        text: String(option.text ?? ''),
        ...(option.image_url ? { imageUrl: String(option.image_url) } : {}),
        picked: optionIndex === studentIndex,
        correct: revealAnswerKey && optionIndex === correctIndex,
      }
    })
    const picked = choices.find(c => c.picked)
    return {
      ...base,
      choices,
      rows: [{
        student: picked ? `${picked.label}. ${picked.text}` : '—',
        ...(revealAnswerKey
          ? (() => {
              const answer = choices.find(c => c.correct)
              return answer ? { correct: `${answer.label}. ${answer.text}` } : {}
            })()
          : {}),
        status: rowStatus(studentIndex === correctIndex),
      }],
    }
  }

  // ─── จับคู่ ───────────────────────────────────────────────────────────────
  if (correctAns.startsWith('MATCH:')) {
    const correctRights = parseJson<string[]>(correctAns.slice(6), [])
    const studentRights = parseJson<string[]>(studentAns, [])
    // option_order shuffled the choices, not the prompts, so pair i still
    // lines up with answer i (same rule the results page follows).
    const pairs = question.mcq_options ?? []
    return {
      ...base,
      rows: correctRights.map((right, i) => ({
        label: String(pairs[i]?.left_text ?? `ข้อ ${i + 1}`),
        student: blank(studentRights[i]),
        ...reveal(right),
        status: rowStatus((studentRights[i] ?? '').trim() === right.trim()),
      })),
    }
  }

  // ─── เรียงลำดับ ───────────────────────────────────────────────────────────
  if (correctAns.startsWith('ORDER:')) {
    const correctOrder = parseJson<string[]>(correctAns.slice(6), [])
    const studentOrder = parseJson<string[]>(studentAns, [])
    const items: Array<{ id: string; text?: string }> = question.extra_data?.items ?? []
    const textOf = (id: string) => items.find(item => item.id === id)?.text ?? id
    const rightCount = correctOrder.filter((id, i) => studentOrder[i] === id).length
    return {
      ...base,
      rows: correctOrder.map((id, i) => ({
        label: `ลำดับ ${i + 1}`,
        student: studentOrder[i] ? textOf(studentOrder[i]) : '—',
        ...reveal(textOf(id)),
        status: rowStatus(studentOrder[i] === id),
      })),
      ...(rightCount === correctOrder.length
        ? {}
        : { note: `เรียงถูก ${rightCount} จาก ${correctOrder.length} ตำแหน่ง` }),
    }
  }

  // ─── เติมคำตอบตัวเลข หลายข้อย่อย ──────────────────────────────────────────
  if (correctAns.startsWith('[')) {
    const correctList = parseJson<string[]>(correctAns, [])
    const studentList = parseJson<string[]>(studentAns, [])
    const parts = question.answer_parts ?? []
    const labels = partLabels((question.extra_data?.part_label_style as PartLabelStyle) ?? null)
    return {
      ...base,
      rows: correctList.map((correct, i) => {
        const student = studentList[i] ?? ''
        const studentValue = evaluateStudentAnswer(student) ?? NaN
        const correctValue = parseFloat(correct)
        const tolerance = parts[i]?.tolerance ?? question.answer_tolerance ?? 0.1
        const ok = !isNaN(studentValue)
          && !isNaN(correctValue)
          && gradeValue(studentValue, correctValue, tolerance)
        return {
          label: labels[i] ?? String(i + 1),
          student: blank(student),
          ...reveal(formatNumber(correct)),
          ...unitOf(parts[i]?.unit ?? question.answer_unit),
          status: rowStatus(ok),
        }
      }),
    }
  }

  // ─── คำตอบเดียว (ตัวเลขหรือข้อความ) ───────────────────────────────────────
  const studentValue = evaluateStudentAnswer(studentAns) ?? NaN
  const correctValue = parseFloat(correctAns)
  const numeric = !isNaN(studentValue) && !isNaN(correctValue)
  const ok = numeric
    ? gradeValue(studentValue, correctValue, question.answer_tolerance ?? 0.1)
    : !!studentAns && !!correctAns && studentAns.trim() === correctAns.trim()
  return {
    ...base,
    rows: [{
      student: blank(studentAns),
      ...reveal(formatNumber(correctAns)),
      ...unitOf(question.answer_unit),
      status: rowStatus(ok),
    }],
  }
}
