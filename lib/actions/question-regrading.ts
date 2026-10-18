'use server'

import { getAuthUser } from '@/lib/auth/server'
import { revalidatePath } from 'next/cache'
import { planQuestionRegrading, questionRegradingReceipt, planVoidQuestion, voidQuestionReceipt, commitVoidQuestion } from '@/lib/question-regrading.server'
import type { QuestionFormData } from './questions'

export async function prepareQuestionUpdate(questionId: string, data: QuestionFormData) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  try {
    const plan = await planQuestionRegrading(questionId, data, user.id)
    return { requiresConfirmation: plan.requiresConfirmation, impact: plan.impact,
      token: plan.requiresConfirmation ? questionRegradingReceipt(plan) : undefined }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'ตรวจผลกระทบของการแก้เฉลยไม่สำเร็จ' }
  }
}

export async function prepareVoidQuestion(assignmentId: string, questionId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  try {
    const plan = await planVoidQuestion(assignmentId, questionId, user.id)
    return { token: voidQuestionReceipt(plan), impact: plan.impact }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'ตรวจผลกระทบของการทำข้อเป็นโมฆะไม่สำเร็จ' }
  }
}

export async function voidAssignmentQuestion(assignmentId: string, questionId: string, token: string, reason: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  try {
    const plan = await planVoidQuestion(assignmentId, questionId, user.id)
    const result = await commitVoidQuestion(plan, token, reason)
    if ('error' in result) return result
    for (const path of ['/assignments', '/classrooms', '/dashboard', `/assignments/${assignmentId}`, `/assignments/${assignmentId}/results`, `/assignments/${assignmentId}/analytics`]) revalidatePath(path)
    for (const submission of plan.changes[0].submissions) revalidatePath(`/submissions/${submission.id}`)
    return result
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'ทำข้อเป็นโมฆะไม่สำเร็จ' }
  }
}
