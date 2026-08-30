import { describe, it, expect } from 'vitest'
import { buildAssignmentAttempt, gradeAnswer, naturalMaxScore, scaleScore, type GradableAnswer } from './assignment-attempt'
import type { AnswerPart, Assignment, Question } from '@/lib/types'

/** A gradable answer with everything defaulted, so each test states only what it is about. */
function answer(over: {
  correct: string
  student: string | null
  maxScore?: number
  questionType?: string
  extraData?: unknown
  answerParts?: AnswerPart[] | null
  tolerance?: number
}): GradableAnswer {
  return {
    id: 'a1',
    correct_answer: over.correct,
    student_answer: over.student,
    max_score: over.maxScore ?? 1,
    questions: {
      question_type: over.questionType ?? 'written',
      answer_tolerance: over.tolerance ?? 0.01,
      answer_parts: over.answerParts ?? null,
      extra_data: over.extraData ?? {},
    },
  }
}

describe('scaleScore', () => {
  it('is a no-op when the teacher set no override', () => {
    expect(scaleScore(3, 5, 5)).toBe(3)
  })

  it('rescales a raw score onto a custom ceiling', () => {
    expect(scaleScore(3, 5, 10)).toBe(6)
    expect(scaleScore(5, 5, 10)).toBe(10)
    expect(scaleScore(0, 5, 10)).toBe(0)
  })

  it('survives a structural maximum of zero', () => {
    expect(scaleScore(2, 0, 10)).toBe(2)
  })
})

describe('naturalMaxScore', () => {
  it('counts one point per blank, item or pair', () => {
    expect(naturalMaxScore('fill_blank', { blanks: [{}, {}, {}] }, null)).toBe(3)
    expect(naturalMaxScore('ordering', { items: [{}, {}] }, null)).toBe(2)
    expect(naturalMaxScore('matching', {}, null, 4)).toBe(4)
  })

  it('never returns zero, even with nothing configured', () => {
    expect(naturalMaxScore('fill_blank', { blanks: [] }, null)).toBe(1)
    expect(naturalMaxScore('matching', {}, null, 0)).toBe(1)
  })

  it('adds up a true/false question statement by statement', () => {
    // main statement + 2 more, 2 points each, no explanation
    expect(naturalMaxScore('true_false', { statements: [{}, {}], score_answer: 2, explanation_mode: 'none' }, null)).toBe(6)
  })

  it('includes the explanation score only when explanations are asked for', () => {
    expect(naturalMaxScore('true_false', { score_answer: 1, explanation_mode: 'none', score_explanation: 3 }, null)).toBe(1)
    expect(naturalMaxScore('true_false', { score_answer: 1, explanation_mode: 'always', score_explanation: 3 }, null)).toBe(4)
  })

  it('sums a composite question over its parts', () => {
    expect(naturalMaxScore('composite', { parts: [{ score: 2 }, { score: 3 }, {}] }, null)).toBe(6)
  })

  it('gives a multi-part written question one point per part', () => {
    expect(naturalMaxScore('written', {}, [{}, {}, {}])).toBe(3)
    expect(naturalMaxScore('written', {}, [{}])).toBe(1)
  })
})

describe('gradeAnswer — numeric written questions', () => {
  it('marks within tolerance correct and outside it wrong', () => {
    expect(gradeAnswer(answer({ correct: '10', student: '10.005', tolerance: 0.01 })).is_correct).toBe(true)
    expect(gradeAnswer(answer({ correct: '10', student: '10.5', tolerance: 0.01 })).is_correct).toBe(false)
  })

  it('reads a percentage tolerance from a negative value', () => {
    // -10 means "within 10%", so 100 accepts anything from 90 to 110.
    expect(gradeAnswer(answer({ correct: '100', student: '109', tolerance: -10 })).is_correct).toBe(true)
    expect(gradeAnswer(answer({ correct: '100', student: '111', tolerance: -10 })).is_correct).toBe(false)
  })

  it('accepts arithmetic the student typed instead of the computed number', () => {
    expect(gradeAnswer(answer({ correct: '10', student: '9+1' })).is_correct).toBe(true)
  })

  it('marks a blank answer wrong rather than crashing', () => {
    expect(gradeAnswer(answer({ correct: '10', student: null })).is_correct).toBe(false)
    expect(gradeAnswer(answer({ correct: '10', student: '' })).is_correct).toBe(false)
  })

  it('scores each part of a multi-part answer', () => {
    const parts = [{ tolerance: 0.01 }, { tolerance: 0.01 }] as AnswerPart[]
    const result = gradeAnswer(answer({
      correct: JSON.stringify(['10', '20']),
      student: JSON.stringify(['10', '99']),
      maxScore: 2,
      answerParts: parts,
    }))
    expect(result.score).toBe(1)
    expect(result.is_correct).toBe(false)
  })
})

