import { randomizeVariables, evaluateFormula, evaluatePartsChained, evaluateStudentAnswer } from '@/lib/math/evaluator'
import { getBlankType, acceptedAnswers, isBlankCorrect } from '@/lib/fill-blank'
import type { Assignment, AnswerPart, Question, Variable, LogicRule } from '@/lib/types'

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// A question's point value before any assignment-level custom override —
// same formula used both when an attempt starts (to seed submission_answers.
// max_score) and when grading (to know how much to rescale a raw score by,
// so a custom override changes the ceiling without silently changing which
// answers count as correct). Must stay identical in both places: when no
// override is set, this being equal to the stored max_score is exactly what
// keeps grading unchanged from before this feature existed.
export function naturalMaxScore(
  questionType: string,
  extraData: any,
  answerParts: unknown[] | null,
  matchingPairCount = 0,
): number {
  if (questionType === 'true_false') {
    const statements: unknown[] = extraData?.statements ?? []
    const scoreAnswer: number = extraData?.score_answer ?? 1
    const explanationScore = extraData?.explanation_mode !== 'none' ? (extraData?.score_explanation ?? 1) : 0
    if (statements.length > 0) return scoreAnswer * (statements.length + 1) + explanationScore
    return scoreAnswer + explanationScore
  }
  if (questionType === 'fill_blank') {
    const blanks: unknown[] = extraData?.blanks ?? []
    return blanks.length || 1
  }
  if (questionType === 'ordering') {
    const items: unknown[] = extraData?.items ?? []
    return items.length || 1
  }
  if (questionType === 'matching') {
    // Matching pairs live in mcq_options rather than extra_data (see
    // MatchingPair in lib/types.ts), so the count comes in explicitly — one
    // point per pair.
    return matchingPairCount || 1
  }
  if (questionType === 'file_upload') return 1
  if (questionType === 'composite') {
    const parts: any[] = extraData?.parts ?? []
    if (parts.length === 0) return 1
    return parts.reduce((sum, p) => sum + (typeof p?.score === 'number' && p.score > 0 ? p.score : 1), 0)
  }
  if (answerParts && answerParts.length > 1) return answerParts.length
  return 1
}

export type AssignmentAttemptSkeleton = {
  question_id: string
  random_values: Record<string, number>
  correct_answer: string
  max_score: number
  order_index: number
  option_order: number[] | null
}

