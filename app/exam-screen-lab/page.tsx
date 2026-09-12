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
  searchParams: Promise<{ perPage?: string | string[]; streak?: string | string[]; at?: string | string[] }>
}) {
  if (!isExamScreenLabEnabled(process.env.NODE_ENV)) notFound()

  const params = await searchParams
  const rawPerPage = Array.isArray(params.perPage) ? params.perPage[0] : params.perPage
  const questionsPerPage = rawPerPage === '3' ? 3 : 1

  // ?streak=1 draws the "ถูกติดต่อกัน" chrome over the same fixture, and ?at=N
  // sets where the run currently stands so each state of the meter can be
  // looked at. Synthetic throughout: there is no attempt behind this screen,
  // so nothing here can draw a ข้อ or record a verdict.
  const rawStreak = Array.isArray(params.streak) ? params.streak[0] : params.streak
  const rawAt = Array.isArray(params.at) ? params.at[0] : params.at
  const streakTarget = 5
  const current = Math.max(0, Math.min(streakTarget, Number.parseInt(rawAt ?? '3', 10) || 0))
  const streak = rawStreak === '1'
    ? {
        target: streakTarget,
        current,
        best: Math.max(current, 4),
        reached: current >= streakTarget,
        askedCount: 11,
        questionCap: 30,
      }
    : undefined

  return (
    <ExamScreenLabClient
      fixture={buildExamScreenQaFixture()}
      submissionId={`qa-preview-${randomUUID()}`}
      questionsPerPage={questionsPerPage}
      streak={streak}
    />
  )
}
