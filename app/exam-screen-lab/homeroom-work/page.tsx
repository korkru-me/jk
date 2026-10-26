import { notFound } from 'next/navigation'
import { HomeroomOverview } from '@/app/(app)/classrooms/[id]/_components/homeroom-overview'
import { ClassroomTheme } from '@/components/classrooms/classroom-theme'
import { ShellClient } from '@/components/layout/shell-client'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import type { HomeroomAssignmentRow } from '@/lib/homeroom-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ติดตามการบ้านโฮมรูม · ตัวอย่าง — KorKru' }

// Synthetic display only; no database reads or writes. Production returns 404.
export default function HomeroomWorkLab() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const students = Array.from({ length: 32 }, (_, i) => ({ id: `lab-${i}`, full_name: `นักเรียนตัวอย่าง ${i + 1}`, email: `student${i + 1}@example.invalid` }))
  const memberIds = students.filter((_, i) => i % 3 !== 2).map(s => s.id)
  const assignments: HomeroomAssignmentRow[] = Array.from({ length: 10 }, (_, i) => ({
    id: `lab-work-${i}`, title: i === 0 ? 'แรงและการเคลื่อนที่' : `ใบงานทบทวน ${i + 1}`,
    classroomId: 'lab-physics', classroomName: i === 2 ? 'ฟิสิกส์ 1 · ฟิสิกส์เพิ่มเติม' : 'ฟิสิกส์ 1',
    classroomStudentIds: memberIds,
    assignedStudentIds: i === 1 ? memberIds.filter(id => id === 'lab-0') : memberIds,
    end_at: '2026-10-26T09:00:00+07:00', passing_type: null, passing_value: null, score_strategy: 'best',
  }))
  return <ShellClient initialUnreadCount={0} notificationsEnabled={false} previewNavigationOnly user={{ id: 'lab-teacher', full_name: 'ครูตัวอย่าง', email: 'teacher@example.invalid', role: 'teacher' }}>
    <ClassroomTheme cover="green" className="flex min-w-0 flex-col gap-3 p-4">
      <p className="text-sm text-muted-foreground">ตัวอย่างการติดตามการบ้านโฮมรูม — ข้อมูลสังเคราะห์</p>
      <HomeroomOverview classroomId="lab-homeroom" students={students} assignments={assignments}
        submissions={[{ id: 'lab-sub', assignment_id: 'lab-work-0', student_id: 'lab-0', status: 'graded', total_score: 8, max_score: 10, submitted_at: '2026-10-25T09:00:00+07:00', attempt_number: 1 }]}
        notes={[]} profiles={{}} />
    </ClassroomTheme>
  </ShellClient>
}
