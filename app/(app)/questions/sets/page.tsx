import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getMyQuestionSets, getTeamQuestionSets } from '@/lib/actions/question-sets'
import { QuestionSetsClient } from './_components/question-sets-client'
import type { QuestionSet } from '@/lib/types'

export const metadata = { title: 'คลังชุดโจทย์ — KorKru' }

// A set's question_ids can go stale once a question is deleted — attaches
// valid_question_count (how many ids still resolve) to each set so the
// library's displayed count matches what the assignment picker actually
// shows, instead of the raw (possibly inflated) stored length.
async function withValidCounts<T extends QuestionSet>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sets: T[]
): Promise<T[]> {
  const allIds = Array.from(new Set(sets.flatMap(s => s.question_ids)))
  if (allIds.length === 0) return sets

  const { data: existing } = await supabase.from('questions').select('id').in('id', allIds)
  const existingIds = new Set((existing ?? []).map((q: any) => q.id as string))

  return sets.map(s => ({
    ...s,
    valid_question_count: s.question_ids.filter(id => existingIds.has(id)).length,
  }))
}

export default async function QuestionSetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  const [mySetsRaw, teamSetsRaw] = await Promise.all([getMyQuestionSets(), getTeamQuestionSets()])
  const [mySets, teamSets] = await Promise.all([
    withValidCounts(supabase, mySetsRaw),
    withValidCounts(supabase, teamSetsRaw),
  ])

  return <QuestionSetsClient mySets={mySets} teamSets={teamSets} currentUserId={user.id} />
}
