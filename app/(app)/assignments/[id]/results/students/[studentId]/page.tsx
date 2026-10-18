import { notFound, redirect } from 'next/navigation'
import { StudentGradingReview } from '@/components/assignments/grading-review'
import { getAuthUser } from '@/lib/auth/server'
import { loadGradingWorkspace } from '@/lib/grading-workspace.server'
import { parseGradingWorkspaceQuery } from '@/lib/grading-workspace-query'
import { GradingWorkspaceContext } from '../../_components/grading-workspace-context'

export const metadata = { title: 'ตรวจคำตอบรายคน — KorKru' }

export default async function StudentGradingPage({ params, searchParams }: {
  params: Promise<{ id: string; studentId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id, studentId }, search, user] = await Promise.all([params, searchParams, getAuthUser()])
  if (!user) redirect('/login')
  const query = parseGradingWorkspaceQuery(search)
  const workspace = await loadGradingWorkspace(id, { kind: 'student', studentId, query })
  if (!workspace || !workspace.data.students.some(student => student.id === studentId)) notFound()
  return <>
    <GradingWorkspaceContext workspace={workspace} />
    <StudentGradingReview data={workspace.data} studentId={studentId} query={query} />
  </>
}
