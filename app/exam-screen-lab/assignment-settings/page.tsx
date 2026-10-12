import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { AssignmentSettingsLabClient } from './_components/assignment-settings-lab-client'

export const dynamic = 'force-dynamic'

export default async function AssignmentSettingsLabPage({ searchParams }: {
  searchParams: Promise<{ type?: string; started?: string }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const params = await searchParams
  return (
    <AssignmentSettingsLabClient
      type={params.type === 'exercise' ? 'exercise' : 'exam'}
      hasSubmissions={params.started === '1'}
    />
  )
}
