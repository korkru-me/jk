import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import { QuestionSetsClient } from './_components/question-sets-client'
import type { QuestionSet } from '@/lib/types'

export const metadata = { title: 'คลังแฟ้มโจทย์ — KorKru' }

// A set's question_ids can go stale once a question is deleted — attaches
// valid_question_count (how many ids still resolve) to each set so the
// library's displayed count matches what the assignment picker actually
// shows, instead of the raw (possibly inflated) stored length.
export type QuestionSetSummary = Pick<
  QuestionSet,
  'id' | 'created_by' | 'title' | 'description' | 'question_ids' | 'sections' | 'tags'
> & {
  valid_question_count?: number
}

export type QuestionSetSummaryWithCreator = QuestionSetSummary & {
  users?: { full_name: string } | null
  organizations?: { name: string } | null
  shared_org_names?: string[]
}

async function withValidCounts<T extends { question_ids: string[] }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sets: T[]
): Promise<(T & { valid_question_count: number })[]> {
  const allIds = Array.from(new Set(sets.flatMap(s => s.question_ids)))
  if (allIds.length === 0) return sets.map(set => ({ ...set, valid_question_count: 0 }))

  const { data: existing } = await supabase.from('questions').select('id').in('id', allIds)
  const existingIds = new Set((existing ?? []).map((q: any) => q.id as string))

  return sets.map(s => ({
    ...s,
    valid_question_count: s.question_ids.filter(id => existingIds.has(id)).length,
  }))
}

export default async function QuestionSetsPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const summaryFields = 'id, created_by, title, description, question_ids, sections, tags'
  const [profileResult, mySetsResult, membershipResult] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).single(),
    supabase
      .from('question_sets')
      .select(summaryFields)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('organization_members')
      .select('organizations!inner(id, is_personal)')
      .eq('user_id', user.id)
      .eq('organizations.is_personal', false),
  ])
  const { data: profile } = profileResult
  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  const mySetsRaw = (mySetsResult.data ?? []) as unknown as QuestionSetSummary[]
  const teamOrgIds = (membershipResult.data ?? []).map((row: any) => row.organizations.id as string)
  let teamSetsRaw: QuestionSetSummaryWithCreator[] = []

  if (teamOrgIds.length > 0) {
    const [{ data: primaryData }, { data: shareRows }] = await Promise.all([
      supabase
        .from('question_sets')
        .select(`${summaryFields}, users(full_name), organizations!question_sets_org_id_fkey(name)`)
        .in('org_id', teamOrgIds)
        .eq('visibility', 'organization')
        .order('created_at', { ascending: false }),
      supabase
        .from('question_set_shares')
        .select('question_set_id, org_id, organizations(name)')
        .in('org_id', teamOrgIds),
    ])

    const sharedNamesBySet = new Map<string, string[]>()
    for (const row of (shareRows ?? []) as any[]) {
      const name = row.organizations?.name
      if (!name) continue
      sharedNamesBySet.set(row.question_set_id, [
        ...(sharedNamesBySet.get(row.question_set_id) ?? []),
        name,
      ])
    }

    const sharedOnlyIds = [...sharedNamesBySet.keys()]
    let sharedOnlyData: QuestionSetSummaryWithCreator[] = []
    if (sharedOnlyIds.length > 0) {
      const { data } = await supabase
        .from('question_sets')
        .select(`${summaryFields}, users(full_name), organizations!question_sets_org_id_fkey(name)`)
        .in('id', sharedOnlyIds)
        .order('created_at', { ascending: false })
      sharedOnlyData = (data ?? []) as unknown as QuestionSetSummaryWithCreator[]
    }

    const byId = new Map<string, QuestionSetSummaryWithCreator>()
    for (const set of [...(primaryData ?? []), ...sharedOnlyData] as unknown as QuestionSetSummaryWithCreator[]) {
      byId.set(set.id, {
        ...set,
        shared_org_names: sharedNamesBySet.get(set.id) ?? [],
      })
    }
    teamSetsRaw = [...byId.values()]
  }

  // Validate every referenced question in one query. The previous two calls
  // could request the same question ids twice when a set was also team-shared.
  const allSets = await withValidCounts(supabase, [...mySetsRaw, ...teamSetsRaw])
  const mySets = allSets.slice(0, mySetsRaw.length)
  const teamSets = allSets.slice(mySetsRaw.length)

  return <QuestionSetsClient mySets={mySets} teamSets={teamSets} currentUserId={user.id} />
}
