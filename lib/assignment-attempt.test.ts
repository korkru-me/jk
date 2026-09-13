import { describe, it, expect } from 'vitest'
import {
  buildAssignmentAttempt, buildAttemptQuestion, buildRetryAttempt, gradeAnswer, naturalMaxScore, scaleScore,
  type GradableAnswer, type PreviousAttemptAnswer,
} from './assignment-attempt'
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
  mathInputModes?: Record<string, 'deg' | 'rad'>
}): GradableAnswer {
  return {
    id: 'a1',
    correct_answer: over.correct,
    student_answer: over.student,
    math_input_modes: over.mathInputModes,
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

  it('grades the same trig text from its saved DEG or RAD mode', () => {
    expect(gradeAnswer(answer({
      correct: '0.5',
      student: 'sin(30)',
      mathInputModes: { main: 'deg' },
    })).is_correct).toBe(true)
    expect(gradeAnswer(answer({
      correct: '0.5',
      student: 'sin(pi/6)',
      mathInputModes: { main: 'rad' },
    })).is_correct).toBe(true)
    expect(gradeAnswer(answer({
      correct: '0.5',
      student: 'sin(30)',
      mathInputModes: { main: 'rad' },
    })).is_correct).toBe(false)
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

  it('uses the saved mode of each numeric part independently', () => {
    const parts = [
      { id: 'degrees', tolerance: 0.0001 },
      { id: 'radians', tolerance: 0.0001 },
    ] as AnswerPart[]
    const result = gradeAnswer(answer({
      correct: JSON.stringify(['0.5', '0.5']),
      student: JSON.stringify(['sin(30)', 'sin(pi/6)']),
      maxScore: 2,
      answerParts: parts,
      mathInputModes: { 'part:degrees': 'deg', 'part:radians': 'rad' },
    }))
    expect(result).toMatchObject({ is_correct: true, score: 2 })
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

  // judge_each asks for an explicit ✓ถูก/✗ผิด, so a statement the student never
  // reached is unanswered — it must not be read as 'ผิด' and marked for them.
  it('pays nothing for a statement judge_each left untouched', () => {
    const result = gradeAnswer(answer({
      correct: 'TF:' + JSON.stringify(['true', 'false', 'false']),
      student: JSON.stringify({ answers: ['true'] }),
      questionType: 'true_false',
      extraData: { statements: [{}, {}], score_answer: 1, explanation_mode: 'none' },
      maxScore: 3,
    }))
    expect(result).toMatchObject({ score: 1, is_correct: false })
  })
})

// ─── ถูก-ผิด answered by ticking (answer_mode: 'select_matching') ─────────────
//
// The student sees every statement at once and ticks the ones matching
// select_target, so an untouched statement has been judged rather than skipped
// — the opposite of judge_each above, and the reason the two cannot share one
// comparison.

/** Ticks as TrueFalseSelectMatching writes them: only clicked indices exist. */
function tfTicks(...clicked: number[]): string {
  const answers: (string | null)[] = []
  for (const i of clicked) {
    while (answers.length < i) answers.push(null)
    answers[i] = 'true'
  }
  return JSON.stringify({ answers, explanation: '' })
}

describe('gradeAnswer — ถูก-ผิด แบบติ๊กข้อที่ตรง', () => {
  /** Four statements, of which the first and third are the ones to tick. */
  const KEY = 'TF:' + JSON.stringify(['true', 'false', 'true', 'false'])
  const CONFIG = {
    statements: [{}, {}, {}],
    score_answer: 1,
    explanation_mode: 'none',
    answer_mode: 'select_matching',
  }

  function grade(student: string | null, extra: Record<string, unknown> = {}) {
    return gradeAnswer(answer({
      correct: KEY, student, questionType: 'true_false',
      extraData: { ...CONFIG, ...extra }, maxScore: 4,
    }))
  }

  // The regression: ticking 1 and 3 leaves 2 and 4 unwritten, and reading those
  // as unanswered scored 2 of 4 for a spotless answer.
  it('gives full marks for ticking exactly the right statements', () => {
    expect(grade(tfTicks(0, 2))).toMatchObject({ score: 4, is_correct: true })
  })

  it('docks a statement ticked that should not have been', () => {
    expect(grade(tfTicks(0, 1, 2))).toMatchObject({ score: 3, is_correct: false })
  })

  it('pays nothing for a question the student never opened', () => {
    expect(grade(null)).toMatchObject({ score: 0, is_correct: false })
    expect(grade(JSON.stringify({ answers: [] }))).toMatchObject({ score: 0, is_correct: false })
  })

  it('pays all or nothing when the teacher asked for it', () => {
    expect(grade(tfTicks(0, 2), { choice_scoring: 'all_or_nothing' }))
      .toMatchObject({ score: 4, is_correct: true })
    expect(grade(tfTicks(0), { choice_scoring: 'all_or_nothing' }))
      .toMatchObject({ score: 0, is_correct: false })
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

describe('buildAttemptQuestion, the single-ข้อ builder', () => {
  const options = [
    { text: 'ก', is_correct: false },
    { text: 'ข', is_correct: true },
  ]

  it('freezes the same correct answer buildAssignmentAttempt does', () => {
    const one = buildAttemptQuestion(mcqQuestion(options), { orderIndex: 0, shuffleOptions: false })
    const [whole] = buildAssignmentAttempt(assignment, [mcqQuestion(options)])
    expect(one.correct_answer).toBe(whole.correct_answer)
  })

  // The draw appends after every row already handed out, so this is how the
  // student's sequence is kept — a wrong index here would reorder the attempt.
  it('takes its order_index from the caller', () => {
    expect(buildAttemptQuestion(mcqQuestion(options), { orderIndex: 7, shuffleOptions: false }).order_index)
      .toBe(7)
  })

  it('leaves ปรนัย options in authored order when shuffling is off', () => {
    expect(buildAttemptQuestion(mcqQuestion(options), { orderIndex: 0, shuffleOptions: false }).option_order)
      .toBeNull()
  })

  it('freezes a permutation when shuffling is on', () => {
    const skeleton = buildAttemptQuestion(mcqQuestion(options), { orderIndex: 0, shuffleOptions: true })
    expect([...(skeleton.option_order as number[])].sort()).toEqual([0, 1])
  })

  // A จับคู่ is only a question once its right-hand column is scrambled, so it
  // shuffles regardless of the assignment's ปรนัย setting. Asserted here
  // because the streak path is the one caller that passes shuffleOptions false
  // for every งาน whose teacher left ปรนัย shuffling off.
  it('still scrambles a จับคู่ when ปรนัย shuffling is off', () => {
    const matching = {
      ...mcqQuestion(options),
      question_type: 'matching',
    } as unknown as Question
    const skeleton = buildAttemptQuestion(matching, { orderIndex: 0, shuffleOptions: false })
    expect(skeleton.option_order).not.toBeNull()
  })

  it('applies the assignment\'s point override', () => {
    expect(buildAttemptQuestion(mcqQuestion(options), {
      orderIndex: 0, shuffleOptions: false, pointOverride: 4,
    }).max_score).toBe(4)
  })

  it('falls back to the ข้อ\'s own value with no override', () => {
    const natural = buildAttemptQuestion(mcqQuestion(options), { orderIndex: 0, shuffleOptions: false })
    expect(natural.max_score).toBe(1)
  })
})

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

describe('buildRetryAttempt — what a wrong-only retry re-asks', () => {
  const pool = ['q1', 'q2', 'q3', 'q4'].map((id) => ({
    ...mcqQuestion([
      { text: 'ผิด', is_correct: false },
      { text: 'ถูก', is_correct: true },
    ]),
    id,
  }))

  /** A graded answer row from the previous attempt, defaulted to full marks. */
  function previous(over: Partial<PreviousAttemptAnswer> & { question_id: string }): PreviousAttemptAnswer {
    return {
      random_values: {},
      correct_answer: '1',
      student_answer: '1',
      is_correct: true,
      score: 2,
      max_score: 2,
      teacher_feedback: null,
      order_index: 0,
      option_order: null,
      work_images: null,
      score_edited_by: null,
      score_edited_at: null,
      ...over,
    }
  }

  it('re-asks only the questions that fell short of full marks', () => {
    const { retried, carried } = buildRetryAttempt(assignment, pool, [
      previous({ question_id: 'q1', order_index: 0 }),
      previous({ question_id: 'q2', order_index: 1, is_correct: false, score: 0 }),
      previous({ question_id: 'q3', order_index: 2 }),
      previous({ question_id: 'q4', order_index: 3, is_correct: false, score: 0 }),
    ])

    expect(retried.map((row) => row.question_id)).toEqual(['q2', 'q4'])
    expect(carried.map((row) => row.question_id)).toEqual(['q1', 'q3'])
    expect(carried.every((row) => row.carried_over)).toBe(true)
  })

  it('counts partial credit as short of full marks', () => {
    const { retried } = buildRetryAttempt(assignment, pool, [
      previous({ question_id: 'q1', is_correct: true, score: 1, max_score: 2 }),
    ])

    expect(retried.map((row) => row.question_id)).toEqual(['q1'])
  })

  it('carries a question still waiting on the teacher instead of calling it wrong', () => {
    const { retried, carried } = buildRetryAttempt(assignment, pool, [
      previous({ question_id: 'q1', is_correct: null, score: 0, student_answer: 'เขียนไว้แล้ว' }),
    ])

    expect(retried).toHaveLength(0)
    expect(carried[0].student_answer).toBe('เขียนไว้แล้ว')
    expect(carried[0].score).toBe(0)
  })

  it('keeps the attempt worth the same total as a full attempt', () => {
    const rows = [
      previous({ question_id: 'q1', order_index: 0, max_score: 3, score: 3 }),
      previous({ question_id: 'q2', order_index: 1, max_score: 5, score: 1, is_correct: false }),
    ]
    const { retried, carried } = buildRetryAttempt(assignment, pool, rows)
    const total = [...retried, ...carried].reduce((sum, row) => sum + row.max_score, 0)

    expect(total).toBe(rows.reduce((sum, row) => sum + row.max_score, 0))
  })

  it('preserves the previous attempt\'s question numbering', () => {
    const { retried } = buildRetryAttempt(assignment, pool, [
      previous({ question_id: 'q1', order_index: 0 }),
      previous({ question_id: 'q2', order_index: 1, is_correct: false, score: 0 }),
      previous({ question_id: 'q3', order_index: 2, is_correct: false, score: 0 }),
    ])

    expect(retried.map((row) => row.order_index)).toEqual([1, 2])
  })

  it('re-asks a question with a fresh answer key rather than the frozen one', () => {
    const { retried } = buildRetryAttempt(assignment, pool, [
      previous({ question_id: 'q1', correct_answer: 'ค่าเก่าที่นักเรียนเห็นไปแล้ว', is_correct: false, score: 0 }),
    ])

    expect(retried[0].correct_answer).toBe('MCQ:1')
  })

  it('carries a question that no longer exists instead of dropping its points', () => {
    const { retried, carried } = buildRetryAttempt(assignment, pool, [
      previous({ question_id: 'deleted-question', is_correct: false, score: 0, max_score: 4 }),
    ])

    expect(retried).toHaveLength(0)
    expect(carried[0].max_score).toBe(4)
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

// ─── ถูก-ผิดแบบชุด (grouped true/false) ───────────────────────────────────────
//
// The shape the dedicated "ถูก-ผิดแบบชุด" page saves (see lib/true-false-group.ts):
// a composite whose parts each carry `choices` the student ticks 1+ of. The
// beaker question these are written against offers 7 choices of which 4 are
// correct — the case that used to cap a perfect answer at 4/7.

/** The 7 beakers, with 1, 3, 5 and 6 the ones that rust. */
const BEAKERS = ['1', '2', '3', '4', '5', '6', '7'].map((text, i) => ({
  id: `c${i}`, text, correct_answer: [0, 2, 4, 5].includes(i),
}))

function beakerQuestion(): Question {
  return {
    id: 'q1',
    question_type: 'composite',
    answer_formula: '',
    answer_parts: null,
    variables: [],
    logic_rules: [],
    mcq_options: null,
    extra_data: {
      parts: [{
        id: 'p1',
        type: 'true_false',
        text: 'ตะปูเหล็กที่เกิดสนิมอยู่ในบีกเกอร์หมายเลข',
        score: 0.5,
        choices: BEAKERS,
        select_target: 'correct',
      }],
    },
  } as unknown as Question
}

/** One part's ticks, as CompositeAnswerInput sends them: only the indices the
 *  student actually clicked are written, so anything after the last click is
 *  absent and anything skipped before it is null. */
function ticks(...clicked: number[]): string {
  const arr: (string | null)[] = []
  for (const i of clicked) {
    while (arr.length < i) arr.push(null)
    arr[i] = 'true'
  }
  return JSON.stringify([JSON.stringify(arr)])
}

describe('gradeAnswer — ถูก-ผิดแบบชุด', () => {
  const skeleton = buildAttemptQuestion(beakerQuestion(), { orderIndex: 0, shuffleOptions: false })

  function grade(student: string | null) {
    return gradeAnswer(answer({
      correct: skeleton.correct_answer,
      student,
      questionType: 'composite',
      extraData: beakerQuestion().extra_data,
      maxScore: skeleton.max_score,
    }))
  }

  it('keys every choice, not just the correct ones', () => {
    expect(skeleton.correct_answer).toBe('COMP:' + JSON.stringify([{
      type: 'true_false',
      correct: ['true', 'false', 'true', 'false', 'true', 'true', 'false'],
      score: 0.5,
    }]))
    expect(skeleton.max_score).toBe(0.5)
  })

  // The regression: ticking 1, 3, 5 and 6 leaves 2, 4 and 7 unwritten, and
  // reading those as unanswered rather than as "not ticked" scored 4/7.
  it('gives full marks for ticking exactly the right boxes', () => {
    expect(grade(ticks(0, 2, 4, 5))).toMatchObject({ is_correct: true, score: 0.5 })
  })

  it('gives the same full marks when every box was written out explicitly', () => {
    const explicit = ['true', 'false', 'true', 'false', 'true', 'true', 'false']
    expect(grade(JSON.stringify([JSON.stringify(explicit)]))).toMatchObject({ is_correct: true, score: 0.5 })
  })

  it('docks a box ticked that should not have been', () => {
    // 1, 3, 5, 6 plus a wrong 2 — six of seven judged right.
    expect(grade(ticks(0, 1, 2, 4, 5))).toMatchObject({ is_correct: false, score: 0.5 * 6 / 7 })
  })

  it('docks a correct box left unticked', () => {
    expect(grade(ticks(0, 2, 4))).toMatchObject({ is_correct: false, score: 0.5 * 6 / 7 })
  })

  it('pays nothing for a part the student never answered', () => {
    expect(grade(null)).toMatchObject({ is_correct: false, score: 0 })
    expect(grade(JSON.stringify(['']))).toMatchObject({ is_correct: false, score: 0 })
    expect(grade(JSON.stringify([JSON.stringify([])]))).toMatchObject({ is_correct: false, score: 0 })
  })

  it('scores ticking every box by how many of them wanted ticking', () => {
    expect(grade(ticks(0, 1, 2, 3, 4, 5, 6))).toMatchObject({ is_correct: false, score: 0.5 * 4 / 7 })
  })

  describe('marked all-or-nothing, the way the paper marks it', () => {
    const q = beakerQuestion()
    const parts = (q.extra_data as { parts: Record<string, unknown>[] }).parts
    parts[0].choice_scoring = 'all_or_nothing'
    const strict = buildAttemptQuestion(q, { orderIndex: 0, shuffleOptions: false })

    function gradeStrict(student: string | null) {
      return gradeAnswer(answer({
        correct: strict.correct_answer, student, questionType: 'composite',
        extraData: q.extra_data, maxScore: strict.max_score,
      }))
    }

    it('freezes the rule into the key, so re-marking the question spares work already handed in', () => {
      expect(strict.correct_answer).toContain('"scoring":"all_or_nothing"')
    })

    it('pays a spotless answer in full', () => {
      expect(gradeStrict(ticks(0, 2, 4, 5))).toMatchObject({ is_correct: true, score: 0.5 })
    })

    it('pays nothing for one box out of place', () => {
      expect(gradeStrict(ticks(0, 2, 4))).toMatchObject({ is_correct: false, score: 0 })
      expect(gradeStrict(ticks(0))).toMatchObject({ is_correct: false, score: 0 })
    })
  })

  // select_target: 'wrong' flips the key at build time, so grading never sees
  // the difference — the ticks that earn full marks are the other three.
  it('follows a part that asks which choices are wrong', () => {
    const q = beakerQuestion()
    const parts = (q.extra_data as { parts: { select_target: string }[] }).parts
    parts[0].select_target = 'wrong'
    const flipped = buildAttemptQuestion(q, { orderIndex: 0, shuffleOptions: false })

    const result = gradeAnswer(answer({
      correct: flipped.correct_answer,
      student: ticks(1, 3, 6),
      questionType: 'composite',
      extraData: q.extra_data,
      maxScore: flipped.max_score,
    }))
    expect(result).toMatchObject({ is_correct: true, score: 0.5 })
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

describe('ตารางจำแนก, from attempt to grade', () => {
  const config = {
    columns: [
      { id: 'origin', title: 'จำแนกตามแหล่งกำเนิด', options: ['ธรรมชาติ', 'สังเคราะห์'] },
      { id: 'monomer', title: 'จำแนกตามชนิดของมอนอเมอร์', options: ['โฮโม', 'โค'] },
    ],
    rows: [
      { id: 'r1', text: 'เนื้อหมู', answers: { origin: 0, monomer: 1 } },
      { id: 'r2', text: 'ยางรัดของ', answers: { origin: 1, monomer: 0 } },
    ],
  }

  function classifyQuestion(extra: unknown = config): Question {
    return {
      id: 'q1',
      question_type: 'classify',
      answer_formula: '',
      answer_parts: null,
      variables: [],
      logic_rules: [],
      extra_data: extra,
      mcq_options: null,
    } as unknown as Question
  }

  const grade = (correct: string, student: string | null, extraData: unknown = config, maxScore = 4) =>
    gradeAnswer(answer({ correct, student, questionType: 'classify', extraData, maxScore }))

  it('freezes the key as a grid of option positions, one cell at a time', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [classifyQuestion()])
    expect(skeleton.correct_answer).toBe('CLS:[[0,1],[1,0]]')
    expect(skeleton.max_score).toBe(4)
  })

  it('is worth one point per cell, not per row', () => {
    expect(naturalMaxScore('classify', config, null)).toBe(4)
  })

  it('credits a fully correct grid', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [classifyQuestion()])
    expect(grade(skeleton.correct_answer, '[[0,1],[1,0]]')).toMatchObject({ is_correct: true, score: 4 })
  })

  it('gives part marks for the cells that are right', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [classifyQuestion()])
    // Both of row 1 right, one of row 2 right.
    expect(grade(skeleton.correct_answer, '[[0,1],[0,0]]')).toMatchObject({ is_correct: false, score: 3 })
  })

  it('scores an untouched grid zero without calling it pending', () => {
    // Nothing here is ever waiting on a teacher, unlike อัตนัย or a manual blank.
    const [skeleton] = buildAssignmentAttempt(assignment, [classifyQuestion()])
    expect(grade(skeleton.correct_answer, null)).toMatchObject({ is_correct: false, score: 0 })
    expect(grade(skeleton.correct_answer, '')).toMatchObject({ is_correct: false, score: 0 })
  })

  it('ignores cells the student answered past the end of the key', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [classifyQuestion()])
    expect(grade(skeleton.correct_answer, '[[0,1],[1,0],[1,1]]')).toMatchObject({ is_correct: true, score: 4 })
  })

  it('does not charge for a cell the teacher never keyed', () => {
    // The cell is left out of both the maximum and the grading, so a student
    // who answers everything they were actually asked still scores full marks.
    const partial = { ...config, rows: [config.rows[0], { id: 'r2', text: 'ยางรัดของ', answers: { origin: 1 } }] }
    const [skeleton] = buildAssignmentAttempt(assignment, [classifyQuestion(partial)])
    expect(skeleton.correct_answer).toBe('CLS:[[0,1],[1,-1]]')
    expect(skeleton.max_score).toBe(3)
    expect(grade(skeleton.correct_answer, '[[0,1],[1,0]]', partial, 3)).toMatchObject({ is_correct: true, score: 3 })
    expect(grade(skeleton.correct_answer, '[[0,1],[1,1]]', partial, 3)).toMatchObject({ is_correct: true, score: 3 })
  })

  it('scales to a custom point override', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [classifyQuestion()])
    expect(grade(skeleton.correct_answer, '[[0,1],[1,0]]', config, 10).score).toBe(10)
    expect(grade(skeleton.correct_answer, '[[0,1],[0,0]]', config, 10).score).toBe(7.5)
  })

  it('stays within the question\'s worth after the teacher deletes a column', () => {
    // The frozen key still has two columns; the live config has one. Dividing
    // by the live count would pay out more than the question is worth.
    const [skeleton] = buildAssignmentAttempt(assignment, [classifyQuestion()])
    const narrowed = {
      columns: [config.columns[0]],
      rows: [{ id: 'r1', text: 'เนื้อหมู', answers: { origin: 0 } }, { id: 'r2', text: 'ยางรัดของ', answers: { origin: 1 } }],
    }
    expect(grade(skeleton.correct_answer, '[[0,1],[1,0]]', narrowed, 4).score).toBe(4)
  })

  it('survives a question whose config never came from the form', () => {
    const [skeleton] = buildAssignmentAttempt(assignment, [classifyQuestion({})])
    expect(skeleton.correct_answer).toBe('CLS:[]')
    expect(skeleton.max_score).toBe(1)
    expect(grade(skeleton.correct_answer, '[[0]]', {}, 1)).toMatchObject({ is_correct: false, score: 0 })
  })

  it('does not collide with another type\'s stored key', () => {
    // 'CLS:' has to be unmistakable, the way MCQ: and COMP: are.
    expect(gradeAnswer(answer({ correct: 'CLS:[[0]]', student: 'COMP:[]', questionType: 'classify' })).is_correct).toBe(false)
  })
})

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
