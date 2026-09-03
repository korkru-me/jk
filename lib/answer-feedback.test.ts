import { describe, it, expect } from 'vitest'
import { buildAnswerFeedback, type FeedbackInput, type FeedbackQuestion } from './answer-feedback'
import { gradeAnswer } from './assignment-attempt'
import { isInstantCheckable } from './grading'
import type { AnswerPart } from '@/lib/types'

/**
 * Builds the feedback the way the real caller does — by grading first and
 * handing the verdict over — so a test can never assert a panel that a real
 * ตรวจคำตอบ could not produce.
 */
function check(over: {
  correct: string
  student: string | null
  maxScore?: number
  questionType?: string
  extraData?: unknown
  answerParts?: AnswerPart[] | null
  tolerance?: number
  mcqOptions?: FeedbackQuestion['mcq_options']
  answerUnit?: string | null
  solutionText?: string | null
  reveal?: boolean
  mathInputModes?: Record<string, 'deg' | 'rad'>
}) {
  const maxScore = over.maxScore ?? 1
  const question: FeedbackQuestion = {
    question_type: over.questionType ?? 'written',
    answer_unit: over.answerUnit ?? null,
    answer_parts: over.answerParts ?? null,
    answer_tolerance: over.tolerance ?? 0.01,
    extra_data: over.extraData ?? {},
    mcq_options: over.mcqOptions ?? null,
    solution_text: over.solutionText ?? null,
    solution_image_urls: null,
  }
  const graded = gradeAnswer({
    id: 'a1',
    correct_answer: over.correct,
    student_answer: over.student,
    math_input_modes: over.mathInputModes,
    max_score: maxScore,
    questions: {
      question_type: question.question_type,
      answer_tolerance: question.answer_tolerance ?? 0.01,
      answer_parts: question.answer_parts,
      extra_data: question.extra_data,
    },
  })
  const input: FeedbackInput = {
    correct_answer: over.correct,
    student_answer: over.student,
    math_input_modes: over.mathInputModes,
    question,
    isCorrect: graded.is_correct,
    score: graded.score,
    maxScore,
    revealAnswerKey: over.reveal ?? true,
  }
  return buildAnswerFeedback(input)
}

describe('buildAnswerFeedback — verdict', () => {
  it('reads ถูก straight off the score gradeAnswer banked', () => {
    const f = check({ correct: '10', student: '10' })
    expect(f.verdict).toBe('correct')
    expect(f.score).toBe(1)
  })

  it('uses the saved angle mode for the row status as well as the score', () => {
    const rad = check({
      correct: '0.5',
      student: 'sin(pi/6)',
      mathInputModes: { main: 'rad' },
    })
    expect(rad.verdict).toBe('correct')
    expect(rad.rows[0].status).toBe('correct')
  })

  it('calls a ข้อ with some marks partial rather than a flat ผิด', () => {
    // Two ข้อย่อย, one right — the whole reason to check one ข้อ at a time is
    // seeing which half went wrong.
    const f = check({
      correct: JSON.stringify(['10', '20']),
      student: JSON.stringify(['10', '99']),
      maxScore: 2,
      answerParts: [{ tolerance: 0.01 }, { tolerance: 0.01 }] as AnswerPart[],
    })
    expect(f.verdict).toBe('partial')
    expect(f.rows.map(r => r.status)).toEqual(['correct', 'wrong'])
  })

  it('says รอครูตรวจ instead of ผิด for a blank only a teacher can mark', () => {
    const f = check({
      correct: 'FILL:' + JSON.stringify([['ก'], []]),
      student: JSON.stringify(['ก', 'อะไรก็ได้']),
      maxScore: 2,
      questionType: 'fill_blank',
      extraData: { blanks: [{ id: 1, type: 'fixed' }, { id: 2, type: 'text' }] },
    })
    expect(f.verdict).toBe('pending')
    expect(f.rows[1].status).toBe('pending')
    expect(f.note).toBeTruthy()
  })
})

describe('buildAnswerFeedback — withholding the เฉลย', () => {
  it('leaves the answer out of the payload entirely, not just off the screen', () => {
    const hidden = check({ correct: '42', student: '7', reveal: false })
    expect(hidden.revealed).toBe(false)
    expect(hidden.rows[0].correct).toBeUndefined()
    expect(JSON.stringify(hidden)).not.toContain('42')

    // …and still says whether the student got it right.
    expect(hidden.verdict).toBe('wrong')
    expect(hidden.rows[0].student).toBe('7')
  })

  it('withholds the teacher วิธีทำ on the same switch', () => {
    const shown = check({ correct: '42', student: '42', solutionText: 'ใช้สูตร...' })
    const hidden = check({ correct: '42', student: '42', solutionText: 'ใช้สูตร...', reveal: false })
    expect(shown.solutionText).toBe('ใช้สูตร...')
    expect(hidden.solutionText).toBeUndefined()
  })

  it('never marks an option as the เฉลย while the key is withheld', () => {
    const hidden = check({
      correct: 'MCQ:1',
      student: 'MCQ:0',
      questionType: 'mcq',
      mcqOptions: [{ text: 'ผิด', index: 0 }, { text: 'ถูก', index: 1 }],
      reveal: false,
    })
    expect(hidden.choices?.some(c => c.correct)).toBe(false)
    expect(hidden.choices?.find(c => c.picked)?.text).toBe('ผิด')
  })
})

