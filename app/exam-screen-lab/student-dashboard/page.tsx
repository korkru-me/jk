import { notFound } from 'next/navigation'
import { StudentDashboard } from '@/app/(app)/dashboard/_components/student-dashboard'
import type { CalendarEvent } from '@/app/(app)/dashboard/_components/assignment-calendar'
import { composeDescription, EMPTY_META } from '@/app/(app)/classrooms/_components/classroom-meta'
import { buildStudentLearningData, type LearningAssignment, type LearningSubmission } from '@/app/(app)/dashboard/_components/student-learning-data'
import type { StudentClassroom } from '@/app/(app)/classrooms/_components/student-view'
import { ShellClient } from '@/components/layout/shell-client'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'พื้นที่เรียนรู้ของฉัน · ตัวอย่าง — KorKru' }

const USER = { id: '90000000-0000-4000-8000-000000000099', email: 'student@example.invalid', full_name: 'นักเรียนจำลอง', role: 'student' as const }
const EVENTS: CalendarEvent[] = [
  { id: 'calendar-midnight', title: 'ใบงานทบทวนบทที่ 1', classroomName: 'คณิตศาสตร์', endAt: '2026-10-13T17:30:00Z', done: false, submissionId: null },
  { id: 'calendar-physics', title: 'แบบฝึกหัดแรงและการเคลื่อนที่', classroomName: 'ฟิสิกส์ ม.4', endAt: '2026-10-14T16:00:00+07:00', done: false, submissionId: null },
  { id: 'calendar-thai', title: 'อ่านจับใจความและเขียนสรุป', classroomName: 'ภาษาไทย', endAt: '2026-10-14T23:59:00+07:00', done: false, submissionId: null },
  { id: 'calendar-done', title: 'คำศัพท์ประจำสัปดาห์', classroomName: 'ภาษาอังกฤษ', endAt: '2026-10-14T18:00:00+07:00', done: true, submissionId: 'calendar-submission' },
  { id: 'calendar-biology', title: 'โครงสร้างเซลล์', classroomName: 'ชีววิทยา', endAt: '2026-10-21T16:00:00+07:00', done: false, submissionId: null },
  { id: 'calendar-next-month', title: 'รายงานวิทยาศาสตร์', classroomName: 'วิทยาศาสตร์', endAt: '2026-11-03T16:00:00+07:00', done: false, submissionId: null },
]

const CLASSROOMS: StudentClassroom[] = [
  { id: 'lab-homeroom', name: 'ม.4/1', status: 'active', classroom_type: 'homeroom', description: composeDescription({ ...EMPTY_META, cover: 'green', coverPattern: 'social-studies', gradeLevel: 'ม.4/1', academicTerm: '1/2569' }) },
  ...['คณิตศาสตร์', 'ฟิสิกส์ ม.4', 'ภาษาไทย', 'ภาษาอังกฤษ', 'ชีววิทยา', 'วิทยาศาสตร์'].map((name, index) => ({
    id: `lab-room-${index}`, name, status: 'active' as const, classroom_type: 'subject' as const,
    description: composeDescription({ ...EMPTY_META, cover: ['blue', 'orange', 'purple', 'sky', 'mint', 'amber'][index], iconKey: index === 1 ? 'physics' : 'school', coverPattern: index === 1 ? 'physics' : 'foreign-language', gradeLevel: 'ม.4', academicTerm: '1/2569' }),
  })),
]

async function previewJoinClassroom() {
  'use server'
  return { error: 'ตัวอย่างสำหรับตรวจหน้าตา — ไม่ได้เข้าร่วมห้องเรียนจริง' }
}

// Presentation-only fixtures; this route never fetches real student data.
export default async function StudentDashboardLabPage({ searchParams }: {
  searchParams: Promise<{ scenario?: string; join?: string }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { scenario, join = '' } = await searchParams
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
  const classrooms = scenario === 'empty' ? [] : scenario === 'busy' ? CLASSROOMS : CLASSROOMS.slice(0, 3)
  const assignments: LearningAssignment[] = events.map((event, index) => {
    const room = classrooms.find(c => c.name === event.classroomName) ?? CLASSROOMS[2]
    return {
      id: event.id, classroom_id: room.id, title: event.title, end_at: event.endAt,
      created_at: `2026-10-${String(Math.max(1, 14 - index)).padStart(2, '0')}T09:00:00+07:00`,
      type: 'exercise', duration_minutes: event.id === 'calendar-physics' ? 30 : null,
      passing_type: 'percent', passing_value: 60, score_strategy: 'best', display_max_score: null,
      show_results: event.id === 'calendar-thai' ? 'never' : 'immediate',
      assignment_classrooms: [{ classroom_id: room.id, group_ids: null }],
    }
  })
  if (scenario !== 'empty' && scenario !== 'leap') assignments.push({
    ...assignments[1], id: 'work-without-deadline', title: 'ทบทวนบทเรียน · ไม่มีกำหนดส่ง', end_at: null,
  })
  const submissions: LearningSubmission[] = assignments.flatMap(a => {
    if (scenario !== 'completed' && !['calendar-done', 'calendar-thai', 'calendar-physics'].includes(a.id)) return []
    const room = CLASSROOMS.find(c => c.id === a.classroom_id)!
    return [{
      id: `submission-${a.id}`, assignment_id: a.id, assignments: { ...a, classrooms: { name: room.name } },
      total_score: scenario === 'completed' || a.id === 'calendar-done' ? 9 : 3, max_score: 10, score_adjustment: 0,
      status: scenario !== 'completed' && a.id === 'calendar-physics' ? 'in_progress' : 'graded', attempt_number: 1,
      created_at: '2026-10-13T16:00:00+07:00',
    }]
  })
  const data = buildStudentLearningData({ classrooms, assignments, submissions, now: Date.parse(calendarNow) })

  return (
    <ShellClient user={USER} initialUnreadCount={0} notificationsEnabled={false}>
        <StudentDashboard user={USER} data={data} calendarNow={calendarNow} initialJoinCode={join} joinAction={previewJoinClassroom}
          previewLabel="ตัวอย่างสำหรับตรวจหน้าตา · ข้อมูลนักเรียนและงานจำลอง"
          backHref="/exam-screen-lab/student-dashboard#classrooms"
          recentPosts={scenario === 'empty' ? [] : CLASSROOMS.slice(0, 3).map(c => ({ id: `post-${c.id}`, classroom_id: c.id, body: 'อย่าลืมทบทวนเรื่องแรงและการเคลื่อนที่ก่อนเรียนครั้งถัดไปนะครับ', created_at: calendarNow, users: { full_name: 'ครูจำลอง' }, classrooms: { name: c.name } }))}
        />
    </ShellClient>
  )
}
