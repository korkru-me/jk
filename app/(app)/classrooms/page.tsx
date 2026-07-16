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

  const classroomIds = classrooms.map(c => c.id)
  const { data: links } = classroomIds.length > 0
    ? await admin.from('assignment_classrooms').select('assignment_id, classroom_id').in('classroom_id', classroomIds)
    : { data: [] }
  const assignmentIds = Array.from(new Set((links ?? []).map((l: any) => l.assignment_id)))

  const { data: assignmentRows } = assignmentIds.length > 0
    ? await admin.from('assignments').select('id, status').in('id', assignmentIds).eq('status', 'published')
    : { data: [] }
  const publishedIds = new Set((assignmentRows ?? []).map((a: any) => a.id))

  const { data: subRows } = assignmentIds.length > 0
    ? await admin.from('submissions').select('assignment_id, status').eq('student_id', authUser!.id).in('assignment_id', assignmentIds)
    : { data: [] }
  const doneAssignmentIds = new Set(
    (subRows ?? []).filter((s: any) => s.status === 'submitted' || s.status === 'graded').map((s: any) => s.assignment_id)
  )

  const pendingCountMap: Record<string, number> = {}
  for (const l of (links ?? []) as any[]) {
    if (publishedIds.has(l.assignment_id) && !doneAssignmentIds.has(l.assignment_id)) {
      pendingCountMap[l.classroom_id] = (pendingCountMap[l.classroom_id] ?? 0) + 1
    }
  }

  return <StudentView classrooms={classrooms} pendingCountMap={pendingCountMap} />
}

function StudentView({ classrooms, pendingCountMap }: { classrooms: Classroom[]; pendingCountMap: Record<string, number> }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">ห้องเรียนของฉัน</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{classrooms.length} ห้องเรียน</p>
      </div>

      <div className="bg-card border rounded-2xl p-5">
        <p className="text-sm font-medium mb-3">เข้าร่วมห้องเรียนใหม่</p>
        <JoinClassroomForm />
      </div>

      {classrooms.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-2xl">
          <p className="text-4xl mb-3">🏫</p>
          <p className="text-muted-foreground font-medium">ยังไม่ได้เข้าร่วมห้องเรียนใด</p>
          <p className="text-sm text-muted-foreground/70 mt-1">กรอกรหัสห้องเรียนจากครูเพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classrooms.map((c) => {
            const pending = pendingCountMap[c.id] ?? 0
            return (
              <Link
                key={c.id}
                href={`/classrooms/${c.id}`}
                className="block p-5 bg-card border rounded-2xl hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold truncate">{c.name}</p>
                  <span className="shrink-0 text-2xl">🏫</span>
                </div>
                {c.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                )}
                {pending > 0 && (
                  <span className="inline-flex items-center gap-1 mt-3 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                    {pending} รอทำ
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
