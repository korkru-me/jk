import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { StudentAbilityLabClient } from './_components/student-ability-lab-client'

export const metadata = { title: 'ห้องทดลองศักยภาพผู้เรียน — KorKru' }
export const dynamic = 'force-dynamic'

/**
 * Local/Staging-only workbench for the classroom "ศักยภาพผู้เรียน" tab on a
 * synthetic room: 58 students (three pages of cards), eight งาน and one draft
 * that must not appear. Nothing here reads or writes a database. `?empty=1`
 * shows the room before any งาน was assigned. Production receives a 404.
 */
export default async function StudentAbilityLabPage({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string | string[] }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { empty } = await searchParams
  return <StudentAbilityLabClient empty={empty === '1'} />
}
