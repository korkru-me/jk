import { randomUUID } from 'node:crypto'
import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { ExamScreenLabClient } from './_components/exam-screen-lab-client'
import { buildExamScreenQaFixture } from './_lib/fixture'

export const metadata = { title: 'ห้องทดลองหน้าข้อสอบ — KorKru' }
export const dynamic = 'force-dynamic'

/**
 * Development-only physical-device workbench for the real exam renderer.
 * Production receives a 404 before any synthetic fixture is built.
 */
export default async function ExamScreenLabPage({
  searchParams,
}: {
  searchParams: Promise<{
    perPage?: string | string[]
    timer?: string | string[]
    work?: string | string[]
  }>
}) {
  if (!isExamScreenLabEnabled(process.env.NODE_ENV)) notFound()

  const params = await searchParams
  const rawPerPage = Array.isArray(params.perPage) ? params.perPage[0] : params.perPage
  const rawTimer = Array.isArray(params.timer) ? params.timer[0] : params.timer
  const rawWork = Array.isArray(params.work) ? params.work[0] : params.work
  const questionsPerPage = rawPerPage === '3' ? 3 : 1
  const timerEnabled = rawTimer === '1'
  const workImageRequired = rawWork !== '0'

  return (
    <ExamScreenLabClient
      fixture={buildExamScreenQaFixture()}
      submissionId={`qa-preview-${randomUUID()}`}
      questionsPerPage={questionsPerPage}
      timerEnabled={timerEnabled}
      startedAt={new Date().toISOString()}
      workImageRequired={workImageRequired}
    />
  )
}
