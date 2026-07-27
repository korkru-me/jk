'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { randomizeVariables, evaluateFormula, evaluatePartsChained } from '@/lib/math/evaluator'
import { getMyOrgId } from '@/lib/actions/org'
import { isAttemptExpired } from '@/lib/grading'
import { getBlankType } from '@/lib/fill-blank'
import type { Question, Variable, LogicRule, SubmittedFile } from '@/lib/types'

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function startSubmission(assignmentId: string, accessCode?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  // Check assignment is published and accessible
  const { data: assignment } = await supabase
    .from('assignments')
    .select('*')
    .eq('id', assignmentId)
    .eq('status', 'published')
    .maybeSingle()

  if (!assignment) return { error: 'ไม่พบชุดข้อสอบ' }

  if (assignment.start_at && new Date(assignment.start_at) > new Date()) {
    return { error: 'ยังไม่ถึงเวลาเปิดสอบ' }
  }

  // Check student is in one of the classrooms this assignment is linked to
  // (not just the legacy single classroom_id column — an assignment may now
  // target multiple classrooms via assignment_classrooms).
  const { data: links } = await supabase
    .from('assignment_classrooms')
    .select('classroom_id')
    .eq('assignment_id', assignmentId)
  const classroomIds = (links ?? []).map((l: any) => l.classroom_id)

  const { data: membership } = classroomIds.length > 0
    ? await supabase
        .from('classroom_students')
        .select('id')
        .eq('student_id', user.id)
        .in('classroom_id', classroomIds)
        .maybeSingle()
    : { data: null }

  if (!membership) return { error: 'คุณไม่ได้อยู่ในห้องเรียนนี้' }

  // Check deadline — a per-student extension overrides the assignment's end_at
  const { data: extension } = await supabase
    .from('assignment_extensions')
    .select('extended_end_at')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()

  const effectiveEndAt = extension?.extended_end_at ?? assignment.end_at
  if (effectiveEndAt && new Date(effectiveEndAt) < new Date()) {
    return { error: 'หมดเวลาส่งแล้ว' }
  }

  // Return existing in-progress submission, or decide on a retry
  const { data: existing } = await supabase
    .from('submissions')
    .select('id, status, attempt_number, started_at')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  let attemptNumber = 1
  if (existing) {
    if (existing.status === 'in_progress') {
      if (!isAttemptExpired(existing.started_at, assignment.duration_minutes)) {
        return { submissionId: existing.id }
      }
      // Time ran out while this attempt sat abandoned (e.g. the student
      // closed the tab mid-exam and came back much later) — finalize it
      // with whatever was answered instead of resuming into a countdown
      // that's already at zero, then fall through to the normal
      // retry/attempt-limit logic below as if it had just been submitted.
      await gradeAndFinalizeSubmission(supabase, existing.id, user.id, { enforceWorkImage: false })
    }
    // submitted / graded: retry up to max_attempts. Exercises are unlimited
    // when not set; exams fall back to single-attempt for legacy rows saved
    // before max_attempts was configurable for exam type.
    const attemptLimit = assignment.max_attempts ?? (assignment.type === 'exercise' ? null : 1)
    if (attemptLimit && existing.attempt_number >= attemptLimit) {
      return { submissionId: existing.id, alreadySubmitted: true }
    }
    attemptNumber = existing.attempt_number + 1
  }

  // Access code is only checked when creating a genuinely new attempt —
  // resuming an in-progress submission (handled above) never re-prompts.
  if (assignment.access_code) {
    if (!accessCode || accessCode.trim() !== assignment.access_code) {
      return {
        error: accessCode ? 'รหัสผ่านไม่ถูกต้อง' : 'กรุณากรอกรหัสผ่านก่อนเริ่มทำ',
        requiresAccessCode: true,
      }
    }
  }

  // Fetch questions
  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .in('id', assignment.question_ids)

  if (!questions || questions.length === 0) return { error: 'ไม่พบโจทย์' }
  const questionsById = new Map(questions.map((q: Question) => [q.id, q]))

  // Question order: the natural order is assignment.question_ids itself
  // (the `.in()` fetch above does not preserve it), optionally shuffled
  // per-attempt when shuffle_questions is on. Persisted via order_index so
  // it's stable across reloads/resumes.
  const questionOrder = assignment.shuffle_questions
    ? shuffleArray(assignment.question_ids)
    : assignment.question_ids

  // Pre-compute correct answers and max_score per question
  type AnswerSkeleton = {
    question_id: string
    random_values: Record<string, number>
    correct_answer: string
    max_score: number
    order_index: number
    option_order: number[] | null
  }
  function buildSkeletonBase(q: Question): Omit<AnswerSkeleton, 'order_index' | 'option_order'> {
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
      const scoreAnswer = extraData?.score_answer ?? 1
      const explanationScore = extraData?.explanation_mode !== 'none' ? (extraData?.score_explanation ?? 1) : 0
      if (statements.length > 0) {
        const correctAnswers = [extraData?.correct_answer, ...statements.map(s => s.correct_answer)]
        return {
          question_id: q.id, random_values: {},
          correct_answer: 'TF:' + JSON.stringify(correctAnswers.map(b => b ? 'true' : 'false')),
          max_score: scoreAnswer * correctAnswers.length + explanationScore,
        }
      }
      return { question_id: q.id, random_values: {}, correct_answer: extraData?.correct_answer ? 'true' : 'false', max_score: scoreAnswer + explanationScore }
    }

    if (q.question_type === 'fill_blank') {
      const blanks: import('@/lib/types').FillBlankItem[] = extraData?.blanks ?? []
      const answers = blanks.map((b) => getBlankType(extraData, b) === 'text' ? '' : b.answer)
      return { question_id: q.id, random_values: {}, correct_answer: 'FILL:' + JSON.stringify(answers), max_score: blanks.length || 1 }
    }

    if (q.question_type === 'ordering') {
      const items: import('@/lib/types').OrderingItem[] = extraData?.items ?? []
      return { question_id: q.id, random_values: {}, correct_answer: 'ORDER:' + JSON.stringify(items.map((i) => i.id)), max_score: items.length || 1 }
    }

    // File-upload: no meaningful correct answer to precompute — grading
    // (see gradeAndFinalizeSubmission below) branches explicitly on
    // question_type instead of a correct_answer prefix, since "correct" here
    // just means "the student attached at least one file".
    if (q.question_type === 'file_upload') {
      return { question_id: q.id, random_values: {}, correct_answer: '', max_score: 1 }
    }

    if (parts && parts.length > 1) {
      const answers = evaluatePartsChained(parts, randomValues)
      return { question_id: q.id, random_values: randomValues, correct_answer: JSON.stringify(answers.map(String)), max_score: parts.length }
    }

    const formula = parts?.[0]?.formula ?? q.answer_formula
    return { question_id: q.id, random_values: randomValues, correct_answer: String(evaluateFormula(formula, randomValues)), max_score: 1 }
  }

  // A question referenced by assignment.question_ids may have since been
  // deleted — skip dangling ids instead of crashing the whole attempt.
  const skeletons: AnswerSkeleton[] = questionOrder
    .filter((qid: string) => questionsById.has(qid))
    .map((qid: string, orderIndex: number) => {
      const q = questionsById.get(qid) as Question
      const optionOrder = assignment.shuffle_options && q.question_type === 'mcq' && q.mcq_options
        ? shuffleArray((q.mcq_options as unknown[]).map((_, i) => i))
        : null

      return { ...buildSkeletonBase(q), order_index: orderIndex, option_order: optionOrder }
    })

  const totalMaxScore = skeletons.reduce((sum, s) => sum + s.max_score, 0)

  const orgId = await getMyOrgId()
  if (!orgId) return { error: 'ไม่พบข้อมูลสถาบัน' }

  // Create submission with correct total max_score
  const { data: submission, error: subError } = await supabase
    .from('submissions')
    .insert({
      org_id: orgId,
      assignment_id: assignmentId,
      student_id: user.id,
      max_score: totalMaxScore,
      status: 'in_progress',
      attempt_number: attemptNumber,
    })
    .select('id')
    .single()

  if (subError) return { error: subError.message }

  const { error: answersError } = await supabase.from('submission_answers').insert(
    skeletons.map(s => ({ ...s, org_id: orgId, submission_id: submission.id }))
  )
  if (answersError) return { error: answersError.message }

  return { submissionId: submission.id }
}

