import { redirect, notFound } from 'next/navigation'
import { readWaitingExamData, type SebWaitingRouteParams } from '@/lib/seb-waiting.server'
import { sebExamBasePath } from '@/lib/seb-exam-transport-policy'
import { SebWaitingClient } from '@/components/exam/seb-waiting-client'
import { Card } from '@/components/ui/card'

export const dynamic = 'force-dynamic'
export default async function WaitingPage({ params }: { params: Promise<SebWaitingRouteParams> }) {
  const scope = await params
  const data = await readWaitingExamData(scope)
  if (!data.ok) {
    if (data.reason === 'login') redirect(`${sebExamBasePath({ assignmentId: scope.assignmentId, revision: Number(scope.revision) })}/login`)
    if (data.reason === 'profile') redirect(`${sebExamBasePath(data.context)}/profile`)
    if (data.reason === 'unsupported') return <Card className="space-y-4"><h1 className="text-xl font-semibold">ห้องสอบยังไม่พร้อม</h1><p role="alert">{data.message}</p></Card>
    notFound()
  }
  if (!data.csrf) notFound()
  return <SebWaitingClient view={data.view} basePath={sebExamBasePath(data.context)} csrf={data.csrf} startIntent={data.startIntent} challenge={data.challenge} />
}
