import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { SolutionReleaseLabClient, type LabReleaseState } from './_components/solution-release-lab-client'

export const metadata = { title: 'ห้องทดลองเฉลยวิธีทำ — KorKru' }
export const dynamic = 'force-dynamic'

const STATES: LabReleaseState[] = ['open', 'locked', 'unfinished', 'unfinished-closed']

/**
 * Local/Staging-only workbench for the เฉลยวิธีทำ a student opens from their
 * summary page, on a synthetic attempt — no sign-in and no database: the เฉลย
 * come from memory. `?state=` picks what the summary shows (open, locked,
 * unfinished, unfinished-closed) and `?fail=1` makes the เฉลย fail to load.
 * Also holds the ให้นักเรียนดูเฉลยวิธีทำ setting as the งาน forms show it.
 * Production receives a 404.
 */
export default async function SolutionReleaseLabPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[]; fail?: string | string[] }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const params = await searchParams
  const rawState = Array.isArray(params.state) ? params.state[0] : params.state
  const state = STATES.find(candidate => candidate === rawState) ?? 'open'
  return <SolutionReleaseLabClient state={state} failLoads={params.fail === '1'} />
}