export async function saveAnswer(submissionAnswerId: string, studentAnswer: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  // Verify ownership
  const { data: sa } = await supabase
    .from('submission_answers')
    .select('id, submission_id, submissions(student_id, status, started_at, assignments(duration_minutes))')
    .eq('id', submissionAnswerId)
    .maybeSingle()

  if (!sa) return { error: 'ไม่พบคำตอบ' }
  const sub = (sa as any).submissions
  if (sub?.student_id !== user.id) return { error: 'ไม่มีสิทธิ์' }
  if (sub?.status !== 'in_progress') return { error: 'ส่งงานแล้ว' }

  // Server-side time-limit enforcement — the exam-taking UI only
  // auto-submits via a client-side setInterval, which a tampered client
  // could stall to keep saving answers past the allotted duration.
  const durationMinutes = sub?.assignments?.duration_minutes
  if (durationMinutes) {
    const deadline = new Date(sub.started_at).getTime() + durationMinutes * 60_000
    if (Date.now() > deadline) return { error: 'หมดเวลาทำข้อสอบแล้ว' }
  }

  const { error } = await supabase
    .from('submission_answers')
    .update({ student_answer: studentAnswer })
    .eq('id', submissionAnswerId)

  if (error) return { error: error.message }
  return { success: true }
}