describe('gradeAnswer — true/false', () => {
  it('compares the plain answer', () => {
    expect(gradeAnswer(answer({ correct: 'true', student: 'true', questionType: 'true_false' })).is_correct).toBe(true)
    expect(gradeAnswer(answer({ correct: 'true', student: 'false', questionType: 'true_false' })).is_correct).toBe(false)
  })

  it('reads the answer out of a JSON payload when an explanation was asked for', () => {
    const result = gradeAnswer(answer({
      correct: 'true',
      student: JSON.stringify({ answer: 'true', explanation: 'เพราะ...' }),
      questionType: 'true_false',
      extraData: { score_answer: 1, explanation_mode: 'always', score_explanation: 1 },
      maxScore: 2,
    }))
    expect(result.is_correct).toBe(true)
  })

  it('scores a multi-statement question proportionally', () => {
    const result = gradeAnswer(answer({
      correct: 'TF:' + JSON.stringify(['true', 'false', 'true']),
      // The student side is a { answers } object, not the TF: string the key uses.
      student: JSON.stringify({ answers: ['true', 'true', 'true'] }),
      questionType: 'true_false',
      extraData: { statements: [{}, {}], score_answer: 1, explanation_mode: 'none' },
      maxScore: 3,
    }))
    expect(result.score).toBe(2)
    expect(result.is_correct).toBe(false)
  })
})

describe('gradeAnswer — ordering', () => {
  it('gives a point per position in the right place', () => {
    const result = gradeAnswer(answer({
      correct: 'ORDER:' + JSON.stringify(['a', 'b', 'c']),
      student: JSON.stringify(['a', 'c', 'b']),
      questionType: 'ordering',
      extraData: { items: [{}, {}, {}] },
      maxScore: 3,
    }))
    expect(result.score).toBe(1)   // only the first position matches
    expect(result.is_correct).toBe(false)
  })

  it('marks a fully correct order correct', () => {
    const result = gradeAnswer(answer({
      correct: 'ORDER:' + JSON.stringify(['a', 'b']),
      student: JSON.stringify(['a', 'b']),
      questionType: 'ordering',
      extraData: { items: [{}, {}] },
      maxScore: 2,
    }))
    expect(result).toMatchObject({ is_correct: true, score: 2 })
  })
})

describe('gradeAnswer — matching', () => {
  const key = ['N', 'J', 'Watt', 'Pa']
  const matching = (student: unknown, maxScore = 4) => gradeAnswer(answer({
    correct: 'MATCH:' + JSON.stringify(key),
    student: JSON.stringify(student),
    questionType: 'matching',
    maxScore,
  }))

  it('gives a point per correctly paired prompt', () => {
    expect(matching(['N', 'J', 'Watt', 'Pa'])).toMatchObject({ is_correct: true, score: 4 })
    expect(matching(['J', 'N', 'Watt', 'Pa'])).toMatchObject({ is_correct: false, score: 2 })
  })

  it('handles an unanswered or partly answered question', () => {
    expect(matching([])).toMatchObject({ is_correct: false, score: 0 })
    expect(matching(['N', '', 'Watt', ''])).toMatchObject({ is_correct: false, score: 2 })
  })

  it('treats repeated right-hand labels as interchangeable', () => {
    const result = gradeAnswer(answer({
      correct: 'MATCH:' + JSON.stringify(['A', 'A', 'B']),
      student: JSON.stringify(['A', 'A', 'B']),
      questionType: 'matching',
      maxScore: 3,
    }))
    expect(result.is_correct).toBe(true)
  })

  it('scores out of the pair count frozen into the attempt, not the question', () => {
    // A pair added after this attempt started must not change its ceiling.
    expect(matching(['N', 'J', 'Watt', 'Pa'], 10).score).toBe(10)
  })

  it('survives a student answer that is not valid JSON', () => {
    expect(gradeAnswer(answer({
      correct: 'MATCH:' + JSON.stringify(key),
      student: 'ไม่ใช่ JSON',
      questionType: 'matching',
      maxScore: 4,
    })).score).toBe(0)
  })
})

