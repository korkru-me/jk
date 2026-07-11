import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Question } from '@/lib/types'
import { QuestionBankClient } from './_components/question-bank-client'

export const metadata = { title: 'คลังโจทย์ — KorKru' }

export type QuestionWithCategory = Question & { question_categories: { name: string } | null }

export default async function QuestionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: questions } = await supabase
    .from('questions')
    .select('*, question_categories(name)')
    .eq('created_by', user.id)
    .or('group_id.is.null,order_in_group.eq.0')
    .order('created_at', { ascending: false })

  return <QuestionBankClient questions={(questions ?? []) as QuestionWithCategory[]} />
}
