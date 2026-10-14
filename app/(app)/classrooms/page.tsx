import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import type { Classroom } from '@/lib/types'
import { TeacherViewClient } from './_components/teacher-view-client'
import { StudentView, type StudentClassroom } from './_components/student-view'
import { linkReachesGroup } from '@/lib/classroom-groups'
import { getStudentGroups } from '@/lib/classroom-groups-server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ห้องเรียน — KorKru' }

type ClassroomListRow = Classroom & {
  classroom_students: { count: number }[]
  assignment_classrooms: { count: number }[]
}

export default async function ClassroomsPage({
  searchParams,
}: {
  searchParams: Promise<{ join?: string | string[] }>
}) {
  const { join } = await searchParams
  const initialJoinCode = (Array.isArray(join) ? join[0] : join) ?? ''
  const supabase = await createClient()
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')
  const admin = createAdminClient()

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', authUser.id).single()
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'

  if (isTeacher) {
    const [activeRes, trashedRes] = await Promise.all([
      admin
        .from('classrooms')
        .select('id, org_id, teacher_id, name, description, class_code, status, classroom_type, pinned_at, display_order, deleted_at, created_at, updated_at, classroom_students(count), assignment_classrooms(count)')
        .eq('teacher_id', authUser.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      admin.from('classrooms').select('id', { count: 'exact', head: true }).eq('teacher_id', authUser.id).eq('status', 'deleted'),
    ])

    const rawClassrooms = (activeRes.data ?? []) as unknown as ClassroomListRow[]
    const studentCountMap: Record<string, number> = {}
    const assignmentCountMap: Record<string, number> = {}
    const classrooms = rawClassrooms.map(({ classroom_students, assignment_classrooms, ...classroom }) => {
      studentCountMap[classroom.id] = classroom_students?.[0]?.count ?? 0
      assignmentCountMap[classroom.id] = assignment_classrooms?.[0]?.count ?? 0
      return classroom
    })

    // Homeroom classrooms keep their own section; subject classrooms use the
    // teacher's manual order. Legacy pins are intentionally ignored now that
    // every subject card can be dragged directly.
    const cls = [
      ...classrooms.filter(c => c.classroom_type === 'homeroom'),
      ...classrooms
        .filter(c => c.classroom_type !== 'homeroom')
        .sort((a, b) => {
          const orderDiff = (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
          if (orderDiff !== 0) return orderDiff
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        }),
    ]

    return (
      <TeacherViewClient
        classrooms={cls}
        studentCountMap={studentCountMap}
        assignmentCountMap={assignmentCountMap}
        totalStudents={Object.values(studentCountMap).reduce((a, b) => a + b, 0)}
        totalAssignments={Object.values(assignmentCountMap).reduce((a, b) => a + b, 0)}
        trashedCount={trashedRes.count ?? 0}
      />
    )
  }

  // Student view
  const { data: memberships } = await admin
    .from('classroom_students')
    .select('classroom_id, classrooms(id, name, description, status, classroom_type)')
    .eq('student_id', authUser.id)

  const classrooms = (memberships ?? [])
    .map((m: any) => m.classrooms)
    .filter((c: any) => c && c.status === 'active') as StudentClassroom[]

  const classroomIds = classrooms.map(c => c.id)
  const [{ data: links }, { data: subRows }, groupOf] = classroomIds.length > 0
    ? await Promise.all([
        admin
          .from('assignment_classrooms')
          .select('assignment_id, classroom_id, group_ids, assignments!inner(status)')
          .in('classroom_id', classroomIds)
          .eq('assignments.status', 'published'),
        admin
          .from('submissions')
          .select('assignment_id, status')
          .eq('student_id', authUser.id)
          .in('status', ['submitted', 'graded']),
        getStudentGroups(admin, authUser.id, classroomIds),
      ])
    : [{ data: [] }, { data: [] }, new Map<string, string>()]

  const doneAssignmentIds = new Set(
    (subRows ?? []).map((s: any) => s.assignment_id)
  )

  const pendingCountMap: Record<string, number> = {}
  for (const l of (links ?? []) as any[]) {
    // งาน handed to another กลุ่มย่อย is not pending for this student.
    if (!linkReachesGroup(l.group_ids ?? null, groupOf.get(l.classroom_id))) continue
    if (!doneAssignmentIds.has(l.assignment_id)) {
      pendingCountMap[l.classroom_id] = (pendingCountMap[l.classroom_id] ?? 0) + 1
    }
  }

  return (
    <StudentView
      classrooms={classrooms}
      pendingCountMap={pendingCountMap}
      initialJoinCode={initialJoinCode}
    />
  )
}
