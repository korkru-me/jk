import { notFound, redirect } from 'next/navigation'
import { QuestionGradingReview } from '@/components/assignments/grading-review'
import { getAuthUser } from '@/lib/auth/server'
import { loadGradingWorkspace } from '@/lib/grading-workspace.server'
import { parseGradingWorkspaceQuery } from '@/lib/grading-workspace-query'
import { GradingWorkspaceContext } from '../../_components/grading-workspace-context'

export const metadata = { title: 'ตรวจคำตอบรายข้อ — KorKru' }

export default async function QuestionGradingPage({ params, searchParams }: {
  params: Promise<{ id: string; questionId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id, questionId }, search, user] = await Promise.all([params, searchParams, getAuthUser()])
  if (!user) redirect('/login')
  const query = parseGradingWorkspaceQuery(search)
  const workspace = await loadGradingWorkspace(id, { kind: 'question', questionId, query })
  if (!workspace || !workspace.data.questions.some(question => question.id === questionId)) notFound()
  return <>
    <GradingWorkspaceContext workspace={workspace} />
    <QuestionGradingReview data={workspace.data} questionId={questionId} query={query} />
  </>
}
