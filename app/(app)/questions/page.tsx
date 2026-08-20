import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import type { Question } from '@/lib/types'
import { computeQuestionStats, type GradedAnswerRow, type QuestionStats } from '@/lib/question-stats'
import { QuestionBankClient } from './_components/question-bank-client'

export const metadata = { title: 'คลังโจทย์ — KorKru' }

export type QuestionSummary = Pick<
  Question,
  | 'id'
  | 'created_by'
  | 'org_id'
  | 'title'
  | 'question_text'
  | 'question_type'
  | 'difficulty'
  | 'tags'
  | 'requires_work_image'
  | 'group_id'
  | 'order_in_group'
  | 'team_edit_allowed'
  | 'created_at'
>

export type QuestionWithCategory = QuestionSummary & { question_categories: { name: string } | null }
export type QuestionDetailWithCategory = Question & { question_categories: { name: string } | null }
export type QuestionWithCreator = QuestionWithCategory & {
  users: { full_name: string } | null
  organizations: { name: string } | null
  /** Names of teams this question was additionally shared to, beyond its home org. */
  shared_org_names?: string[]
  shared_org_ids?: string[]
}

/**
 * Item-analysis stats for the listed questions.
 *
 * RLS on submission_answers already limits this to attempts on assignments the
 * signed-in teacher created, which is the scope we want: "how has this question
 * performed in my classes". Only submitted/graded attempts count — an
 * in-progress one has no meaningful score yet.
 */
async function fetchQuestionStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questionIds: string[],
): Promise<Record<string, QuestionStats>> {
  if (questionIds.length === 0) return {}

  const { data, error } = await supabase
    .from('submission_answers')
    .select('question_id, score, max_score, submissions!inner(assignment_id, total_score, status)')
    .in('question_id', questionIds)
    .in('submissions.status', ['submitted', 'graded'])

  if (error) {
    console.error('[questions/page] stats query failed:', error)
    return {}
  }

  const rows: GradedAnswerRow[] = (data ?? []).map((row: any) => ({
    question_id: row.question_id,
    score: Number(row.score ?? 0),
    max_score: Number(row.max_score ?? 0),
    submission_total: Number(row.submissions?.total_score ?? 0),
    assignment_id: row.submissions?.assignment_id ?? '',
  }))

  return Object.fromEntries(computeQuestionStats(rows))
}

export default async function QuestionsPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const summaryFields = 'id, created_by, org_id, title, question_text, question_type, difficulty, tags, requires_work_image, group_id, order_in_group, team_edit_allowed, created_at'
  const [{ data: questions, error }, { data: membershipRows }] = await Promise.all([
    supabase
      .from('questions')
      .select(`${summaryFields}, question_categories(name)`)
      .eq('created_by', user.id)
      .or('group_id.is.null,order_in_group.eq.0')
      .order('created_at', { ascending: false }),
    supabase
      .from('organization_members')
      .select('org_role, organizations!inner(id, name, is_personal)')
      .eq('user_id', user.id)
      .eq('organizations.is_personal', false),
  ])

  if (error) console.error('[questions/page] query failed:', error)

  const myTeams = (membershipRows ?? []).map((row: any) => ({
    id: row.organizations.id as string,
    name: row.organizations.name as string,
  }))
  const teamOrgIds = myTeams.map(t => t.id)

  let teamQuestions: QuestionWithCreator[] = []
  if (teamOrgIds.length > 0) {
    const [{ data: primaryData, error: primaryError }, { data: shareRows, error: shareError }] = await Promise.all([
      supabase
        .from('questions')
        .select(`${summaryFields}, question_categories(name), users(full_name), organizations!questions_org_id_fkey(name)`)
        .in('org_id', teamOrgIds)
        .in('visibility', ['organization', 'school'])
        .or('group_id.is.null,order_in_group.eq.0')
        .order('created_at', { ascending: false }),
      supabase
        .from('question_shares')
        .select('question_id, org_id, organizations(name)')
        .in('org_id', teamOrgIds),
    ])

    if (primaryError) console.error('[questions/page] team query failed:', primaryError)
    if (shareError) console.error('[questions/page] share query failed:', shareError)

    // question_id -> extra teams it was shared to (id + name, for filtering + badges)
    const sharedNamesByQuestion = new Map<string, string[]>()
    const sharedIdsByQuestion = new Map<string, string[]>()
    for (const row of (shareRows ?? []) as any[]) {
      const name = row.organizations?.name
      if (!name) continue
      sharedNamesByQuestion.set(row.question_id, [...(sharedNamesByQuestion.get(row.question_id) ?? []), name])
      sharedIdsByQuestion.set(row.question_id, [...(sharedIdsByQuestion.get(row.question_id) ?? []), row.org_id])
    }

    // Questions shared into a team the user belongs to, but whose home org
    // is elsewhere — fetch those rows too so they show up alongside primaryData.
    const sharedOnlyIds = [...sharedNamesByQuestion.keys()]
    let sharedOnlyData: QuestionWithCreator[] = []
    if (sharedOnlyIds.length > 0) {
      const { data, error: sharedOnlyError } = await supabase
        .from('questions')
        .select(`${summaryFields}, question_categories(name), users(full_name), organizations!questions_org_id_fkey(name)`)
        .in('id', sharedOnlyIds)
        .or('group_id.is.null,order_in_group.eq.0')
        .order('created_at', { ascending: false })
      if (sharedOnlyError) console.error('[questions/page] shared-only query failed:', sharedOnlyError)
      sharedOnlyData = (data ?? []) as unknown as QuestionWithCreator[]
    }

    const byId = new Map<string, QuestionWithCreator>()
    for (const q of [...(primaryData ?? []), ...sharedOnlyData] as unknown as QuestionWithCreator[]) {
      byId.set(q.id, {
        ...q,
        shared_org_names: sharedNamesByQuestion.get(q.id) ?? [],
        shared_org_ids: sharedIdsByQuestion.get(q.id) ?? [],
      })
    }
    teamQuestions = [...byId.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  const ownQuestions = (questions ?? []) as unknown as QuestionWithCategory[]
  const stats = await fetchQuestionStats(
    supabase,
    [...ownQuestions, ...teamQuestions].map(q => q.id),
  )

  return (
    <QuestionBankClient
      questions={ownQuestions}
      stats={stats}
      teamQuestions={teamQuestions}
      hasTeamOrg={teamOrgIds.length > 0}
      hasMultipleTeams={teamOrgIds.length > 1}
      myTeams={myTeams.map(t => ({ id: t.id, name: t.name }))}
      currentUserId={user.id}
    />
  )
}
