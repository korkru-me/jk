import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StudentClassroomView, type StudentAssignmentRow } from '@/app/(app)/classrooms/[id]/_components/student-classroom-view'
import { HomeroomStudentView } from '@/app/(app)/classrooms/[id]/_components/homeroom-student-view'
import { composeDescription, EMPTY_META } from '@/app/(app)/classrooms/_components/classroom-meta'
import { ShellClient } from '@/components/layout/shell-client'
import { Card } from '@/components/ui/card'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { buildHomeroomClassmates } from '@/lib/student-homeroom-classmates'
import type { Classroom, ClassroomPost } from '@/lib/types'
import type { AssignmentCategory } from '@/lib/assignment-categories'
import { classroomCalendarEvents } from '@/lib/student-classroom-work'
import type { ClassroomPracticeLibrariesResult } from '@/lib/classroom-practice-libraries'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ห้องเรียนนักเรียน · ตัวอย่าง — KorKru' }
const NOW = '2026-10-14T10:00:00+07:00'
const USER = { id: 'lab-student', email: 'student@example.invalid', full_name: 'นักเรียนจำลอง', role: 'student' as const }
const ROOM: Classroom = {
  id: 'lab-student-room', org_id: 'lab-org', teacher_id: 'lab-teacher', name: 'ฟิสิกส์ 1', class_code: 'MOCK01',
  status: 'active', classroom_type: 'subject', pinned_at: null, display_order: null, deleted_at: null,
  created_at: NOW, updated_at: NOW,
  description: composeDescription({ ...EMPTY_META, cover: 'orange', coverPattern: 'physics', iconKey: 'physics', gradeLevel: 'ม.4', academicTerm: '1/2569', capacityEnabled: true, maxCapacity: '30' }),
}
const CATEGORIES: AssignmentCategory[] = [
  { id: 'cat-completed', classroom_id: ROOM.id, name: 'บทเรียนที่ส่งครบแล้ว', color: 'green', position: -1 },
  { id: 'cat-simple', classroom_id: ROOM.id, name: 'ฟิสิกส์ง่าย', color: 'purple', position: 0 },
  { id: 'cat-group', classroom_id: ROOM.id, name: 'กลุ่มที่ 1', color: 'mint', position: 1 },
]
const BASE: StudentAssignmentRow = {
  id: 'work-overdue', title: 'ทดสอบ 5', question_ids: Array.from({ length: 12 }, (_, i) => `q-${i}`),
  random_question_count: null, completion_rule: 'fixed', end_at: '2026-10-13T16:00:00+07:00', duration_minutes: 50,
  type: 'exercise', max_attempts: null, completion_reached: false, retry_scope: 'all', passing_type: 'percent', passing_value: 70,
  show_results: 'immediate', category_id: 'cat-simple', attempts_used: 0, has_in_progress: false, submission: null,
}
const ASSIGNMENTS: StudentAssignmentRow[] = [
  { ...BASE, id: 'work-completed-group', title: 'งานในกลุ่มที่ส่งครบแล้ว', category_id: 'cat-completed', passing_type: null, attempts_used: 1, submission: { id: 'sub-completed-group', status: 'submitted', total_score: null, max_score: 10 } },
  BASE,
  { ...BASE, id: 'work-open', title: 'ทดสอบระบบตรวจกลับไปให้คะแนนเอง', question_ids: ['1','2','3','4','5'], end_at: null, duration_minutes: null, passing_type: null },
  { ...BASE, id: 'work-group', title: 'ทดสอบ 4', category_id: 'cat-group', end_at: null, duration_minutes: null },
  { ...BASE, id: 'work-exam', title: 'สอบกลางภาค · แรงและการเคลื่อนที่', type: 'exam', passing_type: null, end_at: '2026-10-17T16:00:00+07:00', max_attempts: 1 },
  { ...BASE, id: 'work-soon', title: 'ใบงานใกล้กำหนดส่ง', passing_type: null, end_at: '2026-10-15T16:00:00+07:00' },
  { ...BASE, id: 'work-resume', title: 'แบบฝึกหัดที่กำลังทำต่อ', category_id: 'cat-group', end_at: '2026-10-14T16:00:00+07:00', has_in_progress: true, attempts_used: 2, submission: { id: 'sub-old', status: 'graded', total_score: 45, max_score: 100 } },
  { ...BASE, id: 'work-retry', title: 'ทบทวนบทเรียน · แก้เฉพาะข้อที่ยังไม่เต็ม', retry_scope: 'wrong_only', passing_type: null, max_attempts: 3, attempts_used: 1, end_at: null, submission: { id: 'sub-retry', status: 'graded', total_score: 8, max_score: 10 } },
  { ...BASE, id: 'work-result', title: 'ข้อสอบที่ส่งแล้ว', type: 'exam', max_attempts: 1, passing_type: null, attempts_used: 1, submission: { id: 'sub-result', status: 'graded', total_score: 18, max_score: 20 } },
  { ...BASE, id: 'work-hidden', title: 'ข้อสอบที่ครูกำหนดไม่แสดงคะแนน', type: 'exam', max_attempts: 1, passing_type: null, show_results: 'never', attempts_used: 1, submission: { id: 'sub-hidden', status: 'graded', total_score: 17, max_score: 20 } },
  { ...BASE, id: 'work-after-due', title: 'ข้อสอบที่รอแสดงผลหลังปิดสอบ', type: 'exam', max_attempts: 1, passing_type: null, show_results: 'after_due', end_at: '2026-10-20T16:00:00+07:00', attempts_used: 1, submission: { id: 'sub-later', status: 'graded', total_score: 19, max_score: 20 } },
  { ...BASE, id: 'work-mastery', title: 'ทำถูกต่อเนื่องครบเงื่อนไขแล้ว', category_id: 'cat-group', completion_rule: 'streak', streak_target: 5, passing_type: null, completion_reached: true, attempts_used: 1, submission: { id: 'sub-mastery', status: 'graded', total_score: 7, max_score: 10 } },
  { ...BASE, id: 'work-long', title: 'แบบฝึกหัดทบทวนหลักการประยุกต์ใช้แรงและกฎการเคลื่อนที่ในชีวิตประจำวันสำหรับนักเรียนที่ต้องการทบทวนเพิ่มเติม', category_id: null, end_at: null, duration_minutes: null, passing_type: null },
]

