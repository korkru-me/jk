import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { StudentAbilityLabClient } from './_components/student-ability-lab-client'
import { LAB_SCENARIOS, type LabScenario } from './_components/scenarios'

export const metadata = { title: 'ห้องทดลองศักยภาพผู้เรียน — KorKru' }
export const dynamic = 'force-dynamic'

/**
 * Local/Staging-only workbench for the classroom "ศักยภาพผู้เรียน" tab on
 * synthetic rooms. Nothing here reads or writes a database. `?scenario=`
 * picks the room: none = 58 students and eight งาน plus a draft that must
 * not appear; `many` = 26 students and 18 งาน; `edge` = hand-written rows
 * for duplicate names, missing profiles, zero full marks, scores above full
 * marks and every attempt rule; `empty` = no งาน yet (`?empty=1` still
 * works). Production receives a 404.
 */
export default async function StudentAbilityLabPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string | string[]; empty?: string | string[] }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { scenario, empty } = await searchParams
  const requested = Array.isArray(scenario) ? scenario[0] : scenario
  const picked: LabScenario = empty === '1'
    ? 'empty'
    : LAB_SCENARIOS.find(s => s.key === requested)?.key ?? 'default'
  return <StudentAbilityLabClient scenario={picked} />
}
