import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { notFound, redirect } from 'next/navigation'
import type { Assignment, Question } from '@/lib/types'
import { officialSubmissionsByStudent, rescaleToDisplayMax } from '@/lib/scoring'
import { AnalyticsClient } from './_components/analytics-client'

export const metadata = { title: 'วิเคราะห์และประเมินผล — KorKru' }

export type AnalyticsSubmissionRow = {
  id: string
  student_id: string
  status: string
  total_score: number | null
  max_score: number
  submitted_at: string | null
  started_at: string
  users: { full_name: string; avatar_url: string | null } | null
}

export type AnalyticsAssignment = Pick<
  Assignment,
  | 'id'
  | 'title'
  | 'question_ids'
  | 'score_strategy'
  | 'display_max_score'
  | 'passing_type'
  | 'passing_value'
> & {
  classrooms: { name: string } | null
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const assignmentQuery = supabase
    .from('assignments')
    .select('id, title, question_ids, score_strategy, display_max_score, passing_type, passing_value, classrooms(name)')
    .eq('id', id)
    .maybeSingle()

  const [user, { data: assignment }] = await Promise.all([
    getAuthUser(),
    assignmentQuery,
  ])
  if (!user) redirect('/login')

  if (!assignment) notFound()

  const a = assignment as unknown as AnalyticsAssignment
  // No explicit ownership check here — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all) already scoped the row above; a null result
  // means unauthorized and is handled by notFound() before this point.

  const [{ data: questions }, { data: submissions }] = await Promise.all([
    supabase
      .from('questions')
      .select('id, title, difficulty, question_text, mcq_options')
      .in('id', a.question_ids),
    supabase
      .from('submissions')
      .select('id, student_id, status, total_score, max_score, submitted_at, started_at, attempt_number, users!submissions_student_id_fkey(full_name, avatar_url)')
      .eq('assignment_id', id)
      .in('status', ['submitted', 'graded'])
      .order('total_score', { ascending: false }),
  ])

  const qMap = new Map((questions ?? []).map((q: any) => [q.id, q]))
  const orderedQuestions = a.question_ids.map(qid => qMap.get(qid)).filter(Boolean) as Question[]

  // A student may have multiple attempts — reduce to the "official" score
  // per the assignment's score_strategy, so retries don't skew the stats.
  const rescaledSubmissions = rescaleToDisplayMax((submissions ?? []) as any[], () => a.display_max_score)
  const officialByStudent = officialSubmissionsByStudent(rescaledSubmissions, a.score_strategy)
  const dedupedSubmissions = Array.from(officialByStudent.values())
    .map(official => ({
      ...official.representative,
      total_score: official.total_score,
      max_score: official.max_score,
    }))
    .sort((x, y) => (y.total_score ?? 0) - (x.total_score ?? 0))

  return (
    <AnalyticsClient
      assignment={a}
      questions={orderedQuestions}
      submissions={dedupedSubmissions as unknown as AnalyticsSubmissionRow[]}
      teacherName={user.user_metadata?.full_name ?? 'ครูผู้สอน'}
    />
  )
}
