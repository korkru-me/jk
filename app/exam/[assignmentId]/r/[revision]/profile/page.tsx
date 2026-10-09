import { redirect, notFound } from 'next/navigation'
import { authorizeWaitingExam, type SebWaitingRouteParams } from '@/lib/seb-waiting.server'
import { getSebExamCsrfToken } from '@/lib/seb-exam-context.server'
import { sebExamBasePath } from '@/lib/seb-exam-transport-policy'
import { WaitingExamLogin } from '@/components/exam/seb-waiting-login'

export const dynamic = 'force-dynamic'
export default async function ProfilePage({ params }: { params: Promise<SebWaitingRouteParams> }) {
  const access = await authorizeWaitingExam(await params)
  if (!access.ok) notFound()
  const basePath = sebExamBasePath(access.context)
  if (access.account.survey_role) redirect(`${basePath}/waiting`)
  const csrf = getSebExamCsrfToken(access.context)
  if (!csrf) notFound()
  return <WaitingExamLogin basePath={basePath} csrf={csrf} profile />
}
