import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { Assignment, Question } from '@/lib/types'
import { EditAssignmentForm } from '@/components/assignments/edit-assignment-form'

export const metadata = { title: 'แก้ไขชุดข้อสอบ — KorKru' }

export default async function EditAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // No explicit ownership check — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all) already scopes this; a null result means
  // unauthorized and is handled by notFound() below.
  const { data: assignment } = await supabase
    .from('assignments')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!assignment) notFound()
  const a = assignment as Assignment

  const { data: questionRows } = await supabase
    .from('questions')
    .select('id, title, question_text')
    .in('id', a.question_ids)

  // Preserve the assignment's own question order rather than whatever the
  // `in` query happens to return.
  const questionsById = new Map((questionRows ?? []).map(q => [q.id, q]))
  const questions = a.question_ids
    .map(id => questionsById.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q) as Question[]

  return (
    <div className="max-w-2xl space-y-6">
      <Link href={`/assignments/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ChevronLeft className="w-4 h-4" /> กลับไปหน้าชุดข้อสอบ
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">แก้ไขชุดข้อสอบ</h1>
        <p className="text-sm text-gray-500 mt-1">{a.title}</p>
      </div>

      <EditAssignmentForm assignment={a} questions={questions} />
    </div>
  )
}
