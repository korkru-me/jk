import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Classroom, User } from '@/lib/types'
import { ClassroomDetailClient } from './_components/classroom-detail-client'
import { StudentClassroomView, type StudentAssignmentRow } from './_components/student-classroom-view'
import { HomeroomStudentView } from './_components/homeroom-student-view'
import { getClassroomPosts } from '@/lib/actions/classroom-posts'
import { getHomeroomAggregate } from '@/lib/homeroom-data'
import { selectOfficialAttempt } from '@/lib/scoring'
import { isAttemptExpired } from '@/lib/grading'
import type { StudentNoteRow } from './_components/homeroom-overview'
import type { CalendarEvent } from '@/app/(app)/dashboard/_components/assignment-calendar'

export default async function ClassroomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

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

    // Homeroom rooms have no assignments of their own — a student sees a
    // personal calendar/compliance view aggregated from their other
    // (subject) classrooms instead of an assignment list.
    if (c.classroom_type === 'homeroom') {
      const [{ data: teacherProfile }, { count: studentCount }, { data: classmateRows }, posts] = await Promise.all([
        admin.from('users').select('full_name').eq('id', c.teacher_id).single(),
        admin.from('classroom_students').select('id', { count: 'exact', head: true }).eq('classroom_id', id),
        admin
          .from('classroom_students')
          .select('student_id, users!inner(id, full_name)')
          .eq('classroom_id', id)
          .neq('student_id', authUser!.id),
        getClassroomPosts(id),
      ])
      const classmates = (classmateRows ?? []).map((m: any) => ({ id: m.users.id as string, full_name: m.users.full_name as string }))

      const { assignments, submissions } = await getHomeroomAggregate(admin, id, [authUser!.id])

      const now = Date.now()
      const isDone = (status?: string) => status === 'submitted' || status === 'graded'
      const bestByAssignment = new Map<string, typeof submissions[number]>()
      for (const s of submissions) {
        const prev = bestByAssignment.get(s.assignment_id)
        if (!prev || (s.total_score ?? -1) > (prev.total_score ?? -1)) bestByAssignment.set(s.assignment_id, s)
      }
      const dueAssignments = assignments.filter(a => !a.end_at || new Date(a.end_at).getTime() <= now)
      const complianceSubmitted = dueAssignments.filter(a => isDone(bestByAssignment.get(a.id)?.status)).length
      const complianceRate = dueAssignments.length > 0 ? Math.round((complianceSubmitted / dueAssignments.length) * 100) : null

      const calendarEvents: CalendarEvent[] = assignments
        .filter((a): a is typeof a & { end_at: string } => !!a.end_at)
        .map(a => ({
          id: a.id,
          title: a.title,
          classroomName: a.classroomName,
          endAt: a.end_at,
          done: isDone(bestByAssignment.get(a.id)?.status),
          submissionId: bestByAssignment.get(a.id)?.id ?? null,
        }))

      return (
        <HomeroomStudentView
          classroom={c}
          teacherName={teacherProfile?.full_name ?? 'ครูที่ปรึกษา'}
          studentCount={studentCount ?? 0}
          classmates={classmates}
          calendarEvents={calendarEvents}
          complianceRate={complianceRate}
          complianceSubmitted={complianceSubmitted}
          complianceTotal={dueAssignments.length}
          posts={posts}
        />
      )
    }

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
          .select('id, title, question_ids, end_at, duration_minutes, type, max_attempts, score_strategy, passing_type, passing_value')
          .in('id', assignmentIds)
          .eq('status', 'published')
          .order('end_at', { ascending: true, nullsFirst: false })
      : { data: [] }
    const publishedIds = (assignmentRows ?? []).map((a: any) => a.id)

    const { data: subRows } = publishedIds.length > 0
      ? await admin
          .from('submissions')
          .select('id, assignment_id, status, total_score, max_score, attempt_number, started_at')
          .in('assignment_id', publishedIds)
          .eq('student_id', authUser!.id)
      : { data: [] }

    // Multiple attempts are possible — reduce to the "official" score per
    // the assignment's own score_strategy, but also track the highest
    // attempt_number seen so the UI can tell whether retries remain against
    // max_attempts.
    const strategyByAssignment = new Map((assignmentRows ?? []).map((a: any) => [a.id, a.score_strategy]))
    const durationByAssignment = new Map((assignmentRows ?? []).map((a: any) => [a.id, a.duration_minutes]))
    const attemptsByAssignment: Record<string, any[]> = {}
    const attemptsUsed: Record<string, number> = {}
    const hasInProgress: Record<string, boolean> = {}
    for (const s of (subRows ?? []) as any[]) {
      attemptsUsed[s.assignment_id] = Math.max(attemptsUsed[s.assignment_id] ?? 0, s.attempt_number)
      // An abandoned in-progress attempt whose timer already ran out gets
      // force-finalized by startSubmission() on the next visit rather than
      // resumed — don't offer "ทำต่อ" for it here either.
      if (s.status === 'in_progress' && !isAttemptExpired(s.started_at, durationByAssignment.get(s.assignment_id) ?? null)) {
        hasInProgress[s.assignment_id] = true
      }
      ;(attemptsByAssignment[s.assignment_id] ??= []).push(s)
    }
    const subMap: Record<string, any> = {}
    for (const [assignmentId, attempts] of Object.entries(attemptsByAssignment)) {
      const official = selectOfficialAttempt(attempts, strategyByAssignment.get(assignmentId) ?? 'best')
      if (official) {
        subMap[assignmentId] = { ...official.representative, total_score: official.total_score, max_score: official.max_score }
      }
    }

    const assignments: StudentAssignmentRow[] = (assignmentRows ?? []).map((a: any) => ({
      id: a.id,
      title: a.title,
      question_ids: a.question_ids ?? [],
      end_at: a.end_at,
      duration_minutes: a.duration_minutes,
      type: a.type,
      max_attempts: a.max_attempts,
      passing_type: a.passing_type,
      passing_value: a.passing_value,
      attempts_used: attemptsUsed[a.id] ?? 0,
      has_in_progress: hasInProgress[a.id] ?? false,
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
    passing_type: 'score' | 'percent' | null; passing_value: number | null
    max_attempts: number | null; score_strategy: 'best' | 'average' | 'latest'
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
        .select('id, title, type, mode, status, start_at, end_at, question_ids, created_at, passing_type, passing_value, max_attempts, score_strategy')
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

  // Homeroom aggregate: pull assignments/submissions from the *other*
  // (subject) classrooms this roster's students belong to, since a homeroom
  // classroom has no assignments of its own — it only monitors them.
  const { assignments: homeroomAssignments, submissions: homeroomSubmissions } =
    c.classroom_type === 'homeroom' && canManage
      ? await getHomeroomAggregate(admin, id, students.map(s => s.id))
      : { assignments: [], submissions: [] }

  // Homeroom advisor's private per-student notes (health/family/behavior),
  // kept separate from grades.
  let studentNotes: StudentNoteRow[] = []
  if (c.classroom_type === 'homeroom' && canManage) {
    const { data: noteRows } = await admin
      .from('student_notes')
      .select('id, student_id, author_id, body, created_at')
      .eq('classroom_id', id)
      .order('created_at', { ascending: false })
    const authorIds = Array.from(new Set((noteRows ?? []).map((n: any) => n.author_id)))
    const { data: authorRows } = authorIds.length > 0
      ? await admin.from('users').select('id, full_name').in('id', authorIds)
      : { data: [] }
    const authorNameMap = new Map((authorRows ?? []).map((u: any) => [u.id as string, u.full_name as string]))
    studentNotes = (noteRows ?? []).map((n: any) => ({
      id: n.id as string,
      student_id: n.student_id as string,
      author_name: authorNameMap.get(n.author_id) ?? 'ครู',
      body: n.body as string,
      created_at: n.created_at as string,
    }))
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
      homeroomAssignments={homeroomAssignments}
      homeroomSubmissions={homeroomSubmissions}
      studentNotes={studentNotes}
      ownerName={ownerProfile?.full_name ?? 'ครูหลัก'}
      posts={posts}
    />
  )
}
