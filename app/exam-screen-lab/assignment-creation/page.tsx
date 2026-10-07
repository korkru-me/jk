import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { AssignmentCreationLabClient } from './_components/assignment-creation-lab-client'

export const dynamic = 'force-dynamic'

export default async function AssignmentCreationLabPage({ searchParams }: {
  searchParams: Promise<{ context?: string; type?: string }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const params = await searchParams
  return <AssignmentCreationLabClient contextual={params.context !== '0'} type={params.type === 'exercise' ? 'exercise' : 'exam'} />
}
