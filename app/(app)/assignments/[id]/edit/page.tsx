import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { EditAssignmentForm } from '@/components/assignments/edit-assignment-form'
import type { EditableAssignment, EditableAssignmentQuestion } from '@/components/assignments/edit-assignment-form'

export const metadata = { title: 'แก้ไขชุดข้อสอบ — KorKru' }

export default async function EditAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // No explicit ownership check — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all) already scopes this; a null result means
  // unauthorized and is handled by notFound() below.
  const assignmentQuery = supabase
    .from('assignments')
    .select('id, title, description, question_ids, question_points, display_max_score, start_at, end_at, duration_minutes, max_attempts, type, score_strategy, passing_type, passing_value, show_results')
    .eq('id', id)
    .maybeSingle()

  const [user, { data: assignment }] = await Promise.all([
    getAuthUser(),
    assignmentQuery,
  ])
  if (!user) redirect('/login')

  if (!assignment) notFound()
  const a = assignment as EditableAssignment

  const { data: questionRows } = await supabase
    .from('questions')
    .select('id, title, question_text')
    .in('id', a.question_ids)

  // Preserve the assignment's own question order rather than whatever the
  // `in` query happens to return.
  const questionsById = new Map((questionRows ?? []).map(q => [q.id, q]))
  const questions = a.question_ids
    .map(id => questionsById.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q) as EditableAssignmentQuestion[]

  return (
    <div className="max-w-2xl space-y-6">
      <Link href={`/assignments/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-muted-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> กลับไปหน้าชุดข้อสอบ
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">แก้ไขชุดข้อสอบ</h1>
        <p className="text-sm text-muted-foreground mt-1">{a.title}</p>
      </div>

      <EditAssignmentForm assignment={a} questions={questions} />
    </div>
  )
}
