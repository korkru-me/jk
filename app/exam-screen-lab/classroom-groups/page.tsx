import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { ClassroomGroupsLabClient, type GroupsLabScenario } from './_components/classroom-groups-lab-client'

export const metadata = { title: 'ห้องทดลองกลุ่มย่อย — KorKru' }
export const dynamic = 'force-dynamic'

const SCENARIOS: GroupsLabScenario[] = ['default', 'many', 'empty']

/**
 * Local/Staging-only workbench for the classroom "กลุ่มย่อย" tab, the
 * "มอบหมายให้" picker, the two-level assignment creation menu, the assignment
 * status/reordering list, and the classroom-themed review card on a synthetic
 * room. Every save is answered from memory — nothing reads or writes a
 * database, so dragging, renaming, recolouring, deleting and random splits can
 * all be tried freely.
 *
 * `?scenario=` none = 32 students in four groups; `many` = 143 students and
 * six groups (the size of a real room that looked cramped); `empty` = no
 * groups yet. `?fail=1` makes every save fail, to watch the screen roll back.
 * Production receives a 404.
 */
export default async function ClassroomGroupsLabPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string | string[]; fail?: string | string[] }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { scenario, fail } = await searchParams
  const requested = Array.isArray(scenario) ? scenario[0] : scenario
  const picked = SCENARIOS.find(s => s === requested) ?? 'default'
  return <ClassroomGroupsLabClient scenario={picked} fail={(Array.isArray(fail) ? fail[0] : fail) === '1'} />
}
