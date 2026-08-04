import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import type { Question } from '@/lib/types'
import { officialSubmissionsByStudent, rescaleToDisplayMax } from '@/lib/scoring'
import { ResultsClient, type SubmittedRow, type AnswerRow } from './_components/results-client'

export const metadata = { title: 'ผลคะแนน — KorKru' }

export default async function ResultsPage({
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
    .select('*, classrooms(name)')
    .eq('id', id)
    .maybeSingle()

  if (!assignment) notFound()

  const [{ data: submissions }, { data: questionRows }] = await Promise.all([
    supabase
      .from('submissions')
      .select('*, users(full_name, email)')
      .eq('assignment_id', id),
    supabase
      .from('questions')
      .select('id, title, question_text, question_type, mcq_options, answer_parts, answer_unit, extra_data')
      .in('id', assignment.question_ids),
  ])

  const qMap = new Map((questionRows ?? []).map((q: any) => [q.id, q]))
  const orderedQuestions = assignment.question_ids
    .map((qid: string) => qMap.get(qid))
    .filter(Boolean) as Question[]

  // A student may have multiple attempts — reduce to the "official" score
  // per the assignment's score_strategy, same as the assignment detail and
  // classroom scores pages.
  const rescaledSubmissions = rescaleToDisplayMax(
    (submissions ?? []) as unknown as { total_score: number | null; max_score: number }[],
    () => assignment.display_max_score
  ) as any[]
  const officialByStudent = officialSubmissionsByStudent(rescaledSubmissions, assignment.score_strategy)

  const submitted: SubmittedRow[] = Array.from(officialByStudent.values())
    .map(o => ({ ...o.representative, total_score: o.total_score, max_score: o.max_score }))
    .filter((s: any) => s.status === 'submitted' || s.status === 'graded') as SubmittedRow[]

  const officialSubmissionIds = submitted.map(s => s.id)

  const { data: answerRows } = officialSubmissionIds.length > 0
    ? await supabase
        .from('submission_answers')
        .select('id, submission_id, question_id, student_answer, correct_answer, is_correct, score, max_score, option_order, order_index')
        .in('submission_id', officialSubmissionIds)
    : { data: [] as AnswerRow[] }

  // Roster columns (grade/section/class number) only — same non-sensitive
  // subset a subject teacher gets on the classroom "นักเรียน" tab, used here
  // purely for the same sort options, not for any other student-profile data.
  const admin = createAdminClient()
  const studentIds = submitted.map(s => s.student_id)
  const { data: profileRows } = studentIds.length > 0
    ? await admin
        .from('student_profiles')
        .select('student_id, grade_level, section_number, class_number, student_code')
        .in('student_id', studentIds)
    : { data: [] }
  const profiles = Object.fromEntries((profileRows ?? []).map((p: any) => [p.student_id, p]))

  const inProgressCount = (submissions ?? []).filter((s: any) => s.status === 'in_progress').length

  return (
    <ResultsClient
      assignmentId={id}
      assignmentTitle={assignment.title}
      classroomName={(assignment as any).classrooms?.name ?? null}
      passingType={assignment.passing_type}
      passingValue={assignment.passing_value}
      questions={orderedQuestions}
      submitted={submitted}
      answers={(answerRows ?? []) as AnswerRow[]}
      profiles={profiles}
      inProgressCount={inProgressCount}
    />
  )
}