function buildSkeletonBase(q: Question): Omit<AssignmentAttemptSkeleton, 'order_index' | 'option_order'> {
  const extraData = (q as any).extra_data as any
  const randomValues = randomizeVariables(
    q.variables as Variable[],
    (q.logic_rules ?? []) as LogicRule[],
    {
      formula: (q as any).answer_parts?.[0]?.formula ?? q.answer_formula,
      answerStep: extraData?.answer_step ?? 0,
      pythagoreanGroups: extraData?.pythagorean_groups ?? [],
    }
  )
  const parts = (q as any).answer_parts as import('@/lib/types').AnswerPart[] | null

  if (q.question_type === 'true_false') {
    const statements: import('@/lib/types').TrueFalseStatement[] = extraData?.statements ?? []
    // 'select_matching' re-targets what counts as "the answer": the student
    // ticks matching statements instead of judging each one, so the target
    // is `select_target === 'wrong'` ? the false statements : the true ones
    // — flipped here once, so the rest of grading (TF: comparison below)
    // stays byte-for-byte the same as classic 'judge_each' mode.
    const flip = extraData?.answer_mode === 'select_matching' && extraData?.select_target === 'wrong'
    const target = (isTrue: boolean) => (flip ? !isTrue : isTrue)
    if (statements.length > 0) {
      const correctAnswers = [target(!!extraData?.correct_answer), ...statements.map(s => target(s.correct_answer))]
      return {
        question_id: q.id, random_values: {},
        correct_answer: 'TF:' + JSON.stringify(correctAnswers.map(b => b ? 'true' : 'false')),
        max_score: naturalMaxScore(q.question_type, extraData, null),
      }
    }
    return { question_id: q.id, random_values: {}, correct_answer: target(!!extraData?.correct_answer) ? 'true' : 'false', max_score: naturalMaxScore(q.question_type, extraData, null) }
  }

  if (q.question_type === 'fill_blank') {
    const blanks: import('@/lib/types').FillBlankItem[] = extraData?.blanks ?? []
    const answers = blanks.map((b) => getBlankType(extraData, b) === 'text' ? [] : acceptedAnswers(b))
    return { question_id: q.id, random_values: {}, correct_answer: 'FILL:' + JSON.stringify(answers), max_score: naturalMaxScore(q.question_type, extraData, null) }
  }

  if (q.question_type === 'ordering') {
    const items: import('@/lib/types').OrderingItem[] = extraData?.items ?? []
    return { question_id: q.id, random_values: {}, correct_answer: 'ORDER:' + JSON.stringify(items.map((i) => i.id)), max_score: naturalMaxScore(q.question_type, extraData, null) }
  }

  // Matching: the answer is which right-hand label belongs to each left-hand
  // prompt, in the pairs' authored order. Storing the label rather than the
  // pair's index is what makes two identically-labelled right-hand options
  // interchangeable, which is the behaviour a teacher expects when they reuse
  // a label across pairs.
  if (q.question_type === 'matching') {
    const pairs = (q.mcq_options ?? []) as unknown as import('@/lib/types').MatchingPair[]
    return {
      question_id: q.id,
      random_values: {},
      correct_answer: 'MATCH:' + JSON.stringify(pairs.map((p) => p.right_text)),
      max_score: naturalMaxScore(q.question_type, extraData, null, pairs.length),
    }
  }

  // Composite: each part is graded independently by re-dispatching into
  // its own type's comparison rule (see the 'COMP:' branch below), so the
  // correct answer captures one { type, correct, ... } record per part —
  // a 'fill_blank' part whose blank is manually-graded ('text' type)
  // records an empty `correct` array, the same "pending" signal FILL:
  // uses for a manual blank.
  if (q.question_type === 'composite') {
    const compParts: import('@/lib/types').CompositePart[] = extraData?.parts ?? []
    const answers = compParts.map((p) => {
      const score = typeof p.score === 'number' && p.score > 0 ? p.score : 1
      if (p.type === 'true_false') {
        // Grouped sub-question (ก/ข/ค/ง choices, from the "ถูก-ผิดแบบชุด"
        // page) — target is which choices the student should tick,
        // resolved the same way as the standalone select_matching mode.
        if (Array.isArray(p.choices) && p.choices.length > 0) {
          const flip = p.select_target === 'wrong'
          const correct = p.choices.map((c) => ((flip ? !c.correct_answer : c.correct_answer) ? 'true' : 'false'))
          return { type: 'true_false', correct, score }
        }
        return { type: 'true_false', correct: p.correct_answer ? 'true' : 'false', score }
      }
      if (p.type === 'fill_blank') {
        const blank = p.blanks?.[0]
        const manual = !blank || getBlankType(undefined, blank) === 'text'
        return {
          type: 'fill_blank',
          correct: manual ? [] : acceptedAnswers(blank),
          blankType: blank?.type ?? 'fixed',
          caseSensitive: blank?.case_sensitive ?? false,
          score,
        }
      }
      // Index rather than text, for the same reason as a standalone mcq above.
      if (p.type === 'mcq') return { type: 'mcq', correct: `MCQ:${(p.options ?? []).findIndex((o) => o.is_correct)}`, score }
      if (p.type === 'ordering') return { type: 'ordering', correct: (p.items ?? []).map((it) => it.id), score }
      return { type: p.type, correct: null, score }
    })
    return { question_id: q.id, random_values: {}, correct_answer: 'COMP:' + JSON.stringify(answers), max_score: naturalMaxScore(q.question_type, extraData, null) }
  }

  // Multiple choice: the answer is which option, recorded as its position in
  // the question's own mcq_options.
  //
  // Position, not the option's text, for two reasons. Two options can carry
  // the same words — a picture-only option has none at all — and comparing
  // text then credits the wrong one. And an mcq question keeps `answer_formula`
  // empty, so without a branch of its own it fell through to the numeric path
  // below and every attempt was stored with the correct answer "undefined",
  // which no student answer could ever match.
  //
  // The MCQ: prefix follows the same convention as TF:/ORDER:/MATCH: and is
  // what tells a stored index apart from an option whose text is "2".
  if (q.question_type === 'mcq') {
    const options = (q.mcq_options ?? []) as import('@/lib/types').MCQOption[]
    const correctIndex = options.findIndex((o) => o.is_correct)
    return {
      question_id: q.id,
      random_values: {},
      correct_answer: correctIndex >= 0 ? `MCQ:${correctIndex}` : '',
      max_score: naturalMaxScore(q.question_type, extraData, null),
    }
  }

  // File-upload: no meaningful correct answer to precompute — grading
  // (see gradeAndFinalizeSubmission below) branches explicitly on
  // question_type instead of a correct_answer prefix, since "correct" here
  // just means "the student attached at least one file".
  if (q.question_type === 'file_upload') {
    return { question_id: q.id, random_values: {}, correct_answer: '', max_score: naturalMaxScore(q.question_type, extraData, null) }
  }

  // Essay: a person reads it. There is no answer to precompute and nothing a
  // comparison could ever be run against, so none is recorded — grading
  // branches on question_type, the way file_upload just above does, and the
  // row stays pending until a teacher scores it.
  //
  // Without a branch of its own an essay fell through to the numeric path
  // below and was stored with whatever evaluating its answer_formula produced.
  // That column is `not null default ''` and an essay always saves it empty,
  // which mathjs evaluates to nothing at all — so the frozen correct answer
  // read "undefined", exactly the mcq bug again. (An essay carrying leftover
  // unparseable text there froze evaluateFormula's error string
  // 'สูตรไม่ถูกต้อง' instead; both are answers no writing can match.) Every
  // student was marked wrong, and wherever results are visible that string was
  // shown to them as the เฉลย. Keying this on question_type instead of a new
  // prefix is also what lets an attempt stored back then grade as pending now.
  if (q.question_type === 'essay') {
    return { question_id: q.id, random_values: {}, correct_answer: '', max_score: naturalMaxScore(q.question_type, extraData, null) }
  }

  if (parts && parts.length > 1) {
    const answers = evaluatePartsChained(parts, randomValues)
    return { question_id: q.id, random_values: randomValues, correct_answer: JSON.stringify(answers.map(String)), max_score: naturalMaxScore(q.question_type, extraData, parts) }
  }

  const formula = parts?.[0]?.formula ?? q.answer_formula
  return { question_id: q.id, random_values: randomValues, correct_answer: String(evaluateFormula(formula, randomValues)), max_score: naturalMaxScore(q.question_type, extraData, parts) }
}

