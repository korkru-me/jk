import { notFound } from 'next/navigation'
import { readSebExamContext, getSebExamCsrfToken } from '@/lib/seb-exam-context.server'
import { readCurrentAssignmentSebRelease } from '@/lib/seb-assignment-release.server'
import { readWaitingSebProfile, waitingSebFeatureEnabled } from '@/lib/seb-waiting-release-policy'
import { sebExamBasePath } from '@/lib/seb-exam-transport-policy'
import { WaitingExamLogin } from '@/components/exam/seb-waiting-login'
import type { SebWaitingRouteParams } from '@/lib/seb-waiting.server'

export const dynamic = 'force-dynamic'
export default async function LoginPage({ params }: { params: Promise<SebWaitingRouteParams> }) {
  if (!waitingSebFeatureEnabled(process.env)) notFound()
  const scope = await params
  const state = await readSebExamContext({ assignmentId: scope.assignmentId, revision: Number(scope.revision) })
  if (state.status !== 'valid') notFound()
  const release = await readCurrentAssignmentSebRelease(scope.assignmentId)
  if (!release || release.releaseId !== state.claims.releaseId || !readWaitingSebProfile(release)) notFound()
  const csrf = getSebExamCsrfToken(state.claims)
  if (!csrf) notFound()
  return <WaitingExamLogin basePath={sebExamBasePath(state.claims)} csrf={csrf} />
}
