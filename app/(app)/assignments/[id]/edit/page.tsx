import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { fetchBankQuestions, withQuestionPoints, QUESTION_POINT_FIELDS } from '@/lib/question-bank'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { EditAssignmentForm } from '@/components/assignments/edit-assignment-form'
import type { EditableAssignment, EditableAssignmentQuestion } from '@/components/assignments/edit-assignment-form'
import type { CountableQuestion } from '@/lib/question-parts'

export const metadata = { title: 'แก้ไขชุดข้อสอบ — KorKru' }

/** One assignment question as read here: what the form lists, plus what its
 *  default คะแนน is counted from. */
type QuestionPointRow = Pick<EditableAssignmentQuestion, 'id' | 'title' | 'question_text'> & CountableQuestion

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
    .select('id, title, description, question_ids, question_points, display_max_score, start_at, end_at, duration_minutes, max_attempts, mode, type, score_strategy, passing_type, passing_value, show_results, sections, show_sections, proctoring_enabled, fullscreen_required, block_clipboard, random_question_count, exam_watermark_enabled, require_work_image')
    .eq('id', id)
    .maybeSingle()

  const [user, { data: assignment }] = await Promise.all([
    getAuthUser(),
    assignmentQuery,
  ])
  if (!user) redirect('/login')

  if (!assignment) notFound()
  const a = assignment as EditableAssignment

  // The bank doubles as the lookup for the questions already in this
  // assignment, so one read serves both the list and the "เพิ่มโจทย์" picker.
  // A question shared by a teammate can be in the assignment without being in
  // this teacher's own bank, so those are still read by id.
  const [bank, { data: questionRows }, { data: startedSubmission }] = await Promise.all([
    fetchBankQuestions(supabase, user.id),
    supabase
      .from('questions')
      .select(`id, title, question_text, ${QUESTION_POINT_FIELDS}`)
      .in('id', a.question_ids),
    // One row is enough: the question set is frozen into every attempt as it
    // starts, so once anyone has begun, changing it would hand later students
    // a different paper — and a different คะแนนเต็ม — from the same งาน.
    supabase
      .from('submissions')
      .select('id')
      .eq('assignment_id', id)
      .limit(1)
      .maybeSingle(),
  ])

  // Preserve the assignment's own question order rather than whatever the
  // `in` query happens to return. withQuestionPoints turns each row's
  // structure into the คะแนน it is worth by default, and drops the jsonb it
  // read that from.
  const questionsById = new Map(
    ((questionRows ?? []) as unknown as QuestionPointRow[])
      .map(q => [q.id, withQuestionPoints(q)] as const)
  )
  const questions = a.question_ids
    .map(id => questionsById.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)

  return (
    <div className="max-w-2xl space-y-6">
      <Link href={`/assignments/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-muted-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> กลับไปหน้าชุดข้อสอบ
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">แก้ไขชุดข้อสอบ</h1>
        <p className="text-sm text-muted-foreground mt-1">{a.title}</p>
      </div>

      <EditAssignmentForm
        assignment={a}
        questions={questions}
        bank={bank}
        hasSubmissions={!!startedSubmission}
      />
    </div>
  )
}