// Pre-computes each question's correct answer, max_score, and per-attempt
// question/option order. Shared by a real attempt (startSubmission, which
// persists the result into submission_answers) and a teacher's read-only
// preview (the /assignments/[id]/preview route, which never persists) —
// keeping this in one place is what guarantees a preview actually matches
// what a real attempt would ask.
export function buildAssignmentAttempt(
  assignment: Pick<Assignment, 'question_ids' | 'shuffle_questions' | 'shuffle_options' | 'question_points' | 'random_question_count'>,
  questions: Question[]
): AssignmentAttemptSkeleton[] {
  const questionsById = new Map(questions.map((q) => [q.id, q]))

  // A deleted question can leave a dangling id behind. Remove those before
  // sampling so a missing row never consumes one of the sampled slots. The
  // real start flow separately refuses to start if fewer than the configured
  // count remain available.
  const availableQuestionIds = assignment.question_ids.filter((qid) => questionsById.has(qid))
  const requestedCount = assignment.random_question_count
  const sampleCount = Number.isInteger(requestedCount) && (requestedCount as number) > 0
    ? Math.min(requestedCount as number, availableQuestionIds.length)
    : availableQuestionIds.length

  // Sampling and ordering are deliberately separate. A teacher may want each
  // student to receive a different subset while keeping the authored order
  // within that subset. `shuffle_questions` still controls that second step.
  // The result is persisted once in submission_answers, so resuming/reloading
  // the same attempt never calls this again or draws another set.
  const sampledQuestionIds = sampleCount < availableQuestionIds.length
    ? (() => {
        const sampled = new Set(shuffleArray(availableQuestionIds).slice(0, sampleCount))
        return availableQuestionIds.filter((qid) => sampled.has(qid))
      })()
    : availableQuestionIds

  const questionOrder = assignment.shuffle_questions
    ? shuffleArray(sampledQuestionIds)
    : sampledQuestionIds

  const questionPoints = assignment.question_points

  return questionOrder
    .map((qid, orderIndex) => {
      const q = questionsById.get(qid) as Question
      // A matching question is only a question if the right-hand column is
      // scrambled, so it shuffles regardless of the assignment's
      // shuffle_options setting (which is about MCQ choices). Frozen into
      // option_order either way, so the student sees one stable order.
      const shufflesOptions = q.question_type === 'matching'
        || (assignment.shuffle_options && q.question_type === 'mcq')
      const optionOrder = shufflesOptions && q.mcq_options
        ? shuffleArray((q.mcq_options as unknown[]).map((_, i) => i))
        : null

      const base = buildSkeletonBase(q)
      const override = questionPoints?.[qid]
      return {
        ...base,
        max_score: override ?? base.max_score,
        order_index: orderIndex,
        option_order: optionOrder,
      }
    })
}

