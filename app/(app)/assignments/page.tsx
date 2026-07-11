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
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*, classrooms(name)')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    const list = (assignments ?? []) as AssignmentRow[]
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

  const { data: published } = cids.length > 0
    ? await supabase
        .from('assignments').select('*, classrooms(name)')
        .in('classroom_id', cids).eq('status', 'published').order('created_at', { ascending: false })
    : { data: [] }

  const pList = (published ?? []) as AssignmentRow[]
  const pIds = pList.map(a => a.id)

  const { data: mySubs } = pIds.length > 0
    ? await supabase
        .from('submissions').select('assignment_id, id, status, total_score, max_score')
        .in('assignment_id', pIds).eq('student_id', user.id)
    : { data: [] }

  const mySubMap: Record<string, { id: string; status: string; total_score: number | null; max_score: number }> = {}
  for (const s of mySubs ?? []) mySubMap[(s as any).assignment_id] = s as any

  return <ExamDashboard assignments={pList} subCountMap={{}} isStudent mySubMap={mySubMap} />
}