// One image per answer part, keyed by the same positional `partIndex` used
// for student_answer (see handlePartAnswerChange in exam-client.tsx) — not
// by answer_parts[].id.
export async function saveWorkImage(submissionAnswerId: string, partIndex: number, url: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: sa } = await supabase
    .from('submission_answers')
    .select('id, work_images, submissions(student_id, status, started_at, assignments(duration_minutes))')
    .eq('id', submissionAnswerId)
    .maybeSingle()

  if (!sa) return { error: 'ไม่พบคำตอบ' }
  const sub = (sa as any).submissions
  if (sub?.student_id !== user.id) return { error: 'ไม่มีสิทธิ์' }
  if (sub?.status !== 'in_progress') return { error: 'ส่งงานแล้ว' }

  const durationMinutes = sub?.assignments?.duration_minutes
  if (durationMinutes) {
    const deadline = new Date(sub.started_at).getTime() + durationMinutes * 60_000
    if (Date.now() > deadline) return { error: 'หมดเวลาทำข้อสอบแล้ว' }
  }

  const current: (string | null)[] = Array.isArray((sa as any).work_images) ? [...(sa as any).work_images] : []
  while (current.length <= partIndex) current.push(null)
  current[partIndex] = url

  const { error } = await supabase
    .from('submission_answers')
    .update({ work_images: current })
    .eq('id', submissionAnswerId)

  if (error) return { error: error.message }
  return { success: true }
}

// Persists a student's `file_upload` answer — the full attached-files array,
// JSON-stringified into the generic `student_answer` text column (same
// encoding spirit as ordering's/fill_blank's JSON arrays, just with object
// elements instead of strings). Mirrors saveAnswer/saveWorkImage's
// ownership + time-limit re-check.
export async function saveFileSubmission(submissionAnswerId: string, files: SubmittedFile[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: sa } = await supabase
    .from('submission_answers')
    .select('id, submission_id, submissions(student_id, status, started_at, assignments(duration_minutes))')
    .eq('id', submissionAnswerId)
    .maybeSingle()

  if (!sa) return { error: 'ไม่พบคำตอบ' }
  const sub = (sa as any).submissions
  if (sub?.student_id !== user.id) return { error: 'ไม่มีสิทธิ์' }
  if (sub?.status !== 'in_progress') return { error: 'ส่งงานแล้ว' }

  const durationMinutes = sub?.assignments?.duration_minutes
  if (durationMinutes) {
    const deadline = new Date(sub.started_at).getTime() + durationMinutes * 60_000
    if (Date.now() > deadline) return { error: 'หมดเวลาทำข้อสอบแล้ว' }
  }

  const { error } = await supabase
    .from('submission_answers')
    .update({ student_answer: JSON.stringify(files) })
    .eq('id', submissionAnswerId)

  if (error) return { error: error.message }
  return { success: true }
}

