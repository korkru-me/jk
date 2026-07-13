import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PrintWorksheet } from '@/components/exam/print-worksheet'
import type { Question } from '@/lib/types'

export const metadata = { title: 'พิมพ์ใบงาน — KorKru' }

export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // No explicit created_by filter — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all) already scopes this to owner or co-teacher.
  const { data: assignment } = await supabase
    .from('assignments')
    .select('*, classrooms(name, id)')
    .eq('id', id)
    .maybeSingle()

  if (!assignment) notFound()

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .in('id', assignment.question_ids)

  const classroomId = (assignment as any).classrooms?.id
  const { data: memberships } = await supabase
    .from('classroom_students')
    .select('student_id, users!inner(id, full_name)')
    .eq('classroom_id', classroomId)

  const students = (memberships ?? []).map((m: any) => ({
    studentId: m.users.id,
    studentName: m.users.full_name,
  }))

  return (
    <div className="p-8 print:p-0">
      <div className="mb-6 print:hidden flex items-center justify-between no-print">
        <div>
          <h1 className="text-xl font-bold">พิมพ์ใบงาน: {assignment.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {students.length} คน · {(questions ?? []).length} ข้อ
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          🖨️ พิมพ์ (Ctrl+P)
        </button>
      </div>

      <PrintWorksheet
        assignmentId={id}
        assignmentTitle={assignment.title}
        classroomName={(assignment as any).classrooms?.name ?? ''}
        questions={(questions ?? []) as Question[]}
        students={students}
      />
    </div>
  )
}
