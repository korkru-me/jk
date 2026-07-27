import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { JoinClassroomForm } from '@/components/classrooms/join-classroom-form'
import Link from 'next/link'
import { Home, GraduationCap, ArrowRight } from 'lucide-react'
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

    const rawClassrooms = (activeRes.data ?? []) as Classroom[]
    // Homeroom classrooms lead the list (there are only ever a handful);
    // subject classrooms follow, most-recently-pinned first.
    const cls = [
      ...rawClassrooms.filter(c => c.classroom_type === 'homeroom'),
      ...rawClassrooms
        .filter(c => c.classroom_type !== 'homeroom')
        .sort((a, b) => {
          const pinDiff = (b.pinned_at ? new Date(b.pinned_at).getTime() : 0) - (a.pinned_at ? new Date(a.pinned_at).getTime() : 0)
          if (pinDiff !== 0) return pinDiff
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        }),
    ]
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
  const homeroomClassrooms = classrooms.filter(c => c.classroom_type === 'homeroom')
  const subjectClassrooms = classrooms.filter(c => c.classroom_type !== 'homeroom')

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
        <div className="space-y-6">
          {homeroomClassrooms.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <GraduationCap className="w-3.5 h-3.5" /> ห้อง Homeroom
              </div>
              <div className="space-y-3">
                {homeroomClassrooms.map(c => (
                  <Link
                    key={c.id}
                    href={`/classrooms/${c.id}`}
                    className="flex items-center gap-5 bg-gradient-to-r from-slate-800 via-slate-800 to-indigo-900 rounded-2xl px-6 py-5 hover:opacity-90 transition-opacity"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                      <Home className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">ครูที่ปรึกษาประจำชั้น</p>
                      <p className="text-white font-bold text-xl leading-tight truncate mt-0.5">{c.name}</p>
                      {c.description && (
                        <p className="text-white/50 text-xs mt-1 truncate">{c.description}</p>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-sm font-medium text-indigo-300 shrink-0">
                      เข้าห้อง <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {homeroomClassrooms.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                🏫 ห้องเรียนวิชา
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjectClassrooms.map((c) => {
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
          </div>
        </div>
      )}
    </div>
  )
}