describe('gradeAnswer — fill in the blank', () => {
  it('leaves a manually graded blank pending rather than scoring it', () => {
    const result = gradeAnswer(answer({
      correct: 'FILL:' + JSON.stringify([[]]),
      student: JSON.stringify(['อะไรก็ได้']),
      questionType: 'fill_blank',
      extraData: { blanks: [{ id: 1, type: 'text', answer: '', case_sensitive: false }] },
    }))
    expect(result.is_correct).toBeNull()
  })

  it('auto-grades a fixed blank, ignoring case by default', () => {
    const result = gradeAnswer(answer({
      correct: 'FILL:' + JSON.stringify([['Newton']]),
      student: JSON.stringify(['newton']),
      questionType: 'fill_blank',
      extraData: { blanks: [{ id: 1, type: 'fixed', answer: 'Newton', case_sensitive: false }] },
    }))
    expect(result.is_correct).toBe(true)
  })
})

describe('gradeAnswer — file upload', () => {
  it('credits an attached file and nothing else', () => {
    const upload = (student: string | null) => gradeAnswer(answer({
      correct: '', student, questionType: 'file_upload', maxScore: 5,
    }))
    expect(upload(JSON.stringify([{ url: 'x', name: 'a.pdf', type: 'application/pdf' }]))).toMatchObject({ is_correct: true, score: 5 })
    expect(upload(JSON.stringify([]))).toMatchObject({ is_correct: false, score: 0 })
    expect(upload(null)).toMatchObject({ is_correct: false, score: 0 })
  })
})

// ─── Multiple choice ─────────────────────────────────────────────────────────

const assignment = {
  question_ids: ['q1'],
  shuffle_questions: false,
  shuffle_options: false,
  question_points: null,
  random_question_count: null,
} as unknown as Assignment

/** An mcq question shaped the way mcq-form.tsx saves one: the options carry
 *  the answer and answer_formula stays empty. */
function mcqQuestion(options: { text: string; is_correct: boolean }[]): Question {
  return {
    id: 'q1',
    question_type: 'mcq',
    answer_formula: '',
    answer_parts: null,
    variables: [],
    logic_rules: [],
    extra_data: {},
    mcq_options: options,
  } as unknown as Question
}

function gradeMcq(correctAnswer: string, student: string, maxScore = 1) {
  return gradeAnswer(answer({ correct: correctAnswer, student, questionType: 'mcq', maxScore }))
}