// Rescales a raw auto-graded score to a custom point override. `storedMax`
// equals `structuralMax` exactly when no override was set (see
// naturalMaxScore above), so this is a no-op for every pre-existing
// assignment — it only kicks in once a teacher sets question_points.
export function scaleScore(rawScore: number, structuralMax: number, storedMax: number): number {
  if (structuralMax <= 0 || structuralMax === storedMax) return rawScore
  return Math.round((rawScore / structuralMax) * storedMax * 100) / 100
}

// ค่าคลาดเคลื่อนที่ยอมรับ: ลบ = คิดเป็นเปอร์เซ็นต์ของเฉลย, บวก = ค่าสัมบูรณ์
// export ออกไปเพราะหน้าตัวอย่างโจทย์ของครูตัดสินถูก/ผิดด้วยกติกาเดียวกันนี้ —
// เดิมมันมีสูตร 1% ของตัวเอง คำว่า "ถูก" ในตัวอย่างจึงไม่ตรงกับตอนตรวจจริง
export function gradeValue(studentVal: number, correctVal: number, storedTolerance: number): boolean {
  const tolerance = storedTolerance < 0
    ? Math.abs(correctVal) * (Math.abs(storedTolerance) / 100)
    : storedTolerance
  return Math.abs(studentVal - correctVal) <= tolerance
}

export type GradableAnswer = {
  id: string
  correct_answer: string
  student_answer: string | null
  max_score: number
  questions: {
    question_type: string
    answer_tolerance: number
    answer_parts: AnswerPart[] | null
    extra_data: any
  } | null
}

export type GradedAnswer = { id: string; is_correct: boolean | null; score: number }

