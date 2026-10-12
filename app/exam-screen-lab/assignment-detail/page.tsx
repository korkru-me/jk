import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { SidebarContextProvider } from '@/components/layout/sidebar-context'
import { AssignmentDetailLabClient } from './_components/assignment-detail-lab-client'

export const metadata = { title: 'ห้องทดลองหน้ารายละเอียดงาน — KorKru' }
export const dynamic = 'force-dynamic'

/** Local/Staging-only fixture for the real teacher assignment-detail layout. */
export default async function AssignmentDetailLabPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { type } = await searchParams
  return (
    <SidebarContextProvider>
      <main className="min-h-screen bg-background p-4 sm:p-6">
        <AssignmentDetailLabClient assignmentType={type === 'exam' ? 'exam' : 'exercise'} />
      </main>
    </SidebarContextProvider>
  )
}