describe('multiple choice, from attempt to grade', () => {
  const options = [
    { text: 'เวกเตอร์', is_correct: false },
    { text: 'สเกลาร์', is_correct: true },
    { text: 'มูลฐาน', is_correct: false },
  ]

  it('records which option is correct by position', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [mcqQuestion(options)])
    expect(skeleton.correct_answer).toBe('MCQ:1')
  })

  it('does not fall through to the numeric path', () => {
    // An mcq question has no answer_formula. Without a branch of its own the
    // attempt was stored as the string "undefined", and every answer counted
    // as wrong.
    const [skeleton] = buildAssignmentAttempt(assignment, [mcqQuestion(options)])
    expect(skeleton.correct_answer).not.toBe('undefined')
  })

  it('credits the right option and refuses the others', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [mcqQuestion(options)])
    expect(gradeMcq(skeleton.correct_answer, 'MCQ:1')).toMatchObject({ is_correct: true, score: 1 })
    expect(gradeMcq(skeleton.correct_answer, 'MCQ:0')).toMatchObject({ is_correct: false, score: 0 })
    expect(gradeMcq(skeleton.correct_answer, 'MCQ:2')).toMatchObject({ is_correct: false, score: 0 })
  })

  it('tells apart two options that read the same', () => {
    // Text comparison credited whichever matched first, so picking the wrong
    // one of a duplicated pair scored.
    const [skeleton] = buildAssignmentAttempt(assignment, [mcqQuestion([
      { text: '10 m/s', is_correct: false },
      { text: '10 m/s', is_correct: true },
    ])])
    expect(skeleton.correct_answer).toBe('MCQ:1')
    expect(gradeMcq(skeleton.correct_answer, 'MCQ:0').is_correct).toBe(false)
    expect(gradeMcq(skeleton.correct_answer, 'MCQ:1').is_correct).toBe(true)
  })

  it('distinguishes picture-only options, which carry no text at all', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [mcqQuestion([
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: true },
    ])])
    expect(gradeMcq(skeleton.correct_answer, 'MCQ:2').is_correct).toBe(true)
    expect(gradeMcq(skeleton.correct_answer, 'MCQ:0').is_correct).toBe(false)
  })

  it('is not fooled by an option whose text is a number', () => {
    // "2" as an option must not be mistaken for the index 2.
    const [skeleton] = buildAssignmentAttempt(assignment, [mcqQuestion([
      { text: '2', is_correct: true },
      { text: '4', is_correct: false },
    ])])
    expect(gradeMcq(skeleton.correct_answer, '2').is_correct).toBe(false)
    expect(gradeMcq(skeleton.correct_answer, 'MCQ:0').is_correct).toBe(true)
  })

  it('scales to a custom point override', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [mcqQuestion(options)])
    expect(gradeMcq(skeleton.correct_answer, 'MCQ:1', 5).score).toBe(5)
  })

  it('leaves an attempt taken before the change grading the way it did', () => {
    // Older attempts stored the option's text; they fall through to the text
    // comparison rather than being re-interpreted as an index.
    expect(gradeAnswer(answer({ correct: 'สเกลาร์', student: 'สเกลาร์', questionType: 'mcq' })).is_correct).toBe(true)
  })

  it('survives a question with no correct option marked', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [mcqQuestion([
      { text: 'ก', is_correct: false },
      { text: 'ข', is_correct: false },
    ])])
    expect(skeleton.correct_answer).toBe('')
    expect(gradeMcq(skeleton.correct_answer, 'MCQ:0').is_correct).toBe(false)
  })
})

describe('buildAssignmentAttempt — random question pool', () => {
  const poolQuestions = ['q1', 'q2', 'q3', 'q4'].map((id) => ({
    ...mcqQuestion([
      { text: 'ผิด', is_correct: false },
      { text: 'ถูก', is_correct: true },
    ]),
    id,
  }))

  it('samples the configured number without duplicate questions', () => {
    const result = buildAssignmentAttempt({
      ...assignment,
      question_ids: poolQuestions.map((question) => question.id),
      random_question_count: 2,
    }, poolQuestions)

    expect(result).toHaveLength(2)
    expect(new Set(result.map((row) => row.question_id)).size).toBe(2)
    expect(result.every((row) => poolQuestions.some((question) => question.id === row.question_id))).toBe(true)
    expect(result.map((row) => row.order_index)).toEqual([0, 1])
  })

  it('keeps authored order after sampling when question shuffling is off', () => {
    const authoredOrder = poolQuestions.map((question) => question.id)
    const result = buildAssignmentAttempt({
      ...assignment,
      question_ids: authoredOrder,
      random_question_count: 3,
    }, poolQuestions)
    const selectedIndexes = result.map((row) => authoredOrder.indexOf(row.question_id))

    expect(selectedIndexes).toEqual([...selectedIndexes].sort((a, b) => a - b))
  })

  it('samples only questions that still exist', () => {
    const result = buildAssignmentAttempt({
      ...assignment,
      question_ids: ['deleted-question', ...poolQuestions.map((question) => question.id)],
      random_question_count: 4,
    }, poolQuestions)

    expect(result).toHaveLength(4)
    expect(result.some((row) => row.question_id === 'deleted-question')).toBe(false)
  })
})

