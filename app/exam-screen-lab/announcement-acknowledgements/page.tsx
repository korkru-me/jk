import { notFound } from 'next/navigation'
import { AnnouncementAcknowledgementLab } from '@/components/classrooms/announcement-acknowledgement-lab'
import { ShellClient } from '@/components/layout/shell-client'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const metadata = { title: 'ประกาศและการรับทราบ · ตัวอย่าง — KorKru' }

export default async function AnnouncementAcknowledgementsLabPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { scenario } = await searchParams
  return <ShellClient user={{ id: 'lab-student', email: 'student@example.invalid', full_name: 'นักเรียนจำลอง', role: 'student' }} initialUnreadCount={0} notificationsEnabled={false}>
    <AnnouncementAcknowledgementLab simulateFailure={scenario === 'error'} />
  </ShellClient>
}
