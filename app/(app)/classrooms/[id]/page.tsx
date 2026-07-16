import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Classroom, User } from '@/lib/types'
import { ClassroomDetailClient } from './_components/classroom-detail-client'
import { StudentClassroomView, type StudentAssignmentRow } from './_components/student-classroom-view'
import { getClassroomPosts } from '@/lib/actions/classroom-posts'

export default async function ClassroomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users').select('role, full_name').eq('id', authUser!.id).single()
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'

  // Use admin client to bypass RLS recursion on classrooms ↔ classroom_students
  const admin = createAdminClient()

  const { data: classroom } = await admin
    .from('classrooms').select('*').eq('id', id).maybeSingle()
  if (!classroom) notFound()

  const c = classroom as Classroom

  // ─── Student path ─────────────────────────────────────────────────────────
  if (!isTeacher) {
    const { data: membership } = await admin
      .from('classroom_students')
      .select('id')
      .eq('classroom_id', id)
      .eq('student_id', authUser!.id)
      .maybeSingle()
    if (!membership) notFound()

    const [{ data: teacherProfile }, { count: studentCount }, { data: links }, posts] = await Promise.all([
      admin.from('users').select('full_name').eq('id', c.teacher_id).single(),
      admin.from('classroom_students').select('id', { count: 'exact', head: true }).eq('classroom_id', id),
      admin.from('assignment_classrooms').select('assignment_id').eq('classroom_id', id),
      getClassroomPosts(id),
    ])
    const assignmentIds = Array.from(new Set((links ?? []).map((l: any) => l.assignment_id)))

    const { data: assignmentRows } = assignmentIds.length > 0
      ? await admin
          .from('assignments')
          .select('id, title, question_ids, end_at, duration_minutes')
          .in('id', assignmentIds)
          .eq('status', 'published')
          .order('end_at', { ascending: true, nullsFirst: false })
      : { data: [] }
    const publishedIds = (assignmentRows ?? []).map((a: any) => a.id)

    const { data: subRows } = publishedIds.length > 0
      ? await admin
          .from('submissions')
          .select('id, assignment_id, status, total_score, max_score, attempt_number')
          .in('assignment_id', publishedIds)
          .eq('student_id', authUser!.id)
      : { data: [] }

    // Multiple attempts possible (exercise type) — keep the best-scoring one
    const subMap: Record<string, any> = {}
    for (const s of (subRows ?? []) as any[]) {
      const prev = subMap[s.assignment_id]
      if (!prev || (s.total_score ?? -1) > (prev.total_score ?? -1) ||
          ((s.total_score ?? -1) === (prev.total_score ?? -1) && s.attempt_number > prev.attempt_number)) {
        subMap[s.assignment_id] = s
      }
    }

    const assignments: StudentAssignmentRow[] = (assignmentRows ?? []).map((a: any) => ({
      id: a.id,
      title: a.title,
      question_ids: a.question_ids ?? [],
      end_at: a.end_at,
      duration_minutes: a.duration_minutes,
      submission: subMap[a.id]
        ? { id: subMap[a.id].id, status: subMap[a.id].status, total_score: subMap[a.id].total_score, max_score: subMap[a.id].max_score }
        : null,
    }))

    return (
      <StudentClassroomView
        classroom={c}
        teacherName={teacherProfile?.full_name ?? 'ครูผู้สอน'}
        studentCount={studentCount ?? 0}
        assignments={assignments}
        posts={posts}
      />
    )
  }

  // ─── Teacher / co-teacher path ────────────────────────────────────────────
  const isOwner = c.teacher_id === authUser!.id

  // Co-teacher permission for the current user (null if not a co-teacher)
  const { data: myCoTeacherRow } = await admin
    .from('classroom_co_teachers')
    .select('permission')
    .eq('classroom_id', id)
    .eq('user_id', authUser!.id)
    .maybeSingle()
  const myCoTeacherPermission = myCoTeacherRow?.permission as 'admin' | 'manage' | 'view' | undefined
  const canManage = isOwner || myCoTeacherPermission === 'admin' || myCoTeacherPermission === 'manage'

  // Co-teacher roster + active invites
  const { data: coTeacherRows } = await admin
    .from('classroom_co_teachers')
    .select('id, user_id, permission, created_at, users(id, full_name, email)')
    .eq('classroom_id', id)
    .order('created_at', { ascending: true })
  const coTeachers = (coTeacherRows ?? []).map((t: any) => ({
    id: t.id as string,
    userId: t.user_id as string,
    permission: t.permission as 'admin' | 'manage' | 'view',
    createdAt: t.created_at as string,
    fullName: t.users?.full_name ?? '',
    email: t.users?.email ?? '',
  }))

  const { data: inviteRows } = await admin
    .from('classroom_invitations')
    .select('id, token, permission, email, expires_at, created_at')
    .eq('classroom_id', id)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  const invites = (inviteRows ?? []).map((i: any) => ({
    id: i.id as string,
    token: i.token as string,
    permission: i.permission as 'admin' | 'manage' | 'view',
    email: i.email as string | null,
    expiresAt: i.expires_at as string,
    createdAt: i.created_at as string,
  }))

  // Students in this classroom
  const { data: memberships } = await admin
    .from('classroom_students')
    .select('student_id, users!inner(id, full_name, email)')
    .eq('classroom_id', id)

  const students = (memberships ?? []).map((m: any) => m.users) as Pick<User, 'id' | 'full_name' | 'email'>[]

  // Assignments linked to this classroom (via assignment_classrooms, not the
  // legacy single classroom_id column, so multi-classroom assignments count too)
  const { data: assignmentLinkRows } = await admin
    .from('assignment_classrooms')
    .select('assignment_id')
    .eq('classroom_id', id)
  const linkedAssignmentIds = Array.from(new Set((assignmentLinkRows ?? []).map((l: any) => l.assignment_id)))

  const assignmentCount = linkedAssignmentIds.length

  let classroomAssignments: {
    id: string; title: string; type: string; mode: string; status: string
    start_at: string | null; end_at: string | null; question_ids: string[]; created_at: string
  }[] = []
  let classroomSubmissions: {
    id: string; assignment_id: string; student_id: string; status: string
    total_score: number | null; max_score: number; submitted_at: string | null; attempt_number: number
  }[] = []
  let classroomExtensions: {
    id: string; assignment_id: string; student_id: string; extended_end_at: string; note: string | null
  }[] = []
  if (canManage && linkedAssignmentIds.length > 0) {
    const [{ data: assignmentRows }, { data: submissionRows }, { data: extensionRows }] = await Promise.all([
      admin
        .from('assignments')
        .select('id, title, type, mode, status, start_at, end_at, question_ids, created_at')
        .in('id', linkedAssignmentIds)
        .order('created_at', { ascending: false }),
      admin
        .from('submissions')
        .select('id, assignment_id, student_id, status, total_score, max_score, submitted_at, attempt_number')
        .in('assignment_id', linkedAssignmentIds),
      admin
        .from('assignment_extensions')
        .select('id, assignment_id, student_id, extended_end_at, note')
        .in('assignment_id', linkedAssignmentIds),
    ])
    classroomAssignments = assignmentRows ?? []
    classroomSubmissions = submissionRows ?? []
    classroomExtensions = extensionRows ?? []
  }

  // Other classrooms for "move student" feature
  let otherClassrooms: { id: string; name: string }[] = []
  if (isOwner) {
    const { data: others } = await admin
      .from('classrooms')
      .select('id, name')
      .eq('teacher_id', authUser!.id)
      .neq('id', id)
    otherClassrooms = (others ?? []) as { id: string; name: string }[]
  }

  // Owner's full name for co-teachers display
  const { data: ownerProfile } = await admin
    .from('users').select('full_name').eq('id', c.teacher_id).single()

  const posts = await getClassroomPosts(id)

  return (
    <ClassroomDetailClient
      classroom={c}
      students={students}
      assignmentCount={assignmentCount ?? 0}
      otherClassrooms={otherClassrooms}
      isOwner={isOwner}
      canManage={canManage}
      coTeachers={coTeachers}
      invites={invites}
      classroomAssignments={classroomAssignments}
      classroomSubmissions={classroomSubmissions}
      classroomExtensions={classroomExtensions}
      ownerName={ownerProfile?.full_name ?? 'ครูหลัก'}
      posts={posts}
    />
  )
}
