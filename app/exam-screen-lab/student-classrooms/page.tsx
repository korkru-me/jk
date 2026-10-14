import { notFound } from 'next/navigation'
import { StudentView, type StudentClassroom } from '@/app/(app)/classrooms/_components/student-view'
import { composeDescription, EMPTY_META } from '@/app/(app)/classrooms/_components/classroom-meta'
import { ShellClient } from '@/components/layout/shell-client'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ตัวอย่างห้องเรียนของนักเรียน — KorKru' }

const CLASSROOMS: StudentClassroom[] = [
  {
    id: '90000000-0000-4000-8000-000000000001',
    name: 'ม.4/1', status: 'active', classroom_type: 'homeroom',
    description: composeDescription({ ...EMPTY_META, cover: 'green', coverPattern: 'social-studies', gradeLevel: 'ม.4/1', academicTerm: '1/2569' }),
  },
  {
    id: '90000000-0000-4000-8000-000000000002',
    name: 'กลศาสตร์ 2', status: 'active', classroom_type: 'subject',
    description: composeDescription({ ...EMPTY_META, cover: 'mint', coverPattern: 'physics', iconKey: 'physics', gradeLevel: 'ม.4', academicTerm: '1/2569' }),
  },
  {
    id: '90000000-0000-4000-8000-000000000003',
    name: 'ทดสอบ สอบแก้กลางภาค', status: 'active', classroom_type: 'subject',
    description: composeDescription({ ...EMPTY_META, cover: 'blue', coverPattern: 'foreign-language', iconKey: 'physics', gradeLevel: 'ม.4', academicTerm: '1/2569' }),
  },
  {
    id: '90000000-0000-4000-8000-000000000004',
    name: 'ห้องเรียนเดิมที่มีชื่อยาวมากสำหรับทดสอบการจัดวางบนหน้าจอมือถือ', status: 'active', classroom_type: 'subject',
    description: 'คำอธิบายห้องเดิมที่ยังไม่ได้เลือกสีและลายตกแต่ง',
  },
]

// Synthetic presentation only, gated to local/Staging by the shared lab policy.
async function previewJoinClassroom() {
  'use server'
  return { error: 'ตัวอย่างสำหรับตรวจหน้าตา — ไม่ได้เข้าร่วมห้องเรียนจริง' }
}

export default async function StudentClassroomsLabPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; join?: string }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { scenario, join = '' } = await searchParams
  const classrooms = scenario === 'empty' ? [] : CLASSROOMS.filter(classroom => (
    scenario === 'subjects' ? classroom.classroom_type === 'subject'
      : scenario === 'homeroom' ? classroom.classroom_type === 'homeroom'
        : true
  ))

  return (
    <ShellClient
      user={{ id: '90000000-0000-4000-8000-000000000099', email: 'student@example.invalid', full_name: 'นักเรียนจำลอง', role: 'student' }}
      initialUnreadCount={0}
      notificationsEnabled={false}
    >
      <div className="flex flex-col gap-4" data-student-classrooms-lab>
        <p className="text-xs text-muted-foreground">ตัวอย่างสำหรับตรวจหน้าตา · ข้อมูลห้องเรียนจำลอง</p>
        <StudentView
          classrooms={classrooms}
          pendingCountMap={{ '90000000-0000-4000-8000-000000000003': 11 }}
          initialJoinCode={join}
          joinAction={previewJoinClassroom}
        />
      </div>
    </ShellClient>
  )
}
