import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { ShellClient } from '@/components/layout/shell-client'
import { TeacherViewClient } from '@/app/(app)/classrooms/_components/teacher-view-client'
import type { Classroom } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Real list UI with synthetic rows; exercise selection only, never save/delete. */
export default async function ClassroomListLabPage({ searchParams }: { searchParams: Promise<{ empty?: string }> }) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const empty = (await searchParams).empty === '1'
  const rooms: Classroom[] = empty ? [] : Array.from({ length: 5 }, (_, index) => ({
    id: `10000000-0000-4000-8000-00000000000${index + 1}`,
    teacher_id: '10000000-0000-4000-8000-000000000009',
    org_id: '10000000-0000-4000-8000-000000000008',
    name: index === 0 ? 'ม.4/1' : `ห้องเรียนตัวอย่าง ${index + 1}`,
    description: null, class_code: `LAB00${index + 1}`, status: 'active',
    classroom_type: index === 0 ? 'homeroom' : 'subject',
    pinned_at: null, display_order: index, deleted_at: null,
    created_at: '2026-10-15T00:00:00.000Z', updated_at: '2026-10-15T00:00:00.000Z',
  }))
  return <ShellClient user={{ id: 'lab-teacher', email: 'teacher@example.invalid', full_name: 'ครูตัวอย่าง', role: 'teacher' }} initialUnreadCount={0} notificationsEnabled={false}>
    <p className="mb-3 text-xs text-muted-foreground">ข้อมูลสมมติสำหรับตรวจหน้าตาในเครื่อง · ทดสอบเลือกและยกเลิกเท่านั้น</p>
    <TeacherViewClient classrooms={rooms}
      studentCountMap={Object.fromEntries(rooms.map((room, i) => [room.id, i === 0 ? 51 : 40]))}
      assignmentCountMap={Object.fromEntries(rooms.map((room, i) => [room.id, i === 0 ? 5 : 4]))}
      totalStudents={empty ? 0 : 211} totalAssignments={empty ? 0 : 21} />
  </ShellClient>
}
