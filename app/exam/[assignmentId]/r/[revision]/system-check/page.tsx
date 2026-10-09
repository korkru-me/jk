import { redirect, notFound } from 'next/navigation'
import { readWaitingExamData, type SebWaitingRouteParams } from '@/lib/seb-waiting.server'
import { sebExamBasePath } from '@/lib/seb-exam-transport-policy'
import { WaitingNativeCheck } from '@/components/exam/seb-waiting-client'
import { validateSebChallenge } from '@/lib/seb-session'

export const dynamic = 'force-dynamic'
export default async function CheckPage({ params, searchParams }: { params: Promise<SebWaitingRouteParams>; searchParams: Promise<{ sebChallenge?: string | string[] }> }) {
  const scope = await params
  const data = await readWaitingExamData(scope)
  if (!data.ok && data.reason === 'profile') redirect(`${sebExamBasePath(data.context)}/profile`)
  if (!data.ok || !data.csrf || !data.challenge || !data.context.userId) notFound()
  const base = sebExamBasePath(data.context)
  const challenge = (await searchParams).sebChallenge
  if (typeof challenge !== 'string' || !validateSebChallenge(challenge, data.context.userId, data.context.assignmentId, data.context.releaseId, data.context.revision, 'system_check')) {
    redirect(`${base}/system-check?sebChallenge=${encodeURIComponent(data.challenge)}`)
  }
  return <WaitingNativeCheck basePath={base} csrf={data.csrf} challenge={challenge} />
}
