import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Question } from '@/lib/types'
import { getMyTeamOrgIds } from '@/lib/actions/team-org'
import { QuestionBankClient } from './_components/question-bank-client'

export const metadata = { title: 'คลังโจทย์ — KorKru' }

export type QuestionWithCategory = Question & { question_categories: { name: string } | null }
export type QuestionWithCreator = QuestionWithCategory & {
  users: { full_name: string } | null
  organizations: { name: string } | null
  /** Names of teams this question was additionally shared to, beyond its home org. */
  shared_org_names?: string[]
}

export default async function QuestionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: questions, error } = await supabase
    .from('questions')
    .select('*, question_categories(name)')
    .eq('created_by', user.id)
    .or('group_id.is.null,order_in_group.eq.0')
    .order('created_at', { ascending: false })

  if (error) console.error('[questions/page] query failed:', error)

  const teamOrgIds = await getMyTeamOrgIds()

  let teamQuestions: QuestionWithCreator[] = []
  if (teamOrgIds.length > 0) {
    const [{ data: primaryData, error: primaryError }, { data: shareRows, error: shareError }] = await Promise.all([
      supabase
        .from('questions')
        .select('*, question_categories(name), users(full_name), organizations!questions_org_id_fkey(name)')
        .in('org_id', teamOrgIds)
        .in('visibility', ['organization', 'school'])
        .or('group_id.is.null,order_in_group.eq.0')
        .order('created_at', { ascending: false }),
      supabase
        .from('question_shares')
        .select('question_id, organizations(name)')
        .in('org_id', teamOrgIds),
    ])

    if (primaryError) console.error('[questions/page] team query failed:', primaryError)
    if (shareError) console.error('[questions/page] share query failed:', shareError)

    // question_id -> names of the extra teams it was shared to
    const sharedNamesByQuestion = new Map<string, string[]>()
    for (const row of (shareRows ?? []) as any[]) {
      const name = row.organizations?.name
      if (!name) continue
      const names = sharedNamesByQuestion.get(row.question_id) ?? []
      names.push(name)
      sharedNamesByQuestion.set(row.question_id, names)
    }

    // Questions shared into a team the user belongs to, but whose home org
    // is elsewhere — fetch those rows too so they show up alongside primaryData.
    const sharedOnlyIds = [...sharedNamesByQuestion.keys()]
    let sharedOnlyData: QuestionWithCreator[] = []
    if (sharedOnlyIds.length > 0) {
      const { data, error: sharedOnlyError } = await supabase
        .from('questions')
        .select('*, question_categories(name), users(full_name), organizations!questions_org_id_fkey(name)')
        .in('id', sharedOnlyIds)
        .or('group_id.is.null,order_in_group.eq.0')
        .order('created_at', { ascending: false })
      if (sharedOnlyError) console.error('[questions/page] shared-only query failed:', sharedOnlyError)
      sharedOnlyData = (data ?? []) as QuestionWithCreator[]
    }

    const byId = new Map<string, QuestionWithCreator>()
    for (const q of [...(primaryData ?? []), ...sharedOnlyData] as QuestionWithCreator[]) {
      byId.set(q.id, { ...q, shared_org_names: sharedNamesByQuestion.get(q.id) ?? [] })
    }
    teamQuestions = [...byId.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  return (
    <QuestionBankClient
      questions={(questions ?? []) as QuestionWithCategory[]}
      teamQuestions={teamQuestions}
      hasTeamOrg={teamOrgIds.length > 0}
      hasMultipleTeams={teamOrgIds.length > 1}
      currentUserId={user.id}
    />
  )
}