describe('buildAnswerFeedback — ปรนัย', () => {
  it('labels the options in the order this student saw them, not the authored one', () => {
    // The shuffle put authored option 2 first, so ก must be that option and
    // the เฉลย must follow the option, not the position.
    const f = check({
      correct: 'MCQ:2',
      student: 'MCQ:2',
      questionType: 'mcq',
      mcqOptions: [
        { text: 'ค', index: 2 },
        { text: 'ก', index: 0 },
        { text: 'ข', index: 1 },
      ],
    })
    expect(f.choices?.map(c => `${c.label}:${c.text}`)).toEqual(['ก:ค', 'ข:ก', 'ค:ข'])
    const answer = f.choices?.find(c => c.correct)
    expect(answer?.label).toBe('ก')
    expect(answer?.picked).toBe(true)
  })
})

describe('buildAnswerFeedback — the other question types', () => {
  it('reads ถูก/ผิด back as words', () => {
    const f = check({ correct: 'true', student: 'false', questionType: 'true_false' })
    expect(f.rows[0].student).toBe('ผิด')
    expect(f.rows[0].correct).toBe('ถูก')
  })

  it('lists every accepted spelling for a เติมคำ blank', () => {
    const f = check({
      correct: 'FILL:' + JSON.stringify([['น้ำ', 'water']]),
      student: JSON.stringify(['water']),
      questionType: 'fill_blank',
      extraData: { blanks: [{ id: 1, type: 'fixed' }] },
    })
    expect(f.rows[0].status).toBe('correct')
    expect(f.rows[0].correct).toBe('น้ำ หรือ water')
  })

  it('names the left-hand prompt on each จับคู่ row', () => {
    const f = check({
      correct: 'MATCH:' + JSON.stringify(['ปลา', 'นก']),
      student: JSON.stringify(['ปลา', 'ปลา']),
      maxScore: 2,
      questionType: 'matching',
      mcqOptions: [{ left_text: 'ว่ายน้ำ' }, { left_text: 'บิน' }],
    })
    expect(f.rows.map(r => r.label)).toEqual(['ว่ายน้ำ', 'บิน'])
    expect(f.rows.map(r => r.status)).toEqual(['correct', 'wrong'])
    expect(f.rows[1].correct).toBe('นก')
  })

  it('shows เรียงลำดับ as the item text a student can read, not stored ids', () => {
    const f = check({
      correct: 'ORDER:' + JSON.stringify(['i2', 'i1']),
      student: JSON.stringify(['i1', 'i2']),
      maxScore: 2,
      questionType: 'ordering',
      extraData: { items: [{ id: 'i1', text: 'หนึ่ง' }, { id: 'i2', text: 'สอง' }] },
    })
    expect(f.rows[0].student).toBe('หนึ่ง')
    expect(f.rows[0].correct).toBe('สอง')
    expect(f.note).toContain('0')
  })

  it('accepts an arithmetic answer the way the real grading does', () => {
    const f = check({ correct: '10', student: '9+1' })
    expect(f.verdict).toBe('correct')
    expect(f.rows[0].status).toBe('correct')
  })

  it('carries the ข้อย่อย unit onto both คำตอบคุณ and เฉลย', () => {
    const f = check({
      correct: JSON.stringify(['5']),
      student: JSON.stringify(['5']),
      answerParts: [{ tolerance: 0.01, unit: 'm/s' }] as AnswerPart[],
    })
    expect(f.rows[0].unit).toBe('m/s')
  })

  it('grades ส่งไฟล์งาน on whether a file arrived', () => {
    const none = check({ correct: '', student: null, questionType: 'file_upload' })
    expect(none.verdict).toBe('wrong')
    const one = check({
      correct: '',
      student: JSON.stringify([{ url: 'u', name: 'n', type: 'image/png' }]),
      questionType: 'file_upload',
    })
    expect(one.verdict).toBe('correct')
  })

  it('survives a student answer that is not valid JSON', () => {
    const f = check({
      correct: 'FILL:' + JSON.stringify([['ก']]),
      student: 'ไม่ใช่ JSON',
      questionType: 'fill_blank',
      extraData: { blanks: [{ id: 1, type: 'fixed' }] },
    })
    expect(f.rows[0].student).toBe('—')
    expect(f.verdict).toBe('wrong')
  })
})

describe('isInstantCheckable', () => {
  it('withholds the button from ข้อเขียน, which has no answer key to check', () => {
    expect(isInstantCheckable('essay')).toBe(false)
  })

  it('offers it for every other type, including ones a teacher part-marks', () => {
    for (const type of ['written', 'mcq', 'true_false', 'fill_blank', 'ordering', 'matching', 'composite', 'file_upload']) {
      expect(isInstantCheckable(type)).toBe(true)
    }
  })
})
