import { notFound } from 'next/navigation'
import { StudentDashboard } from '@/app/(app)/dashboard/_components/student-dashboard'
import type { CalendarEvent } from '@/app/(app)/dashboard/_components/assignment-calendar'
import { ShellClient } from '@/components/layout/shell-client'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ตัวอย่างหน้าหลักนักเรียน — KorKru' }

const USER = { id: '90000000-0000-4000-8000-000000000099', email: 'student@example.invalid', full_name: 'นักเรียนจำลอง', role: 'student' as const }
const EVENTS: CalendarEvent[] = [
  { id: 'calendar-midnight', title: 'ใบงานทบทวนบทที่ 1', classroomName: 'คณิตศาสตร์', endAt: '2026-10-13T17:30:00Z', done: false, submissionId: null },
  { id: 'calendar-physics', title: 'แบบฝึกหัดแรงและการเคลื่อนที่', classroomName: 'ฟิสิกส์ ม.4', endAt: '2026-10-14T16:00:00+07:00', done: false, submissionId: null },
  { id: 'calendar-thai', title: 'อ่านจับใจความและเขียนสรุป', classroomName: 'ภาษาไทย', endAt: '2026-10-14T23:59:00+07:00', done: false, submissionId: null },
  { id: 'calendar-done', title: 'คำศัพท์ประจำสัปดาห์', classroomName: 'ภาษาอังกฤษ', endAt: '2026-10-14T18:00:00+07:00', done: true, submissionId: 'calendar-submission' },
  { id: 'calendar-biology', title: 'โครงสร้างเซลล์', classroomName: 'ชีววิทยา', endAt: '2026-10-21T16:00:00+07:00', done: false, submissionId: null },
  { id: 'calendar-next-month', title: 'รายงานวิทยาศาสตร์', classroomName: 'วิทยาศาสตร์', endAt: '2026-11-03T16:00:00+07:00', done: false, submissionId: null },
]

// Presentation-only fixtures; this route never fetches real student data.
export default async function StudentDashboardLabPage({ searchParams }: {
  searchParams: Promise<{ scenario?: string }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { scenario } = await searchParams
  const calendarNow = scenario === 'leap' ? '2028-02-14T10:00:00+07:00' : '2026-10-14T10:00:00+07:00'
  const events = scenario === 'empty' ? [] : scenario === 'leap' ? [
    { ...EVENTS[1], endAt: '2028-02-29T16:00:00+07:00' },
  ] : scenario === 'busy' ? [
    ...EVENTS,
    ...Array.from({ length: 8 }, (_, index) => ({
      ...EVENTS[1], id: `calendar-busy-${index}`,
      classroomName: `ห้องวิชาที่มีชื่อยาวสำหรับทดสอบ ${index + 1}`,
      title: `งานเพิ่มเติม ${index + 1} ที่มีรายละเอียดชื่อยาวและต้องแสดงครบทุกงาน`,
    })),
  ] : EVENTS
  const pendingAssignments = events.filter(event => !event.done).slice(0, 6).map(event => ({
    id: event.id, title: event.title, question_ids: ['fixture-question'],
    random_question_count: null, completion_rule: 'fixed' as const, streak_target: null,
    classrooms: { name: event.classroomName }, end_at: event.endAt,
    duration_minutes: null, inProgress: false, submissionId: null,
  }))

  return (
    <ShellClient user={USER} initialUnreadCount={0} notificationsEnabled={false}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">ตัวอย่างสำหรับตรวจหน้าตา · ข้อมูลนักเรียนและงานจำลอง</p>
        <StudentDashboard user={USER} classroomsCount={5} pendingAssignments={pendingAssignments} calendarEvents={events} calendarNow={calendarNow} recentPosts={[]} />
      </div>
    </ShellClient>
  )
}