describe('gradeAnswer — composite with an mcq part', () => {
  it('scores the part by position, not by the option text', () => {
    const result = gradeAnswer(answer({
      correct: 'COMP:' + JSON.stringify([{ type: 'mcq', correct: 'MCQ:1', score: 2 }]),
      student: JSON.stringify(['MCQ:1']),
      questionType: 'composite',
      extraData: { parts: [{ type: 'mcq', score: 2 }] },
      maxScore: 2,
    }))
    expect(result).toMatchObject({ is_correct: true, score: 2 })
  })

  it('refuses a different position', () => {
    const result = gradeAnswer(answer({
      correct: 'COMP:' + JSON.stringify([{ type: 'mcq', correct: 'MCQ:1', score: 2 }]),
      student: JSON.stringify(['MCQ:0']),
      questionType: 'composite',
      extraData: { parts: [{ type: 'mcq', score: 2 }] },
      maxScore: 2,
    }))
    expect(result).toMatchObject({ is_correct: false, score: 0 })
  })
})
// ─── Essay ───────────────────────────────────────────────────────────────────

/** An essay question shaped the way essay-form.tsx saves one: no formula, no
 *  answer parts, and mcq_options holding the marking rubric. */
function essayQuestion(): Question {
  return {
    id: 'q1',
    question_type: 'essay',
    answer_formula: '',
    answer_parts: [],
    variables: [],
    logic_rules: [],
    extra_data: {},
    mcq_options: [{ criterion: 'อธิบายหลักการได้ถูกต้อง', points: 3 }],
  } as unknown as Question
}

function gradeEssay(correctAnswer: string, student: string | null) {
  return gradeAnswer(answer({ correct: correctAnswer, student, questionType: 'essay' }))
}

describe('essay, from attempt to grade', () => {
  it('records no answer to compare against', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [essayQuestion()])
    expect(skeleton.correct_answer).toBe('')
    expect(skeleton.max_score).toBe(1)
  })

  it('does not freeze an evaluated non-answer into the attempt', () => {
    // An essay carries an empty answer_formula. Without a branch of its own it
    // fell through to the numeric path and stored whatever evaluating that
    // produced: "undefined" for the empty formula every essay saves, or
    // evaluateFormula's error string if the column held unparseable leftovers.
    // Both were then shown to the student as the เฉลย.
    const [skeleton] = buildAssignmentAttempt(assignment, [essayQuestion()])
    expect(skeleton.correct_answer).not.toBe('undefined')
    expect(skeleton.correct_answer).not.toBe('สูตรไม่ถูกต้อง')
  })

  it('leaves the answer pending for a teacher rather than scoring it', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [essayQuestion()])
    expect(gradeEssay(skeleton.correct_answer, 'พลังงานจลน์เปลี่ยนเป็นพลังงานศักย์')).toEqual({
      id: 'a1', is_correct: null, score: 0,
    })
    expect(gradeEssay(skeleton.correct_answer, '')).toEqual({ id: 'a1', is_correct: null, score: 0 })
    expect(gradeEssay(skeleton.correct_answer, null)).toEqual({ id: 'a1', is_correct: null, score: 0 })
  })

  it('leaves an attempt stored before the fix pending too, not wrong', () => {
    // Rows written by the old numeric fall-through still hold what it
    // evaluated. Grading keys on question_type, not on what was frozen in, so
    // they come out pending instead of a silent zero.
    for (const frozen of ['undefined', 'สูตรไม่ถูกต้อง']) {
      expect(gradeEssay(frozen, 'คำตอบของนักเรียน')).toEqual({ id: 'a1', is_correct: null, score: 0 })
    }
  })

  it('gives nothing away to a student who types the frozen string', () => {
    // The text comparison at the bottom of gradeAnswer would have called this
    // a perfect answer.
    for (const frozen of ['undefined', 'สูตรไม่ถูกต้อง']) {
      expect(gradeEssay(frozen, frozen)).toEqual({ id: 'a1', is_correct: null, score: 0 })
    }
  })
})