// Auto-grades one answer: compares student_answer vs correct_answer (with
// tolerance for numeric types). Pure and side-effect free — shared by the
// real grading path (gradeAndFinalizeSubmission, which persists the result)
// and a teacher's read-only preview (which only displays it). Keeping this
// in one place is what guarantees a preview's score actually matches what a
// real submission would be graded as.
export function gradeAnswer(a: GradableAnswer): GradedAnswer {
  const correctAns: string = a.correct_answer ?? ''
  const studentAns: string = a.student_answer ?? ''

  // File-upload grading — there's no meaningful "correct answer" to compare
  // against (unlike every other type below, which keys off a correct_answer
  // prefix), so this branches explicitly on question_type instead. Full
  // credit iff the student attached at least one file; zero files = zero
  // credit. No partial/manual review in this version.
  if (a.questions?.question_type === 'file_upload') {
    let files: unknown[] = []
    try { files = studentAns ? JSON.parse(studentAns) : [] } catch { files = [] }
    const submitted = Array.isArray(files) && files.length > 0
    return { id: a.id, is_correct: submitted, score: submitted ? a.max_score : 0 }
  }

  // Essay grading — only a teacher can score writing, so the row is left
  // pending (is_correct null, score 0) until they do, the same signal
  // FILL_MANUAL: and a text-type fill_blank blank use below. Keyed on
  // question_type rather than a correct_answer prefix, which is what makes an
  // attempt stored before essays had a branch — one whose frozen answer reads
  // "undefined" or 'สูตรไม่ถูกต้อง' — come out pending here instead of wrong,
  // and stops a student who happened to type either string from scoring full
  // marks off the text comparison at the bottom.
  if (a.questions?.question_type === 'essay') {
    return { id: a.id, is_correct: null, score: 0 }
  }

  // True/False grading
  if (correctAns === 'true' || correctAns === 'false') {
    let studentTf = studentAns
    if (studentAns.startsWith('{')) {
      try { studentTf = JSON.parse(studentAns).answer ?? studentAns } catch { /* keep raw */ }
    }
    const extraData = a.questions?.extra_data as any
    const scoreAnswer: number = extraData?.score_answer ?? 1
    const isCorrect = studentTf.trim() === correctAns
    const structuralMax = naturalMaxScore('true_false', extraData, null)
    return { id: a.id, is_correct: isCorrect, score: scaleScore(isCorrect ? scoreAnswer : 0, structuralMax, a.max_score) }
  }

  // Multi-statement True/False grading
  if (correctAns.startsWith('TF:')) {
    const correctAnswers: string[] = JSON.parse(correctAns.slice(3))
    let studentAnswers: string[] = []
    try { studentAnswers = JSON.parse(studentAns || '{}').answers ?? [] } catch { /* keep empty */ }
    const extraData = a.questions?.extra_data as any
    const scoreAnswer: number = extraData?.score_answer ?? 1
    let correctCount = 0
    for (let i = 0; i < correctAnswers.length; i++) {
      if ((studentAnswers[i] ?? '').trim() === correctAnswers[i]) correctCount++
    }
    const structuralMax = naturalMaxScore('true_false', extraData, null)
    return { id: a.id, is_correct: correctCount === correctAnswers.length, score: scaleScore(correctCount * scoreAnswer, structuralMax, a.max_score) }
  }

  // Fill-blank grading — legacy fully-manual submissions (pre-dates per-blank types)
  if (correctAns.startsWith('FILL_MANUAL:')) {
    return { id: a.id, is_correct: null, score: 0 }
  }

  // Fill-blank grading — each blank is graded per its own type. 'text'
  // blanks can't be auto-graded (score 0, pending); 'fixed'/'dropdown'
  // blanks are compared immediately. The question is only marked
  // is_correct (non-null) once every blank is auto-gradable — a mix of
  // types leaves it pending while still banking the auto-graded score.
  if (correctAns.startsWith('FILL:')) {
    const extraData = a.questions?.extra_data as any
    const correctAnswers: string[][] = JSON.parse(correctAns.slice(5))
    const blanks: import('@/lib/types').FillBlankItem[] = extraData?.blanks ?? []
    let studentAnswers: string[] = []
    try { studentAnswers = JSON.parse(studentAns || '[]') } catch { /* keep empty */ }

    let hasManual = false
    let autoCount = 0
    let autoCorrect = 0
    for (let i = 0; i < correctAnswers.length; i++) {
      const type = getBlankType(extraData, blanks[i])
      if (type === 'text') { hasManual = true; continue }
      autoCount++
      const cs = blanks[i]?.case_sensitive ?? false
      if (isBlankCorrect(studentAnswers[i] ?? '', correctAnswers[i] ?? [], type, cs)) autoCorrect++
    }
    const structuralMax = naturalMaxScore('fill_blank', extraData, null)
    return { id: a.id, is_correct: hasManual ? null : autoCorrect === autoCount, score: scaleScore(autoCorrect, structuralMax, a.max_score) }
  }

  // Composite grading — each part re-dispatches into its own type's
  // comparison rule; a 'fill_blank' part with an empty `correct` array is
  // its manually-graded 'text' sub-type, same "leave pending" behavior as
  // FILL: above.
  if (correctAns.startsWith('COMP:')) {
    type CompCorrectPart = { type: string; correct: unknown; blankType?: import('@/lib/types').FillBlankType; caseSensitive?: boolean; score?: number }
    const correctParts: CompCorrectPart[] = JSON.parse(correctAns.slice(5))
    let studentAnswers: string[] = []
    try { studentAnswers = JSON.parse(studentAns || '[]') } catch { /* keep empty */ }

    let hasManual = false
    let earned = 0
    for (let i = 0; i < correctParts.length; i++) {
      const cp = correctParts[i]
      const sa = studentAnswers[i] ?? ''
      const partScore = typeof cp.score === 'number' && cp.score > 0 ? cp.score : 1
      if (cp.type === 'fill_blank' && Array.isArray(cp.correct) && cp.correct.length === 0) {
        hasManual = true
        continue
      }
      // Grouped true/false sub-question — `correct` is one 'true'/'false'
      // per choice, student ticks are stored the same way (JSON array of
      // 'true'/'false' strings), scored proportionally like the standalone
      // multi-statement true_false grading above.
      if (cp.type === 'true_false' && Array.isArray(cp.correct)) {
        const targets = cp.correct as string[]
        let studentChoices: string[] = []
        try { studentChoices = JSON.parse(sa || '[]') } catch { /* keep empty */ }
        let matched = 0
        for (let j = 0; j < targets.length; j++) {
          if ((studentChoices[j] ?? '').trim() === targets[j]) matched++
        }
        earned += targets.length > 0 ? (matched / targets.length) * partScore : 0
        continue
      }
      let ok = false
      if (cp.type === 'true_false' || cp.type === 'mcq') {
        ok = sa === cp.correct
      } else if (cp.type === 'fill_blank') {
        ok = isBlankCorrect(sa, (cp.correct as string[]) ?? [], cp.blankType ?? 'fixed', !!cp.caseSensitive)
      } else if (cp.type === 'ordering') {
        const correctOrder = (cp.correct as string[]) ?? []
        let studentOrder: string[] = []
        try { studentOrder = JSON.parse(sa || '[]') } catch { studentOrder = [] }
        ok = correctOrder.length > 0 && studentOrder.length === correctOrder.length && correctOrder.every((id, idx) => studentOrder[idx] === id)
      }
      if (ok) earned += partScore
    }
    const structuralMax = naturalMaxScore('composite', a.questions?.extra_data, null)
    const isFullyCorrect = Math.round(earned * 1000) === Math.round(structuralMax * 1000)
    return { id: a.id, is_correct: hasManual ? null : isFullyCorrect, score: scaleScore(earned, structuralMax, a.max_score) }
  }

  // Multiple-choice grading — compares which option was picked. Attempts
  // started before the answer became an index stored the option's text; those
  // fall through to the text comparison at the bottom, so an old submission
  // still grades the way it did when it was taken.
  if (correctAns.startsWith('MCQ:')) {
    return {
      id: a.id,
      is_correct: studentAns.trim() === correctAns,
      score: studentAns.trim() === correctAns ? a.max_score : 0,
    }
  }

  // Matching grading — one point per correctly paired prompt. The pair count
  // comes from the frozen correct answer rather than the question, so a pair
  // added after this attempt started can't change what it is scored out of.
  if (correctAns.startsWith('MATCH:')) {
    const correctRights: string[] = JSON.parse(correctAns.slice(6))
    let studentRights: string[] = []
    try { studentRights = JSON.parse(studentAns || '[]') } catch { /* keep empty */ }
    let matched = 0
    for (let i = 0; i < correctRights.length; i++) {
      if ((studentRights[i] ?? '').trim() === correctRights[i].trim()) matched++
    }
    const structuralMax = naturalMaxScore('matching', a.questions?.extra_data, null, correctRights.length)
    return { id: a.id, is_correct: matched === correctRights.length, score: scaleScore(matched, structuralMax, a.max_score) }
  }

  // Ordering grading
  if (correctAns.startsWith('ORDER:')) {
    const correctOrder: string[] = JSON.parse(correctAns.slice(6))
    let studentOrder: string[] = []
    try { studentOrder = JSON.parse(studentAns || '[]') } catch { /* keep empty */ }
    let correctPositions = 0
    for (let i = 0; i < correctOrder.length; i++) {
      if (studentOrder[i] === correctOrder[i]) correctPositions++
    }
    const structuralMax = naturalMaxScore('ordering', a.questions?.extra_data, null)
    return { id: a.id, is_correct: correctPositions === correctOrder.length, score: scaleScore(correctPositions, structuralMax, a.max_score) }
  }

  const isMultiPart = correctAns.startsWith('[')

  if (isMultiPart) {
    const correctAnswers: string[] = JSON.parse(correctAns)
    let studentAnswers: string[] = []
    try { studentAnswers = JSON.parse(studentAns || '[]') } catch { studentAnswers = [] }

    const parts: Array<{ tolerance: number }> = a.questions?.answer_parts ?? []
    let correctCount = 0
    for (let i = 0; i < correctAnswers.length; i++) {
      // Students may answer with a plain number or a simple arithmetic
      // expression (e.g. "9+1") — see evaluateStudentAnswer.
      const sv = evaluateStudentAnswer(studentAnswers[i] ?? '') ?? NaN
      const cv = parseFloat(correctAnswers[i] ?? '')
      const tol = parts[i]?.tolerance ?? a.questions?.answer_tolerance ?? 0.1
      if (!isNaN(sv) && !isNaN(cv) && gradeValue(sv, cv, tol)) correctCount++
    }
    const structuralMax = naturalMaxScore(a.questions?.question_type ?? '', a.questions?.extra_data, parts)
    return { id: a.id, is_correct: correctCount === correctAnswers.length, score: scaleScore(correctCount, structuralMax, a.max_score) }
  }

  // Single-part (backwards compat) — students may answer with a plain
  // number or a simple arithmetic expression (e.g. "9+1").
  const studentVal = evaluateStudentAnswer(studentAns) ?? NaN
  const correctVal = parseFloat(correctAns)
  let isCorrect = false
  let score = 0

  if (!isNaN(studentVal) && !isNaN(correctVal)) {
    const tol: number = a.questions?.answer_tolerance ?? 0.1
    isCorrect = gradeValue(studentVal, correctVal, tol)
    score = isCorrect ? a.max_score : 0
  } else if (studentAns && correctAns) {
    isCorrect = studentAns.trim() === correctAns.trim()
    score = isCorrect ? a.max_score : 0
  }

  return { id: a.id, is_correct: isCorrect, score }
}
