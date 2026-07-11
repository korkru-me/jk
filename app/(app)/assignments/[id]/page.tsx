import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import type { Assignment, Question } from '@/lib/types'
import { AssignmentDetailClient } from './_components/assignment-detail-client'

export const metadata = { title: 'ชุดข้อสอบ — KorKru' }

export type SubmissionRow = {
  id: string
  student_id: string
  status: string
  total_score: number | null
  max_score: number
  submitted_at: string | null
  started_at: string
  users: { full_name: string } | null
}

export default async function AssignmentDetailPage({
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
    .select('*, classrooms(name)')
    .eq('id', id)
    .maybeSingle()

  if (!assignment) notFound()

  const a = assignment as Assignment & { classrooms: { name: string } | null }
  const isOwner = a.created_by === user.id
  if (!isOwner) redirect('/assignments')

  const [{ data: questions }, { data: submissions }] = await Promise.all([
    supabase
      .from('questions')
      .select('id, title, question_type, difficulty, question_text')
      .in('id', a.question_ids),
    supabase
      .from('submissions')
      .select('id, student_id, status, total_score, max_score, submitted_at, started_at, users(full_name)')
      .eq('assignment_id', id)
      .order('submitted_at', { ascending: false }),
  ])

  // Re-order questions to match assignment's question_ids order
  const qMap = new Map((questions ?? []).map((q: any) => [q.id, q]))
  const orderedQuestions = a.question_ids.map(qid => qMap.get(qid)).filter(Boolean) as Question[]

  return (
    <AssignmentDetailClient
      assignment={a}
      questions={orderedQuestions}
      submissions={(submissions ?? []) as unknown as SubmissionRow[]}
    />
  )
}
