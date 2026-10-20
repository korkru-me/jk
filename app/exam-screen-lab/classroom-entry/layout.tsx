import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { ClassroomEntryLabShell } from './classroom-entry-lab-shell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ทดลองเข้าและเปลี่ยนแท็บห้องเรียน — KorKru', robots: { index: false, follow: false } }

export default function ClassroomEntryLabLayout({ children }: { children: React.ReactNode }) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <ClassroomEntryLabShell>{children}</ClassroomEntryLabShell>
}
