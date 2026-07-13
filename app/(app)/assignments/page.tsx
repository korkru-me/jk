import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Assignment } from '@/lib/types'
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

  if (isTeacher) {
    // Own assignments + assignments for classrooms co-taught with
    // admin/manage permission (RLS also allows this via
    // assignments_co_teacher_all, but selecting explicitly avoids relying on
    // policy OR-combination order and keeps this query self-documenting).
    const { data: coTeaching } = await supabase
      .from('classroom_co_teachers')
      .select('classroom_id')
      .eq('user_id', user.id)
      .in('permission', ['admin', 'manage'])
    const coTeachingClassroomIds = (coTeaching ?? []).map((r: any) => r.classroom_id)

    const { data: coTaughtLinks } = coTeachingClassroomIds.length > 0
      ? await supabase.from('assignment_classrooms').select('assignment_id').in('classroom_id', coTeachingClassroomIds)
      : { data: [] }
    const coTaughtAssignmentIds = Array.from(new Set((coTaughtLinks ?? []).map((l: any) => l.assignment_id)))

    const [{ data: ownAssignments }, { data: coTaughtAssignments }] = await Promise.all([
      supabase
        .from('assignments')
        .select('*, classrooms(name)')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false }),
      coTaughtAssignmentIds.length > 0
        ? supabase.from('assignments').select('*, classrooms(name)').in('id', coTaughtAssignmentIds).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ])

    const seen = new Set<string>()
    const list: AssignmentRow[] = []
    for (const a of [...(ownAssignments ?? []), ...(coTaughtAssignments ?? [])]) {
      if (!seen.has(a.id)) { seen.add(a.id); list.push(a as AssignmentRow) }
    }
    const ids = list.map(a => a.id)

    const { data: subs } = ids.length > 0
      ? await supabase.from('submissions').select('assignment_id').in('assignment_id', ids)
      : { data: [] }

    const subCountMap: Record<string, number> = {}
    for (const s of subs ?? []) subCountMap[(s as any).assignment_id] = (subCountMap[(s as any).assignment_id] ?? 0) + 1

    return <ExamDashboard assignments={list} subCountMap={subCountMap} isStudent={false} />
  }

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

  const { data: mySubs } = pIds.length > 0
    ? await supabase
        .from('submissions').select('assignment_id, id, status, total_score, max_score, attempt_number')
        .in('assignment_id', pIds).eq('student_id', user.id)
    : { data: [] }

  // An assignment may have multiple attempts (exercise type) — keep the
  // best-scoring attempt, tie-broken by the most recent one, for the badge.
  const mySubMap: Record<string, { id: string; status: string; total_score: number | null; max_score: number }> = {}
  for (const s of (mySubs ?? []) as any[]) {
    const prev = mySubMap[s.assignment_id] as (typeof s | undefined)
    if (!prev || (s.total_score ?? -1) > (prev.total_score ?? -1) ||
        ((s.total_score ?? -1) === (prev.total_score ?? -1) && s.attempt_number > prev.attempt_number)) {
      mySubMap[s.assignment_id] = s
    }
  }

  return <ExamDashboard assignments={pList} subCountMap={{}} isStudent mySubMap={mySubMap} />
}
