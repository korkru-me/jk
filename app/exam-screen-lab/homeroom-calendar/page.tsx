import { notFound } from 'next/navigation'
import { HomeroomCalendar, type HomeroomCalendarEvent } from '@/app/(app)/classrooms/[id]/_components/homeroom-calendar'
import { ShellClient } from '@/components/layout/shell-client'
import { Card } from '@/components/ui/card'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ปฏิทินโฮมรูมจำลอง — KorKru', robots: { index: false, follow: false } }

export default function HomeroomCalendarLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const today = new Date()
  const events: HomeroomCalendarEvent[] = [
    { id: 'calendar-lab-physics', title: 'ใบงานแรงและการเคลื่อนที่', classroomName: 'ฟิสิกส์จำลอง', endAt: new Date(today.getFullYear(), today.getMonth(), 8, 16).toISOString(), doneCount: 1, totalStudents: 3 },
    { id: 'calendar-lab-math', title: 'แบบฝึกหัดสมการ', classroomName: 'คณิตศาสตร์จำลอง', endAt: new Date(today.getFullYear(), today.getMonth(), 8, 18).toISOString(), doneCount: 3, totalStudents: 3 },
    { id: 'calendar-lab-thai', title: 'อ่านจับใจความ', classroomName: 'ภาษาไทยจำลอง', endAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23).toISOString(), doneCount: 0, totalStudents: 3 },
  ]

  return <ShellClient user={{ id: 'calendar-lab-teacher', email: 'calendar@example.invalid', full_name: 'ครูจำลอง', role: 'teacher' }} initialUnreadCount={0} notificationsEnabled={false}>
    <div className="flex min-w-0 flex-col gap-3">
      <Card padding="md" className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">โฮมรูม · ปฏิทินจำลอง</h1>
        <p className="text-sm text-muted-foreground">LOCAL · ข้อมูลสมมติสำหรับตรวจขนาดและเลือกวัน ไม่อ่านหรือเขียนฐานข้อมูล</p>
      </Card>
      <HomeroomCalendar events={events} />
    </div>
  </ShellClient>
}
