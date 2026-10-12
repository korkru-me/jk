import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { notFound, redirect } from 'next/navigation'
import type { Question } from '@/lib/types'
import { officialSubmissionsByStudent, rescaleToDisplayMax } from '@/lib/scoring'
import { classifySubmissionTimingsByStudent, type AssignmentLateBand } from '@/lib/late-submission'
import {
  ResultsClient,
  type SubmittedRow,
  type AnswerRow,
  type ScoreAdjustmentBatchRow,
} from './_components/results-client'

export const metadata = { title: 'ผลคะแนน — KorKru' }

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pending?: string }>
}) {
  const { id } = await params
  // `?pending=1` is how the ตรวจให้คะแนน buttons hand this page a starting
  // filter. Nothing else depends on it: the page renders the same either way,
  // the flag only decides whether the filter starts switched on.
  const { pending } = await searchParams
  const supabase = await createClient()

  // No explicit created_by filter — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all) already scopes this to owner or co-teacher.
  const assignmentQuery = supabase
    .from('assignments')
    .select('title, org_id, question_ids, score_strategy, display_max_score, passing_type, passing_value, completion_rule, streak_target, due_at, late_bands, end_at, classrooms(name)')
    .eq('id', id)
    .maybeSingle()

  const [user, { data: assignment }] = await Promise.all([
    getAuthUser(),
    assignmentQuery,
  ])
  if (!user) redirect('/login')

  if (!assignment) notFound()

  const admin = createAdminClient()

  // Hand-ins are read with the service role, so authorization is stated here
  // rather than inherited: submissions/submission_answers have no co-teacher
  // RLS policy at all (their teacher-side policies are scoped to
  // assignments.created_by), which is why a co-teacher used to land on an
  // empty results page. canManageAssignment re-states the rule the assignment
  // row's own policies enforce — owner, or an admin/manage co-teacher.
  if (!await canManageAssignment(id, user.id)) notFound()

  const [{ data: submissions }, { data: questionRows }] = await Promise.all([
    admin
      .from('submissions')
      .select('id, student_id, status, total_score, score_adjustment, max_score, submitted_at, started_at, attempt_number, current_streak, best_streak, streak_reached, users!submissions_student_id_fkey(full_name, email)')
      .eq('assignment_id', id),
    supabase
      .from('questions')
      // mcq_options comes along so an answer recorded as MCQ:<position> can be
      // shown as the option's words rather than a number.
      .select('id, title, question_text, question_type, mcq_options')
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

  const answerRowsQuery = officialSubmissionIds.length > 0
    ? admin
        .from('submission_answers')
        .select('id, submission_id, question_id, student_answer, correct_answer, is_correct, score, max_score, option_order, order_index')
        .in('submission_id', officialSubmissionIds)
    : Promise.resolve({ data: [] as AnswerRow[] })

  // Roster columns (grade/section/class number) only — same non-sensitive
  // subset a subject teacher gets on the classroom "นักเรียน" tab, used here
  // purely for the same sort options, not for any other student-profile data.
  const studentIds = submitted.map(s => s.student_id)
  const profileRowsQuery = studentIds.length > 0
    ? admin
        .from('student_profiles')
        .select('student_id, grade_level, section_number, class_number, student_code')
        .in('student_id', studentIds)
    : Promise.resolve({ data: [] })

  const extensionRowsQuery = studentIds.length > 0
    ? admin
        .from('assignment_extensions')
        .select('student_id, extended_due_at, extended_end_at')
        .eq('assignment_id', id)
        .in('student_id', studentIds)
    : Promise.resolve({ data: [] })

  const adjustmentBatchesQuery = admin
    .from('assignment_score_adjustment_batches')
    .select('id, color, adjustment, reason, affected_count, changed_by, created_at')
    .eq('assignment_id', id)
    .order('created_at', { ascending: false })
    .limit(12)

  // Answer details and roster sort metadata are independent once the
  // official attempts are known, so do not make one wait for the other.
  const [
    { data: answerRows },
    { data: profileRows },
    { data: extensionRows },
    { data: adjustmentBatchRows },
  ] = await Promise.all([
    answerRowsQuery,
    profileRowsQuery,
    extensionRowsQuery,
    adjustmentBatchesQuery,
  ])
  const profiles = Object.fromEntries((profileRows ?? []).map((p: any) => [p.student_id, p]))

  const actorIds = [...new Set((adjustmentBatchRows ?? []).map((batch: any) => batch.changed_by as string))]
  const { data: actorRows } = actorIds.length > 0
    ? await admin.from('users').select('id, full_name, email').in('id', actorIds)
    : { data: [] }
  const actors = new Map((actorRows ?? []).map((actor: any) => [actor.id, actor]))
  const adjustmentBatches: ScoreAdjustmentBatchRow[] = (adjustmentBatchRows ?? []).map((batch: any) => ({
    ...batch,
    changed_by_name: actors.get(batch.changed_by)?.full_name ?? actors.get(batch.changed_by)?.email ?? 'ผู้สอน',
  }))

  const timingByStudent = classifySubmissionTimingsByStudent({
    dueAt: assignment.due_at,
    endAt: assignment.end_at,
    bands: (assignment.late_bands ?? []) as AssignmentLateBand[],
    submissions: (submissions ?? []) as Array<{
      student_id: string
      status: 'in_progress' | 'submitted' | 'graded'
      submitted_at: string | null
    }>,
    extensions: extensionRows ?? [],
  })
  const submittedWithTiming = submitted.map(row => ({
    ...row,
    timing: timingByStudent.get(row.student_id) ?? { status: 'not_submitted' as const },
  }))

  const inProgressCount = (submissions ?? []).filter((s: any) => s.status === 'in_progress').length

  return (
    <ResultsClient
      assignmentId={id}
      assignmentTitle={assignment.title}
      classroomName={(assignment as any).classrooms?.name ?? null}
      passingType={assignment.passing_type}
      passingValue={assignment.passing_value}
      completionRule={assignment.completion_rule === 'streak' ? 'streak' : 'fixed'}
      streakTarget={assignment.streak_target ?? null}
      questions={orderedQuestions}
      submitted={submittedWithTiming}
      answers={(answerRows ?? []) as AnswerRow[]}
      profiles={profiles}
      inProgressCount={inProgressCount}
      initialPendingOnly={pending === '1'}
      adjustmentBatches={adjustmentBatches}
    />
  )
}
