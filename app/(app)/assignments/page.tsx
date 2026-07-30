import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Assignment } from '@/lib/types'
import { selectOfficialAttempt, rescaleToDisplayMax } from '@/lib/scoring'
import { isAttemptExpired } from '@/lib/grading'
import { ExamDashboard } from './_components/exam-dashboard'

export const metadata = { title: 'ชุดข้อสอบ — KorKru' }

export type AssignmentRow = Assignment & { classrooms: { name: string } | null }

export default async function AssignmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'

  // Teachers manage assignments from within each classroom's "งานที่มอบหมาย"
  // tab now — there's no separate cross-classroom list page for them.
  if (isTeacher) redirect('/classrooms')

  // Student view
  const { data: memberships } = await supabase
    .from('classroom_students').select('classroom_id').eq('student_id', user.id)
  const cids = (memberships ?? []).map((m: any) => m.classroom_id)

  // Route through assignment_classrooms (not the legacy single classroom_id
  // column) so assignments assigned to multiple classrooms are visible too.
  const { data: links } = cids.length > 0
    ? await supabase.from('assignment_classrooms').select('assignment_id').in('classroom_id', cids)
    : { data: [] }
  const assignmentIds = Array.from(new Set((links ?? []).map((l: any) => l.assignment_id)))

  const { data: published } = assignmentIds.length > 0
    ? await supabase
        .from('assignments').select('*, classrooms(name)')
        .in('id', assignmentIds).eq('status', 'published').order('created_at', { ascending: false })
    : { data: [] }

  const pList = (published ?? []) as AssignmentRow[]
  const pIds = pList.map(a => a.id)

  const { data: rawMySubs } = pIds.length > 0
    ? await supabase
        .from('submissions').select('assignment_id, id, status, total_score, max_score, attempt_number, started_at')
        .in('assignment_id', pIds).eq('student_id', user.id)
    : { data: [] }

  const displayMaxByAssignment = new Map(pList.map(a => [a.id, a.display_max_score]))
  const mySubs = rescaleToDisplayMax(
    (rawMySubs ?? []) as any[],
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
      mySubMap[assignmentId] = { id: official.representative.id, status: official.representative.status, total_score: official.total_score, max_score: official.max_score }
    }
  }

  return <ExamDashboard assignments={pList} mySubMap={mySubMap} attemptsUsed={attemptsUsed} hasInProgress={hasInProgress} />
}
