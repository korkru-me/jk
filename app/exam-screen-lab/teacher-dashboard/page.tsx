import { notFound } from 'next/navigation'
import { TeacherDashboard } from '@/app/(app)/dashboard/_components/teacher-dashboard'
import { DashboardWelcome } from '@/app/(app)/dashboard/_components/dashboard-welcome'
import { ShellClient } from '@/components/layout/shell-client'
import { composeDescription, EMPTY_META } from '@/app/(app)/classrooms/_components/classroom-meta'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'หน้าหลักครู · ตัวอย่าง — KorKru' }

const USER = { id: 'teacher-welcome-lab', email: 'teacher@example.invalid', full_name: 'ครูตัวอย่าง ใจดี', role: 'teacher' as const }

/** Synthetic presentation data only; no authentication or database calls. */
export default async function TeacherDashboardLabPage({ searchParams }: {
  searchParams: Promise<{ scenario?: string; hour?: string; day?: string }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { scenario, hour, day } = await searchParams
  const empty = scenario === 'empty'
  const fullName = scenario === 'long' ? 'ครูผู้สร้างการเรียนรู้ที่มีความหมาย ชื่อและนามสกุลยาวสำหรับตรวจการตัดบรรทัด' : scenario === 'blank' ? ' ' : USER.full_name
  const counts = { classroomsCount: empty ? 0 : 5, studentsCount: empty ? 0 : 211, questionsCount: empty ? 0 : 890, setsCount: empty ? 0 : 11 }
  const classroom = (id: string, name: string, cover: string, studentCount: number, assignmentCount: number) => ({
    id, name, classroom_type: 'subject' as const,
    description: composeDescription({ ...EMPTY_META, cover, gradeLevel: 'ม.4', academicTerm: '1/2569' }),
    studentCount, assignmentCount,
  })

  return (
    <ShellClient user={USER} initialUnreadCount={0} notificationsEnabled={false}>
      <p className="mb-2 text-xs text-muted-foreground">ตัวอย่างหน้าหลักครู · ข้อมูลจำลอง</p>
      {hour !== undefined ? (
        <div className="max-w-[1200px]">
          <DashboardWelcome fullName={fullName} {...counts} now={new Date(`2026-10-${['15', '16', '17'].includes(day ?? '') ? day : '15'}T${String(Math.max(0, Math.min(23, Number(hour) || 0))).padStart(2, '0')}:00:00+07:00`)} />
        </div>
      ) : (
        <TeacherDashboard
          currentUserId={USER.id}
          fullName={fullName}
          {...counts}
          classrooms={empty ? [] : [
            classroom('lab-physics', 'ฟิสิกส์ 1', 'orange', 3, 15),
            classroom('lab-mechanics-2', 'กลศาสตร์ 2', 'mint', 0, 0),
            classroom('lab-mechanics-1', 'กลศาสตร์ 1 2569', 'blue', 143, 1),
          ]}
          questionSets={[]}
          questions={[]}
        />
      )}
    </ShellClient>
  )
}
