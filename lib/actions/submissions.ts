'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { randomizeVariables, evaluateFormula, evaluatePartsChained } from '@/lib/math/evaluator'
import { getMyOrgId } from '@/lib/actions/org'
import type { Question, Variable, LogicRule } from '@/lib/types'

export async function startSubmission(assignmentId: string) {
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
    .select('id, status, attempt_number')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  let attemptNumber = 1
  if (existing) {
    if (existing.status === 'in_progress') {
      return { submissionId: existing.id }
    }
    // submitted / graded: exams stay single-attempt, exercises may retry
    if (assignment.type !== 'exercise') {
      return { submissionId: existing.id, alreadySubmitted: true }
    }
    attemptNumber = existing.attempt_number + 1
  }

  // Fetch questions
  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .in('id', assignment.question_ids)

  if (!questions || questions.length === 0) return { error: 'ไม่พบโจทย์' }

  // Pre-compute correct answers and max_score per question
  type AnswerSkeleton = {
    question_id: string
    random_values: Record<string, number>
    correct_answer: string
    max_score: number
  }
  const skeletons: AnswerSkeleton[] = questions.map((q: Question) => {
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
      const isManual = (extraData?.grading_mode ?? 'auto') === 'manual'
      const prefix = isManual ? 'FILL_MANUAL:' : 'FILL:'
      return { question_id: q.id, random_values: {}, correct_answer: prefix + JSON.stringify(blanks.map((b) => b.answer)), max_score: blanks.length || 1 }
    }

    if (q.question_type === 'ordering') {
      const items: import('@/lib/types').OrderingItem[] = extraData?.items ?? []
      return { question_id: q.id, random_values: {}, correct_answer: 'ORDER:' + JSON.stringify(items.map((i) => i.id)), max_score: items.length || 1 }
    }

    if (parts && parts.length > 1) {
      const answers = evaluatePartsChained(parts, randomValues)
      return { question_id: q.id, random_values: randomValues, correct_answer: JSON.stringify(answers.map(String)), max_score: parts.length }
    }

    const formula = parts?.[0]?.formula ?? q.answer_formula
    return { question_id: q.id, random_values: randomValues, correct_answer: String(evaluateFormula(formula, randomValues)), max_score: 1 }
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

  await supabase.from('submission_answers').insert(
    skeletons.map(s => ({ ...s, org_id: orgId, submission_id: submission.id }))
  )

  return { submissionId: submission.id }
}

export async function saveAnswer(submissionAnswerId: string, studentAnswer: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  // Verify ownership
  const { data: sa } = await supabase
    .from('submission_answers')
    .select('id, submission_id, submissions(student_id, status)')
    .eq('id', submissionAnswerId)
    .maybeSingle()

  if (!sa) return { error: 'ไม่พบคำตอบ' }
  const sub = (sa as any).submissions
  if (sub?.student_id !== user.id) return { error: 'ไม่มีสิทธิ์' }
  if (sub?.status !== 'in_progress') return { error: 'ส่งงานแล้ว' }

  const { error } = await supabase
    .from('submission_answers')
    .update({ student_answer: studentAnswer })
    .eq('id', submissionAnswerId)

  if (error) return { error: error.message }
  return { success: true }
}

export async function submitSubmission(submissionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: submission } = await supabase
    .from('submissions')
    .select('*, assignments(duration_minutes, end_at)')
    .eq('id', submissionId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!submission) return { error: 'ไม่พบการสอบ' }
  if (submission.status !== 'in_progress') return { error: 'ส่งงานแล้ว' }

  const { data: answers } = await supabase
    .from('submission_answers')
    .select('*, questions(answer_tolerance, answer_parts, question_type, extra_data)')
    .eq('submission_id', submissionId)

  if (!answers) return { error: 'ไม่พบคำตอบ' }

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

    // Fill-blank grading
    if (correctAns.startsWith('FILL_MANUAL:')) {
      return { id: a.id, is_correct: null, score: 0 }
    }

    if (correctAns.startsWith('FILL:')) {
      const extraData = a.questions?.extra_data as any
      if ((extraData?.grading_mode ?? 'auto') === 'manual') {
        return { id: a.id, is_correct: null, score: 0 }
      }
      const correctAnswers: string[] = JSON.parse(correctAns.slice(5))
      const blanks: import('@/lib/types').FillBlankItem[] = extraData?.blanks ?? []
      let studentAnswers: string[] = []
      try { studentAnswers = JSON.parse(studentAns || '[]') } catch { /* keep empty */ }
      let correctCount = 0
      for (let i = 0; i < correctAnswers.length; i++) {
        const ca = correctAnswers[i]?.trim() ?? ''
        const sa = (studentAnswers[i] ?? '').trim()
        const cs = blanks[i]?.case_sensitive ?? false
        if (cs ? sa === ca : sa.toLowerCase() === ca.toLowerCase()) correctCount++
      }
      return { id: a.id, is_correct: correctCount === correctAnswers.length, score: correctCount }
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