// Shared by submitSubmission (student-initiated) and startSubmission's
// stale-attempt handling (server-initiated, when a resumed in-progress
// attempt's time limit already elapsed). `enforceWorkImage` is only turned
// on for the student-initiated path — a forced finalize of an abandoned,
// expired attempt shouldn't block on a requirement the student can no
// longer satisfy.
async function gradeAndFinalizeSubmission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submissionId: string,
  studentId: string,
  opts: { enforceWorkImage: boolean }
): Promise<{ error?: string; success?: true; totalScore?: number }> {
  const { data: submission } = await supabase
    .from('submissions')
    .select('*, assignments(duration_minutes, end_at, require_work_image)')
    .eq('id', submissionId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (!submission) return { error: 'ไม่พบการสอบ' }
  if (submission.status !== 'in_progress') return { error: 'ส่งงานแล้ว' }

  const { data: answers } = await supabase
    .from('submission_answers')
    .select('*, questions(answer_tolerance, answer_parts, question_type, extra_data, requires_work_image)')
    .eq('submission_id', submissionId)

  if (!answers) return { error: 'ไม่พบคำตอบ' }

  // Server-side defense-in-depth: the exam UI already blocks submission
  // client-side when a required work-image is missing, but a tampered
  // client could call this action directly. The assignment-level
  // require_work_image is the teacher's per-assignment override (asked at
  // creation time) — false switches the requirement off entirely.
  const workImageEnforced = opts.enforceWorkImage && ((submission as any).assignments?.require_work_image ?? true)
  const missingWorkImage = workImageEnforced && answers.some((a: any) => {
    if (a.questions?.question_type !== 'written' || !a.questions?.requires_work_image) return false
    const parts: unknown[] = a.questions?.answer_parts ?? []
    const requiredCount = parts.length > 0 ? parts.length : 1
    const images: (string | null)[] = Array.isArray(a.work_images) ? a.work_images : []
    for (let i = 0; i < requiredCount; i++) {
      if (!images[i]) return true
    }
    return false
  })
  if (missingWorkImage) return { error: 'กรุณาแนบรูปวิธีทำให้ครบทุกข้อก่อนส่งคำตอบ' }

  function gradeValue(studentVal: number, correctVal: number, storedTolerance: number): boolean {
    const tolerance = storedTolerance < 0
      ? Math.abs(correctVal) * (Math.abs(storedTolerance) / 100)
      : storedTolerance
    return Math.abs(studentVal - correctVal) <= tolerance
  }

  // Auto-grade: compare student_answer vs correct_answer with tolerance
  const updates = answers.map((a: any) => {
    const correctAns: string = a.correct_answer ?? ''
    const studentAns: string = a.student_answer ?? ''

    // File-upload grading — there's no meaningful "correct answer" to
    // compare against (unlike every other type below, which keys off a
    // correct_answer prefix), so this branches explicitly on question_type
    // instead. Full credit iff the student attached at least one file;
    // zero files = zero credit. No partial/manual review in this version.
    if (a.questions?.question_type === 'file_upload') {
      let files: unknown[] = []
      try { files = studentAns ? JSON.parse(studentAns) : [] } catch { files = [] }
      const submitted = Array.isArray(files) && files.length > 0
      return { id: a.id, is_correct: submitted, score: submitted ? a.max_score : 0 }
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
      return { id: a.id, is_correct: isCorrect, score: isCorrect ? scoreAnswer : 0 }
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
      return { id: a.id, is_correct: correctCount === correctAnswers.length, score: correctCount * scoreAnswer }
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
      const correctAnswers: string[] = JSON.parse(correctAns.slice(5))
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
        const ca = correctAnswers[i]?.trim() ?? ''
        const sa = (studentAnswers[i] ?? '').trim()
        const cs = blanks[i]?.case_sensitive ?? false
        const isBlankCorrect = type === 'dropdown' ? sa === ca : (cs ? sa === ca : sa.toLowerCase() === ca.toLowerCase())
        if (isBlankCorrect) autoCorrect++
      }
      return { id: a.id, is_correct: hasManual ? null : autoCorrect === autoCount, score: autoCorrect }
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
      return { id: a.id, is_correct: correctPositions === correctOrder.length, score: correctPositions }
    }

    const isMultiPart = correctAns.startsWith('[')

    if (isMultiPart) {
      const correctAnswers: string[] = JSON.parse(correctAns)
      let studentAnswers: string[] = []
      try { studentAnswers = JSON.parse(studentAns || '[]') } catch { studentAnswers = [] }

      const parts: Array<{ tolerance: number }> = a.questions?.answer_parts ?? []
      let correctCount = 0
      for (let i = 0; i < correctAnswers.length; i++) {
        const sv = parseFloat(studentAnswers[i] ?? '')
        const cv = parseFloat(correctAnswers[i] ?? '')
        const tol = parts[i]?.tolerance ?? a.questions?.answer_tolerance ?? 0.1
        if (!isNaN(sv) && !isNaN(cv) && gradeValue(sv, cv, tol)) correctCount++
      }
      return { id: a.id, is_correct: correctCount === correctAnswers.length, score: correctCount }
    }

    // Single-part (backwards compat)
    const studentVal = parseFloat(studentAns)
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
  })

  // Batch update answers
  for (const u of updates) {
    await supabase
      .from('submission_answers')
      .update({ is_correct: u.is_correct, score: u.score })
      .eq('id', u.id)
  }

  const totalScore = updates.reduce((sum: number, u: any) => sum + u.score, 0)

  const { error } = await supabase
    .from('submissions')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      total_score: totalScore,
    })
    .eq('id', submissionId)

  if (error) return { error: error.message }

  revalidatePath(`/submissions/${submissionId}`)
  return { success: true, totalScore }
}

export async function submitSubmission(submissionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  return gradeAndFinalizeSubmission(supabase, submissionId, user.id, { enforceWorkImage: true })
}

export async function getSubmissionWithAnswers(submissionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('submissions')
    .select(`
      *,
      assignments(*, classrooms(name)),
      submission_answers(*, questions(*))
    `)
    .eq('id', submissionId)
    .maybeSingle()

  return data
}
