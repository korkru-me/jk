import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import { selectOfficialAttempt, rescaleToDisplayMax } from '@/lib/scoring'
import { isAttemptExpired } from '@/lib/grading'
import { canStudentViewScore } from '@/lib/result-visibility'
import { ExamDashboard } from './_components/exam-dashboard'

export const metadata = { title: 'ชุดข้อสอบ — KorKru' }

export interface AssignmentRow {
  id: string
  title: string
  question_ids: string[]
  duration_minutes: number | null
  end_at: string | null
  show_results: string
  max_attempts: number | null
  score_strategy: 'best' | 'average' | 'latest'
  display_max_score: number | null
  classrooms: { name: string } | null
}

export default async function AssignmentsPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()

  // Role, memberships, and the student's attempts are independent once the
  // auth user is known. Pull them together instead of waiting on three
  // separate database round trips.
  const [profileRes, membershipsRes, submissionsRes] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).single(),
    admin
      .from('classroom_students')
      .select('classroom_id')
      .eq('student_id', user.id),
    supabase
      .from('submissions')
      .select('assignment_id, id, status, total_score, max_score, attempt_number, started_at, assignments!inner(status)')
      .eq('student_id', user.id)
      .eq('assignments.status', 'published'),
  ])

  const profile = profileRes.data
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'

  // Teachers manage assignments from within each classroom's "งานที่มอบหมาย"
  // tab now — there's no separate cross-classroom list page for them.
  if (isTeacher) redirect('/classrooms')

  // Student view
  const memberships = membershipsRes.data
  const cids = (memberships ?? []).map((m: any) => m.classroom_id)

  // Join assignment_classrooms directly so multi-classroom assignments stay
  // correct without a links -> ids -> assignments waterfall.
  const { data: published } = cids.length > 0
    ? await admin
        .from('assignments')
        .select('id, title, question_ids, duration_minutes, end_at, show_results, max_attempts, score_strategy, display_max_score, classrooms(name), assignment_classrooms!inner(classroom_id)')
        .in('assignment_classrooms.classroom_id', cids)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
    : { data: [] }

  const pList: AssignmentRow[] = (published ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    question_ids: row.question_ids ?? [],
    duration_minutes: row.duration_minutes,
    end_at: row.end_at,
    show_results: row.show_results,
    max_attempts: row.max_attempts,
    score_strategy: row.score_strategy,
    display_max_score: row.display_max_score,
    classrooms: Array.isArray(row.classrooms) ? row.classrooms[0] ?? null : row.classrooms,
  }))
  const publishedIds = new Set(pList.map(a => a.id))
  const rawMySubs = (submissionsRes.data ?? []).filter((s: any) => publishedIds.has(s.assignment_id))

  const displayMaxByAssignment = new Map(pList.map(a => [a.id, a.display_max_score]))
  const mySubs = rescaleToDisplayMax(
    rawMySubs as any[],
    row => displayMaxByAssignment.get(row.assignment_id) ?? null
  )

  // An assignment may have multiple attempts — reduce to the "official"
  // score per the assignment's own score_strategy, for the badge. Also
  // track the highest attempt_number seen so the UI can tell whether
  // retries remain against max_attempts.
  const strategyByAssignment = new Map(pList.map(a => [a.id, a.score_strategy]))
  const durationByAssignment = new Map(pList.map(a => [a.id, a.duration_minutes]))
  const attemptsByAssignment = new Map<string, any[]>()
  const attemptsUsed: Record<string, number> = {}
  const hasInProgress: Record<string, boolean> = {}
  for (const s of mySubs) {
    attemptsUsed[s.assignment_id] = Math.max(attemptsUsed[s.assignment_id] ?? 0, s.attempt_number)
    // An abandoned in-progress attempt whose timer already ran out gets
    // force-finalized by startSubmission() on the next visit rather than
    // resumed — don't offer "ทำต่อ" for it here either.
    if (s.status === 'in_progress' && !isAttemptExpired(s.started_at, durationByAssignment.get(s.assignment_id) ?? null)) {
      hasInProgress[s.assignment_id] = true
    }
    const arr = attemptsByAssignment.get(s.assignment_id) ?? []
    arr.push(s)
    attemptsByAssignment.set(s.assignment_id, arr)
  }
  const mySubMap: Record<string, { id: string; status: string; total_score: number | null; max_score: number }> = {}
  for (const [assignmentId, attempts] of attemptsByAssignment) {
    const official = selectOfficialAttempt(attempts, strategyByAssignment.get(assignmentId) ?? 'best')
    if (official) {
      const assignment = pList.find(row => row.id === assignmentId)
      const scoreVisible = canStudentViewScore(assignment?.show_results, assignment?.end_at)
      mySubMap[assignmentId] = {
        id: official.representative.id,
        status: official.representative.status,
        total_score: scoreVisible ? official.total_score : null,
        max_score: official.max_score,
      }
    }
  }

  return <ExamDashboard assignments={pList} mySubMap={mySubMap} attemptsUsed={attemptsUsed} hasInProgress={hasInProgress} />
}
