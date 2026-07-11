import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { JoinClassroomForm } from '@/components/classrooms/join-classroom-form'
import Link from 'next/link'
import type { Classroom } from '@/lib/types'
import { TeacherViewClient } from './_components/teacher-view-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ห้องเรียน — KorKru' }

export default async function ClassroomsPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const admin = createAdminClient()

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', authUser!.id).single()
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'

  if (isTeacher) {
    const [activeRes, archivedRes, trashedRes] = await Promise.all([
      admin.from('classrooms').select('*').eq('teacher_id', authUser!.id).eq('status', 'active').order('created_at', { ascending: false }),
      admin.from('classrooms').select('id', { count: 'exact', head: true }).eq('teacher_id', authUser!.id).eq('status', 'archived'),
      admin.from('classrooms').select('id', { count: 'exact', head: true }).eq('teacher_id', authUser!.id).eq('status', 'deleted'),
    ])

    const cls = (activeRes.data ?? []) as Classroom[]
    const classroomIds = cls.map(c => c.id)

    const [membershipRes, assignmentRes] = await Promise.all([
      classroomIds.length > 0
        ? admin.from('classroom_students').select('classroom_id').in('classroom_id', classroomIds)
        : { data: [] },
      classroomIds.length > 0
        ? admin.from('assignments').select('id, classroom_id').in('classroom_id', classroomIds)
        : { data: [] },
    ])

    const studentCountMap: Record<string, number> = {}
    const assignmentCountMap: Record<string, number> = {}
    for (const m of membershipRes.data ?? []) studentCountMap[m.classroom_id] = (studentCountMap[m.classroom_id] ?? 0) + 1
    for (const a of assignmentRes.data ?? []) assignmentCountMap[(a as any).classroom_id] = (assignmentCountMap[(a as any).classroom_id] ?? 0) + 1

    return (
      <TeacherViewClient
        classrooms={cls}
        studentCountMap={studentCountMap}
        assignmentCountMap={assignmentCountMap}
        totalStudents={Object.values(studentCountMap).reduce((a, b) => a + b, 0)}
        totalAssignments={Object.values(assignmentCountMap).reduce((a, b) => a + b, 0)}
        archivedCount={archivedRes.count ?? 0}
        trashedCount={trashedRes.count ?? 0}
      />
    )
  }

  // Student view
  const { data: memberships } = await admin
    .from('classroom_students')
    .select('classroom_id, classrooms(*)')
    .eq('student_id', authUser!.id)

  const classrooms = (memberships ?? [])
    .map((m: any) => m.classrooms)
    .filter((c: any) => c && c.status === 'active') as Classroom[]

  return <StudentView classrooms={classrooms} />
}

function StudentView({ classrooms }: { classrooms: Classroom[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">ห้องเรียนของฉัน</h1>
        <p className="text-sm text-gray-500 mt-0.5">{classrooms.length} ห้องเรียน</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-medium text-gray-700 mb-3">เข้าร่วมห้องเรียนใหม่</p>
        <JoinClassroomForm />
      </div>

      {classrooms.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-4xl mb-3">🏫</p>
          <p className="text-gray-500 font-medium">ยังไม่ได้เข้าร่วมห้องเรียนใด</p>
          <p className="text-sm text-gray-400 mt-1">กรอกรหัสห้องเรียนจากครูเพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classrooms.map((c) => (
            <Link
              key={c.id}
              href={`/classrooms/${c.id}`}
              className="block p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                <span className="shrink-0 text-2xl">🏫</span>
              </div>
              {c.description && (
                <p className="text-sm text-gray-400 mt-1 line-clamp-2">{c.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