// Synthetic presentation only. No database queries, seen writes or exam starts.
export default async function StudentClassroomLabPage({ searchParams }: { searchParams: Promise<{ scenario?: string; work?: string; complete?: string }> }) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { scenario, work, complete } = await searchParams
  const classroom = scenario === 'legacy' ? { ...ROOM, description: 'ห้องเรียนเดิมที่ยังไม่ได้เลือกสีปก' }
    : scenario?.startsWith('homeroom') ? { ...ROOM, name: 'ม.4/1', classroom_type: 'homeroom' as const, description: composeDescription({ ...EMPTY_META, cover: 'green', coverPattern: 'social-studies', gradeLevel: 'ม.4/1', academicTerm: '1/2569' }) }
    : ROOM
  const assignments = (scenario === 'empty' ? [] : ASSIGNMENTS).map(assignment => scenario === 'completed' || assignment.id === complete ? {
    ...assignment, completion_reached: true, has_in_progress: false, attempts_used: Math.max(1, assignment.attempts_used),
    submission: { id: `lab-completed-${assignment.id}`, status: 'graded', total_score: null, max_score: 10 },
  } : assignment)
  const practiceLibraries: ClassroomPracticeLibrariesResult | undefined = scenario?.startsWith('practice') ? {
    error: scenario === 'practice-error' ? 'ข้อผิดพลาดจำลองสำหรับตรวจการแสดงผล' : null,
    items: scenario === 'practice-empty' ? [] : [
      { id: 'lab-practice-1', title: 'ทดสอบคลังฝึกนะ', status: 'published', questionCount: 143 },
      ...(scenario === 'practice-one' ? [] : [
        { id: 'lab-practice-2', title: 'ทบทวนแรงและกฎการเคลื่อนที่ของนิวตันสำหรับนักเรียนที่ต้องการฝึกฝนเพิ่มเติม', status: 'published' as const, questionCount: 24 },
        { id: 'lab-practice-3', title: 'งานและพลังงาน', status: 'published' as const, questionCount: 0 },
        { id: 'lab-practice-4', title: 'LongPracticeLibraryTitle'.repeat(8), status: 'published' as const, questionCount: 500 },
      ]),
    ],
  } : undefined
  const selected = assignments.find(a => a.id === work)
  const subjectPosts: ClassroomPost[] = scenario === 'empty' ? [] : [{
    id: 'lab-subject-post', classroom_id: classroom.id, author_id: 'lab-teacher',
    body: 'ทบทวนบทเรียนและตรวจสอบกำหนดส่งงานก่อนเรียนครั้งถัดไป', pinned: false,
    attachments: [], created_at: NOW, updated_at: NOW, edited_at: null,
    users: { full_name: 'ครูผู้สอนจำลอง' }, comments: [],
  }]
  const assignmentHrefs = Object.fromEntries(assignments.map(a => [a.id, `/exam-screen-lab/student-classroom?work=${encodeURIComponent(a.id)}#preview-work`]))
  if (classroom.classroom_type === 'homeroom') {
    const classmates = buildHomeroomClassmates(Array.from({ length: 62 }, (_, i) => ({
      id: `lab-classmate-${i}`, full_name: '', prefix: i % 2 ? 'เด็กชาย' : 'เด็กหญิง',
      first_name: i === 0 ? 'ชื่อยาวสำหรับทดสอบการแสดงรายชื่อ' : `นักเรียน${i + 1}`,
      last_name: 'ตัวอย่าง',
    })), Array.from({ length: 62 }, (_, i) => ({ student_id: `lab-classmate-${i}`, class_number: i < 60 ? (i * 17) % 60 + 1 : null })), USER.id)
    const posts: ClassroomPost[] = Array.from({ length: 3 }, (_, i) => ({
      id: `lab-homeroom-post-${i}`, classroom_id: classroom.id, author_id: 'lab-teacher',
      body: i === 0 ? 'แจ้งนักเรียนเตรียมตัวสำหรับกิจกรรมห้องเรียนประจำสัปดาห์' : 'ประกาศจำลองจากครูที่ปรึกษาสำหรับตรวจการจัดวางและการเลื่อนหน้า',
      pinned: i === 0, attachments: [], created_at: NOW, updated_at: NOW, edited_at: null,
      users: { full_name: 'ครูที่ปรึกษาจำลอง' }, comments: [],
    }))
    return <ShellClient user={USER} initialUnreadCount={0} notificationsEnabled={false}>
      <HomeroomStudentView classroom={classroom} teacherName="ครูที่ปรึกษาจำลอง" studentCount={scenario === 'homeroom-empty' ? 1 : classmates.length + 1}
        classmates={scenario === 'homeroom-empty' ? [] : classmates}
        calendarEvents={scenario === 'homeroom-empty' ? [] : [...classroomCalendarEvents(ASSIGNMENTS, ROOM.name).map(event => ({ ...event, href: assignmentHrefs[event.id] })), { id: 'lab-other-subject', title: 'ใบงานคณิตศาสตร์จากอีกห้อง', classroomName: 'คณิตศาสตร์ 1', endAt: '2026-10-15T16:00:00+07:00', done: false, submissionId: null, href: '/exam-screen-lab/student-dashboard' }]}
        posts={scenario === 'homeroom-empty' ? [] : posts} trackSeen={false} initialNow={NOW}
        previewLabel="ตัวอย่างสำหรับตรวจหน้าตา · ห้องเรียน ประกาศ และเพื่อนร่วมชั้นจำลอง" backHref="/exam-screen-lab/student-dashboard#classrooms" />
    </ShellClient>
  }
  return (
    <ShellClient user={USER} initialUnreadCount={0} notificationsEnabled={false}>
        {selected && <Card id="preview-work" padding="md" className="flex scroll-mt-20 flex-col gap-2"><h2 className="font-semibold">{selected.title}</h2><p className="text-sm text-muted-foreground">เปิดการ์ดงานแล้ว · รายละเอียดจำลองสำหรับตรวจการกดทั้งกรอบ ไม่มีการเริ่มทำหรือส่งงานจริง</p><Link href={`/exam-screen-lab/student-classroom?complete=${encodeURIComponent(selected.id)}&tab=assignments`} className="text-sm text-primary hover:underline">จำลองทำงานเสร็จ</Link><Link href="/exam-screen-lab/student-classroom" className="text-sm text-primary hover:underline">กลับรายการงาน</Link></Card>}
        <StudentClassroomView classroom={classroom} teacherName="ครูผู้สอนจำลอง" studentCount={3} assignments={assignments} categories={scenario === 'empty' ? [] : CATEGORIES} posts={subjectPosts} practiceLibraries={practiceLibraries} trackSeen={false} backHref="/exam-screen-lab/student-dashboard#classrooms" assignmentHrefs={assignmentHrefs} initialNow={NOW} previewLabel="ตัวอย่างสำหรับตรวจหน้าตา · ห้องเรียนและงานจำลอง" />
    </ShellClient>
  )
}
