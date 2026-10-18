import { notFound, redirect } from 'next/navigation'
import { GradingOverview } from '@/components/assignments/grading-overview'
import { GradingTools } from '@/components/assignments/grading-tools'
import { getAuthUser } from '@/lib/auth/server'
import { loadGradingWorkspace } from '@/lib/grading-workspace.server'
import { parseGradingWorkspaceQuery } from '@/lib/grading-workspace-query'
import { GradingWorkspaceContext } from './_components/grading-workspace-context'

export const metadata = { title: 'ตรวจให้คะแนน — KorKru' }

export default async function ResultsPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, search, user] = await Promise.all([params, searchParams, getAuthUser()])
  if (!user) redirect('/login')
  const workspace = await loadGradingWorkspace(id)
  if (!workspace) notFound()
  return <>
    <GradingWorkspaceContext workspace={workspace} />
    <GradingOverview
      data={workspace.data}
      initialQuery={parseGradingWorkspaceQuery(search)}
      tools={<GradingTools data={workspace.data} adjustmentBatches={workspace.adjustmentBatches} />}
    />
  </>
}
