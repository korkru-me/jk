import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getMyQuestionSets } from '@/lib/actions/question-sets'
import { QuestionSetsClient } from './_components/question-sets-client'

export const metadata = { title: 'คลังชุดโจทย์ — KorKru' }

export default async function QuestionSetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  const sets = await getMyQuestionSets()

  return <QuestionSetsClient sets={sets} />
}
