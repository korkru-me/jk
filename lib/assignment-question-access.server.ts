import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Assignment, Question } from '@/lib/types'

type AssignmentQuestionRefs = Pick<Assignment, 'created_by' | 'org_id' | 'question_ids'> & {
  /** Present for stored assignments; omitted while validating a normal create. */
  id?: string
}

type AssignmentQuestionLoadResult =
  | {
      questions: Question[]
      missingQuestionIds: string[]
      duplicateQuestionCount: number
    }
  | { error: string }

/**
 * Load the exact question set after the caller has authorized access to the
 * assignment itself.
 *
 * Manager routes first prove `canManageAssignment`; student routes first prove
 * the assignment was handed to that student; create uses the authenticated
 * user as `created_by`. A question belongs in this context only when the
 * creator owns it, it is public, it belongs to the assignment organization,
 * or it was explicitly shared to that organization. This stable provenance
 * lets every authorized manager resolve the same set even when private-question
 * RLS differs between the assignment owner and a co-teacher.
 *
 * Never return arbitrary stored UUIDs: older or tampered assignment rows must
 * not become a cross-tenant question read through the service role.
 */
export async function loadAssignmentQuestionsByProvenance(
  assignment: AssignmentQuestionRefs,
): Promise<AssignmentQuestionLoadResult> {
  const uniqueQuestionIds = [...new Set(assignment.question_ids)]
  const duplicateQuestionCount = assignment.question_ids.length - uniqueQuestionIds.length
  if (uniqueQuestionIds.length === 0) {
    return { questions: [], missingQuestionIds: [], duplicateQuestionCount }
  }

  const admin = createAdminClient()
  const [
    { data: candidateQuestions, error: questionsError },
    { data: shares, error: sharesError },
    measurementResult,
  ] = await Promise.all([
    admin
      .from('questions')
      .select('*')
      .in('id', uniqueQuestionIds),
    admin
      .from('question_shares')
      .select('question_id')
      .eq('org_id', assignment.org_id)
      .in('question_id', uniqueQuestionIds),
    assignment.id
      ? admin
          .from('education_research_measurements')
          .select('project_id, snapshot_question_ids')
          .eq('assignment_id', assignment.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (questionsError || sharesError || measurementResult.error) {
    return { error: 'โหลดโจทย์ของงานนี้ไม่สำเร็จ กรุณาลองใหม่' }
  }

  const sharedQuestionIds = new Set((shares ?? []).map(row => row.question_id as string))
  const measurement = measurementResult.data as {
    project_id: string
    snapshot_question_ids: string[]
  } | null
  const isExactResearchSnapshot = measurement != null
    && measurement.snapshot_question_ids.length === assignment.question_ids.length
    && measurement.snapshot_question_ids.every((id, index) => id === assignment.question_ids[index])
  const allowedQuestions = ((candidateQuestions ?? []) as Question[]).filter(question => (
    question.is_research_snapshot
      ? isExactResearchSnapshot
        && question.research_snapshot_project_id === measurement?.project_id
        && question.created_by === assignment.created_by
        && question.org_id === assignment.org_id
      : question.created_by === assignment.created_by
        || question.visibility === 'public'
        || (
          question.org_id === assignment.org_id
          && (question.visibility === 'organization' || question.visibility === 'school')
        )
        || sharedQuestionIds.has(question.id)
  ))
  const questionsById = new Map(allowedQuestions.map(question => [question.id, question]))

  const missingQuestionIds = uniqueQuestionIds.filter(id => !questionsById.has(id))
  const questions = uniqueQuestionIds
    .map(id => questionsById.get(id))
    .filter((question): question is Question => question !== undefined)

  return { questions, missingQuestionIds, duplicateQuestionCount }
}
