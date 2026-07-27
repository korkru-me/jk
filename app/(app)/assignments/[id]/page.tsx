import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import type { Assignment, Question } from '@/lib/types'
import { selectOfficialAttempt } from '@/lib/scoring'
import { AssignmentDetailClient } from './_components/assignment-detail-client'

export const metadata = { title: 'ชุดข้อสอบ — KorKru' }

const NOT_STARTED_SENTINEL = '1970-01-01T00:00:00.000Z'

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
  const { data: { user } } = await supabase.auth.getUser()
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

  const [{ data: questions }, { data: submissions }, { data: classroomLinks }] = await Promise.all([
    supabase
      .from('questions')
      .select('id, title, question_type, difficulty, question_text')
      .in('id', a.question_ids),
    supabase
      .from('submissions')
      .select('id, student_id, status, total_score, max_score, submitted_at, started_at, attempt_number, users(full_name)')
      .eq('assignment_id', id)
      .order('submitted_at', { ascending: false }),
    admin
      .from('assignment_classrooms')
      .select('classroom_id')
      .eq('assignment_id', id),
  ])

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
  const attemptsByStudent = new Map<string, SubmissionRow[]>()
  for (const s of (submissions ?? []) as unknown as SubmissionRow[]) {
    const arr = attemptsByStudent.get(s.student_id) ?? []
    arr.push(s)
    attemptsByStudent.set(s.student_id, arr)
  }
  const bestByStudent = new Map<string, SubmissionRow>()
  for (const [studentId, attempts] of attemptsByStudent) {
    const normalized = attempts.map(s => ({ ...s, attempt_number: s.attempt_number ?? 1 }))
    const official = selectOfficialAttempt(normalized, a.score_strategy)
    if (official) {
      bestByStudent.set(studentId, { ...official.representative, total_score: official.total_score, max_score: official.max_score })
    }
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
    />
  )
}
