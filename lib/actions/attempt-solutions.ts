'use server'

import { getAuthUser } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  loadAttemptSolutionItems,
  loadSolutionRelease,
  SOLUTION_RELEASE_ASSIGNMENT_FIELDS,
  type SolutionReleaseAssignment,
} from '@/lib/attempt-solutions-server'
import type { AttemptSolutionItem } from '@/lib/attempt-solutions'

export interface AttemptSolutions {
  items: AttemptSolutionItem[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_FOUND = 'ไม่พบผลงานนี้'
const LOAD_FAILED = 'โหลดเฉลยไม่สำเร็จ — ปิดหน้าต่างนี้แล้วกด “ดูเฉลยวิธีทำ” อีกครั้ง'

/**
 * The เฉลยวิธีทำ behind the summary page's ดูเฉลยวิธีทำ button: every ข้อ of
 * one attempt, for the student who made it and nobody else.
 *
 * Nothing the button's presence implies is trusted. The attempt is read with
 * an exact owner filter, and whether the เฉลย is open is decided again here
 * from the database — so an attempt still being worked on elsewhere, a งาน
 * reopened by a later deadline, or a teacher who has just unticked the setting
 * all turn the request away, and a withheld เฉลย is never serialized at all.
 *
 * Service role, because students may not read `questions` rows under RLS (the
 * policy that used to allow it handed over every column, this เฉลย included);
 * the reads stay inside the one verified attempt.
 */
export async function getAttemptSolutions(
  submissionId: string,
): Promise<{ data: AttemptSolutions } | { error: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (typeof submissionId !== 'string' || !UUID.test(submissionId)) return { error: NOT_FOUND }

  const admin = createAdminClient()
  const { data: submission, error } = await admin
    .from('submissions')
    .select(`id, status, assignments(${SOLUTION_RELEASE_ASSIGNMENT_FIELDS})`)
    .eq('id', submissionId)
    .eq('student_id', user.id)
    .maybeSingle()
  if (error) {
    console.error('[attempt-solutions] submission read failed:', error)
    return { error: LOAD_FAILED }
  }
  if (!submission) return { error: NOT_FOUND }
  if (submission.status === 'in_progress') return { error: 'ส่งคำตอบรอบนี้ก่อน จึงจะดูเฉลยวิธีทำได้' }

  const assignment = (Array.isArray(submission.assignments)
    ? submission.assignments[0]
    : submission.assignments) as SolutionReleaseAssignment | null | undefined
  if (!assignment) return { error: NOT_FOUND }

  const release = await loadSolutionRelease(admin, assignment, user.id)
  if (release.state !== 'open') return { error: 'เฉลยวิธีทำของงานนี้ยังไม่เปิดให้ดู' }

  const items = await loadAttemptSolutionItems(admin, submissionId)
  if (!items) return { error: LOAD_FAILED }
  return { data: { items } }
}
