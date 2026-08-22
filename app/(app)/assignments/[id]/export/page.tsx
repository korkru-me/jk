import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { notFound, redirect } from 'next/navigation'
import type { Assignment, Question } from '@/lib/types'
import { ExportClient } from './_components/export-client'

export const metadata = { title: 'ส่งออก & พิมพ์ — KorKru' }

export default async function ExportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  // No explicit created_by filter — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all) already scopes this to owner or co-teacher.
  const { data: assignment } = await supabase
    .from('assignments')
    .select('*, classrooms(name, id)')
    .eq('id', id)
    .maybeSingle()

  if (!assignment) notFound()

  const classroomId = (assignment as any).classrooms?.id

  const [{ data: questionRows }, membershipsResult] = await Promise.all([
    supabase.from('questions').select('*').in('id', assignment.question_ids),
    classroomId
      ? supabase
          .from('classroom_students')
          .select('student_id, users!inner(id, full_name)')
          .eq('classroom_id', classroomId)
      : Promise.resolve({ data: [] as any[] }),
  ])

  // `.in()` doesn't preserve the assignment's question order — the printed
  // sheet and its หัวข้อ headings depend on it.
  const byId = new Map(((questionRows ?? []) as Question[]).map(q => [q.id, q]))
  const questions = (assignment.question_ids as string[])
    .map(qid => byId.get(qid))
    .filter((q): q is Question => !!q)

  const students = ((membershipsResult as any).data ?? []).map((m: any) => ({
    id: m.users.id,
    name: m.users.full_name,
  }))

  return (
    <ExportClient
      assignment={assignment as Assignment & { classrooms: { name: string } | null }}
      questions={questions}
      students={students}
      assignmentId={id}
    />
  )
}
