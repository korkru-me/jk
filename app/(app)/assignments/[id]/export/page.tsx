import { createClient } from '@/lib/supabase/server'
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: assignment } = await supabase
    .from('assignments')
    .select('*, classrooms(name, id)')
    .eq('id', id)
    .eq('created_by', user.id)
    .maybeSingle()

  if (!assignment) notFound()

  const classroomId = (assignment as any).classrooms?.id

  const [{ data: questions }, membershipsResult] = await Promise.all([
    supabase.from('questions').select('*').in('id', assignment.question_ids),
    classroomId
      ? supabase
          .from('classroom_students')
          .select('student_id, users!inner(id, full_name)')
          .eq('classroom_id', classroomId)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const students = ((membershipsResult as any).data ?? []).map((m: any) => ({
    id: m.users.id,
    name: m.users.full_name,
  }))

  return (
    <ExportClient
      assignment={assignment as Assignment & { classrooms: { name: string } | null }}
      questions={(questions ?? []) as Question[]}
      students={students}
      assignmentId={id}
    />
  )
}
