'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { randomizeVariables, evaluateFormula } from '@/lib/math/evaluator'
import type { Question, Variable } from '@/lib/types'

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

  // Check student is in classroom
  const { data: membership } = await supabase
    .from('classroom_students')
    .select('id')
    .eq('classroom_id', assignment.classroom_id)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!membership) return { error: 'คุณไม่ได้อยู่ในห้องเรียนนี้' }

  // Check deadline
  if (assignment.end_at && new Date(assignment.end_at) < new Date()) {
    return { error: 'หมดเวลาส่งแล้ว' }
  }

  // Return existing in-progress submission
  const { data: existing } = await supabase
    .from('submissions')
    .select('id, status')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (existing) {
    if (existing.status === 'submitted' || existing.status === 'graded') {
      return { submissionId: existing.id, alreadySubmitted: true }
    }
    return { submissionId: existing.id }
  }

  // Fetch questions
  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .in('id', assignment.question_ids)

  if (!questions || questions.length === 0) return { error: 'ไม่พบโจทย์' }

  // Create submission
  const { data: submission, error: subError } = await supabase
    .from('submissions')
    .insert({
      assignment_id: assignmentId,
      student_id: user.id,
      max_score: questions.length,
      status: 'in_progress',
    })
    .select('id')
    .single()

  if (subError) return { error: subError.message }

  // Randomize values per question and persist answers skeleton
  const answers = questions.map((q: Question) => {
    const randomValues = randomizeVariables(q.variables as Variable[])
    const correctAnswer = evaluateFormula(q.answer_formula, randomValues)
    return {
      submission_id: submission.id,
      question_id: q.id,
      random_values: randomValues,
      correct_answer: String(correctAnswer),
      max_score: 1,
    }
  })

  await supabase.from('submission_answers').insert(answers)

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
    .select('*')
    .eq('submission_id', submissionId)

  if (!answers) return { error: 'ไม่พบคำตอบ' }

  // Auto-grade: compare student_answer vs correct_answer with tolerance
  const updates = answers.map((a: any) => {
    const studentVal = parseFloat(a.student_answer ?? '')
    const correctVal = parseFloat(a.correct_answer ?? '')
    let isCorrect = false
    let score = 0

    if (!isNaN(studentVal) && !isNaN(correctVal)) {
      const tolerance = Math.abs(correctVal) * 0.01 // 1% tolerance
      isCorrect = Math.abs(studentVal - correctVal) <= Math.max(tolerance, 0.001)
      score = isCorrect ? a.max_score : 0
    } else if (a.student_answer && a.correct_answer) {
      // MCQ: exact string match
      isCorrect = a.student_answer.trim() === a.correct_answer.trim()
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
