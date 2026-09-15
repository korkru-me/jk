import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { notFound, redirect } from 'next/navigation'
import type { Assignment, Question } from '@/lib/types'
import { officialSubmissionsByStudent, rescaleToDisplayMax } from '@/lib/scoring'
import { AssignmentDetailClient } from './_components/assignment-detail-client'

export const metadata = { title: 'ชุดข้อสอบ — KorKru' }

const NOT_STARTED_SENTINEL = '1970-01-01T00:00:00.000Z'

// Row cap on the "waiting for a teacher" lookup, matching the classroom
// overview's cap so the two never disagree about how they were counted.
const PENDING_REVIEW_ROW_CAP = 1000

export type SubmissionRow = {
  id: string | null
  student_id: string
  status: string
  total_score: number | null
  max_score: number
  submitted_at: string | null
  started_at: string
  attempt_number?: number
  users: { full_name: string } | null
}

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { data: assignment } = await supabase
    .from('assignments')
    .select('*, classrooms(name)')
    .eq('id', id)
    .maybeSingle()

  if (!assignment) notFound()

  const a = assignment as Assignment & { classrooms: { name: string } | null }
  // No explicit ownership check here — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all) already scoped the row above; a null result
  // means unauthorized and is handled by notFound() before this point.

  const admin = createAdminClient()

  // Hand-ins are read with the service role because submissions has no
  // co-teacher RLS policy — its teacher-side policy is scoped to
  // assignments.created_by, so a co-teacher used to see an empty
  // "นักเรียน" tab here. Authorization is stated instead of inherited.
  if (!await canManageAssignment(id, user.id)) notFound()

  const [{ data: questions }, { data: submissions }, { data: classroomLinks }, { data: pendingAnswerRows }] = await Promise.all([
    supabase
      .from('questions')
      .select('id, title, question_type, difficulty, question_text')
      .in('id', a.question_ids),
    admin
      .from('submissions')
      .select('id, student_id, status, total_score, max_score, submitted_at, started_at, attempt_number, users!submissions_student_id_fkey(full_name)')
      .eq('assignment_id', id)
      .order('submitted_at', { ascending: false }),
    admin
      .from('assignment_classrooms')
      .select('classroom_id')
      .eq('assignment_id', id),
    // Auto-grading leaves `is_correct` null exactly on the answers a person
    // has to read — ข้อเขียน, ช่องเติมคำที่ครูตรวจเอง, เหตุผลของถูก/ผิด. Same
    // rule the classroom overview and the submission page use. Capped, so a
    // huge งาน cannot turn this page into a full-table scan; past the cap the
    // count is reported as a floor ("n+").
    admin
      .from('submission_answers')
      .select('submission_id, submissions!inner(assignment_id, status)')
      .eq('submissions.assignment_id', id)
      .neq('submissions.status', 'in_progress')
      .is('is_correct', null)
      .limit(PENDING_REVIEW_ROW_CAP),
  ])

  const pendingSubmissionIds = Array.from(
    new Set((pendingAnswerRows ?? []).map((row: any) => row.submission_id as string))
  )
  const pendingReviewCapped = (pendingAnswerRows?.length ?? 0) >= PENDING_REVIEW_ROW_CAP

  // Re-order questions to match assignment's question_ids order
  const qMap = new Map((questions ?? []).map((q: any) => [q.id, q]))
  const orderedQuestions = a.question_ids.map(qid => qMap.get(qid)).filter(Boolean) as Question[]

  // Full roster of the assignment's linked classroom(s) — admin client to
  // sidestep RLS complexity for a roster read, same approach already used in
  // classrooms/[id]/page.tsx.
  const classroomIds = Array.from(new Set((classroomLinks ?? []).map((l: any) => l.classroom_id)))
  const { data: rosterRows } = classroomIds.length > 0
    ? await admin
        .from('classroom_students')
        .select('student_id, users!inner(id, full_name)')
        .in('classroom_id', classroomIds)
    : { data: [] }

  // A student may have multiple submissions (retries) — reduce to the
  // "official" attempt per the assignment's own score_strategy.
  const rescaledSubmissions = rescaleToDisplayMax(
    (submissions ?? []) as unknown as SubmissionRow[],
    () => a.display_max_score
  )
  const normalizedSubmissions = rescaledSubmissions.map(s => ({ ...s, attempt_number: s.attempt_number ?? 1 }))
  const officialByStudent = officialSubmissionsByStudent(normalizedSubmissions, a.score_strategy)
  const bestByStudent = new Map<string, SubmissionRow>()
  for (const [studentId, official] of officialByStudent) {
    bestByStudent.set(studentId, { ...official.representative, total_score: official.total_score, max_score: official.max_score })
  }

  // Merge: every enrolled student gets a row, even with zero submissions —
  // fixes the previous behavior where non-starters were invisible because
  // this list was built purely from `submissions` rows.
  const seenStudentIds = new Set<string>()
  const roster: SubmissionRow[] = []
  for (const r of (rosterRows ?? []) as any[]) {
    const studentId = r.student_id as string
    if (seenStudentIds.has(studentId)) continue
    seenStudentIds.add(studentId)
    const existing = bestByStudent.get(studentId)
    roster.push(existing ?? {
      id: null,
      student_id: studentId,
      status: 'not_started',
      total_score: null,
      max_score: 0,
      submitted_at: null,
      started_at: NOT_STARTED_SENTINEL,
      users: { full_name: r.users?.full_name ?? '' },
    })
  }
  // Any submission from a student no longer enrolled (e.g. removed from
  // classroom after submitting) still shows up, so scores aren't lost.
  for (const s of bestByStudent.values()) {
    if (!seenStudentIds.has(s.student_id)) roster.push(s)
  }

  return (
    <AssignmentDetailClient
      assignment={a}
      questions={orderedQuestions}
      submissions={roster}
      pendingSubmissionIds={pendingSubmissionIds}
      pendingReviewCapped={pendingReviewCapped}
    />
  )
}
