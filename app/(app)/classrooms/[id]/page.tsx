import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/auth/server'
import type { Classroom, User } from '@/lib/types'
import { ClassroomDetailClient } from './_components/classroom-detail-client'
import { StudentClassroomView, type StudentAssignmentRow } from './_components/student-classroom-view'
import { HomeroomStudentView } from './_components/homeroom-student-view'
import { getClassroomPosts, getPostSeenByPost } from '@/lib/actions/classroom-posts'
import { getHomeroomAggregate } from '@/lib/homeroom-data'
import { selectOfficialAttempt, rescaleToDisplayMax } from '@/lib/scoring'
import { isAttemptExpired } from '@/lib/grading'
import type { StudentNoteRow, StudentProfileRow } from './_components/homeroom-overview'
import type { CalendarEvent } from '@/app/(app)/dashboard/_components/assignment-calendar'
import { linkReachesGroup, type ClassroomGroup } from '@/lib/classroom-groups'
import type { AssignmentCategory } from '@/lib/assignment-categories'
import {
  getAssignmentCategories,
  getAssignmentClassroomLinks,
  type AssignmentClassroomLinkRow,
} from '@/lib/assignment-category-data.server'
import {
  classroomNavigationFor,
  resolveClassroomNavigationKey,
} from '@/lib/classroom-navigation'
import { backHrefFromSearchParams } from '@/lib/back-link'

export default async function ClassroomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const supabase = await createClient()
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  // Use admin client to bypass RLS recursion on classrooms ↔ classroom_students
  const admin = createAdminClient()
  // Profile and classroom are independent. Fetching them together removes a
  // full database round-trip from every classroom page load.
  const [{ data: profile }, { data: classroom }] = await Promise.all([
    supabase.from('users').select('role, full_name').eq('id', authUser.id).single(),
    admin.from('classrooms').select('*').eq('id', id).maybeSingle(),
  ])
  if (!classroom) notFound()

  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'
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
      const [
        { data: teacherProfile },
        { count: studentCount },
        { data: classmateRows },
        posts,
        { assignments, submissions },
      ] = await Promise.all([
        admin.from('users').select('full_name').eq('id', c.teacher_id).single(),
        admin.from('classroom_students').select('id', { count: 'exact', head: true }).eq('classroom_id', id),
        admin
          .from('classroom_students')
          .select('student_id, users!inner(id, full_name)')
          .eq('classroom_id', id)
          .neq('student_id', authUser!.id),
        getClassroomPosts(id),
        getHomeroomAggregate(admin, id, [authUser!.id]),
      ])
      const classmates = (classmateRows ?? []).map((m: any) => ({ id: m.users.id as string, full_name: m.users.full_name as string }))

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

    const [
      { data: teacherProfile },
      { count: studentCount },
      links,
      assignmentCategoryRows,
      posts,
      { data: myGroup },
    ] = await Promise.all([
      admin.from('users').select('full_name').eq('id', c.teacher_id).single(),
      admin.from('classroom_students').select('id', { count: 'exact', head: true }).eq('classroom_id', id),
      getAssignmentClassroomLinks(admin, id),
      getAssignmentCategories(admin, id),
      getClassroomPosts(id),
      admin
        .from('classroom_group_members')
        .select('group_id')
        .eq('classroom_id', id)
        .eq('student_id', authUser!.id)
        .maybeSingle(),
    ])
    const assignmentIds = Array.from(new Set((links ?? []).map((l: any) => l.assignment_id)))
    const categoryByAssignment = new Map(
      (links ?? []).map((link: any) => [link.assignment_id as string, link.category_id as string | null]),
    )
    // งาน handed to กลุ่มย่อย the student is not in stay off this page — unless
    // they already started it (checked once their attempts are loaded below).
    const reachedIds = new Set(
      (links ?? [])
        .filter((l: any) => linkReachesGroup(l.group_ids ?? null, myGroup?.group_id))
        .map((l: any) => l.assignment_id as string)
    )

    const { data: assignmentRows } = assignmentIds.length > 0
      ? await admin
          .from('assignments')
          .select('id, title, question_ids, random_question_count, completion_rule, streak_target, end_at, duration_minutes, type, max_attempts, score_strategy, retry_scope, passing_type, passing_value, display_max_score, show_results')
          .in('id', assignmentIds)
          .eq('status', 'published')
          .order('end_at', { ascending: true, nullsFirst: false })
      : { data: [] }
    const publishedIds = (assignmentRows ?? []).map((a: any) => a.id)

    const { data: rawSubRows } = publishedIds.length > 0
      ? await admin
          .from('submissions')
          .select('id, assignment_id, status, total_score, max_score, attempt_number, started_at')
          .in('assignment_id', publishedIds)
          .eq('student_id', authUser!.id)
      : { data: [] }

    const displayMaxByAssignment = new Map((assignmentRows ?? []).map((a: any) => [a.id as string, a.display_max_score as number | null]))
    const subRows = rescaleToDisplayMax(
      (rawSubRows ?? []) as any[],
      row => displayMaxByAssignment.get(row.assignment_id) ?? null
    )

    // Multiple attempts are possible — reduce to the "official" score per
    // the assignment's own score_strategy, but also track the highest
    // attempt_number seen so the UI can tell whether retries remain against
    // max_attempts.
    const strategyByAssignment = new Map((assignmentRows ?? []).map((a: any) => [a.id, a.score_strategy]))
    const durationByAssignment = new Map((assignmentRows ?? []).map((a: any) => [a.id, a.duration_minutes]))
    const attemptsByAssignment: Record<string, any[]> = {}
    const attemptsUsed: Record<string, number> = {}
    const hasInProgress: Record<string, boolean> = {}
    for (const s of subRows) {
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

    const startedIds = new Set(subRows.map((row: any) => row.assignment_id as string))
    const assignments: StudentAssignmentRow[] = (assignmentRows ?? [])
      .filter((a: any) => reachedIds.has(a.id) || startedIds.has(a.id))
      .map((a: any) => ({
        id: a.id,
        title: a.title,
        question_ids: a.question_ids ?? [],
        random_question_count: a.random_question_count ?? null,
        completion_rule: a.completion_rule ?? null,
        streak_target: a.streak_target ?? null,
        end_at: a.end_at,
        duration_minutes: a.duration_minutes,
        type: a.type,
        max_attempts: a.max_attempts,
        retry_scope: a.retry_scope ?? 'all',
        passing_type: a.passing_type,
        passing_value: a.passing_value,
        show_results: a.show_results,
        category_id: categoryByAssignment.get(a.id) ?? null,
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
        categories={(assignmentCategoryRows ?? []) as AssignmentCategory[]}
        posts={posts}
      />
    )
  }

  // ─── Teacher / co-teacher path ────────────────────────────────────────────
  const isOwner = c.teacher_id === authUser!.id

  // Co-teacher permission for the current user (null if not a co-teacher)
  // The owner is always allowed to manage the room and does not need a
  // redundant co-teacher permission lookup.
  const myCoTeacherRow = isOwner
    ? null
    : (await admin
        .from('classroom_co_teachers')
        .select('permission')
        .eq('classroom_id', id)
        .eq('user_id', authUser.id)
        .maybeSingle()).data
  // Everything below is read with the admin client, so this is the only
  // authorization the teaching side gets: a teacher who neither owns the room
  // nor co-teaches it must not see its roster, co-teachers or invite links —
  // the same 404 a student outside the roster gets. Platform super admins are
  // not let in either; no classroom action accepts them yet (see
  // docs/SECURITY.md, "Supabase admin client").
  if (!isOwner && !myCoTeacherRow) notFound()
  const myCoTeacherPermission = myCoTeacherRow?.permission as 'admin' | 'manage' | 'view' | undefined
  const canManage = isOwner || myCoTeacherPermission === 'admin' || myCoTeacherPermission === 'manage'
  const hasGroups = c.classroom_type === 'subject' && (isOwner || myCoTeacherPermission !== undefined)
  // Invite links are bearer secrets: only the people RLS lets manage them
  // (classroom_invitations_owner_all) get the tokens. Anything handed to the
  // client is readable in the RSC payload even where the tab hides it.
  const canManageInvites = isOwner || myCoTeacherPermission === 'admin'

  // These datasets are independent after authorization. Start them together
  // instead of waiting for six sequential network round-trips.
  const [
    { data: coTeacherRows },
    { data: inviteRows },
    { data: memberships },
    assignmentLinkRows,
    assignmentCategoryRows,
    { data: ownerProfile },
    { data: otherClassroomRows },
    { data: coTeachingClassroomRows },
    posts,
    { data: groupRows },
    { data: groupMemberRows },
  ] = await Promise.all([
    admin
      .from('classroom_co_teachers')
      .select('id, user_id, permission, created_at, users(id, full_name, email)')
      .eq('classroom_id', id)
      .order('created_at', { ascending: true }),
    canManageInvites
      ? admin
          .from('classroom_invitations')
          .select('id, token, permission, email, expires_at, created_at')
          .eq('classroom_id', id)
          .is('used_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; token: string; permission: string; email: string | null; expires_at: string; created_at: string }[] }),
    admin
      .from('classroom_students')
      .select('student_id, roster_order, users!inner(id, full_name, email)')
      .eq('classroom_id', id),
    c.classroom_type === 'subject'
      ? getAssignmentClassroomLinks(admin, id)
      : Promise.resolve([] as AssignmentClassroomLinkRow[]),
    c.classroom_type === 'subject' && canManage
      ? getAssignmentCategories(admin, id)
      : Promise.resolve([] as AssignmentCategory[]),
    admin.from('users').select('full_name').eq('id', c.teacher_id).single(),
    admin
      .from('classrooms')
      .select('id, name, description, classroom_type, status, deleted_at')
      .eq('teacher_id', authUser.id)
      .neq('id', id),
    admin
      .from('classroom_co_teachers')
      .select('classrooms(id, name, description, classroom_type, status, deleted_at)')
      .eq('user_id', authUser.id),
    getClassroomPosts(id),
    // กลุ่มย่อย: only subject rooms have the tab, and only the room's own
    // teaching staff (owner or any co-teacher) get the arrangement.
    hasGroups
      ? admin
          .from('classroom_groups')
          .select('id, classroom_id, name, color, position')
          .eq('classroom_id', id)
          .order('position')
          .order('created_at')
      : Promise.resolve({ data: [] as ClassroomGroup[] }),
    hasGroups
      ? admin
          .from('classroom_group_members')
          .select('student_id, group_id')
          .eq('classroom_id', id)
      : Promise.resolve({ data: [] as { student_id: string; group_id: string }[] }),
  ])

  // Co-teacher roster + active invites
  const coTeachers = (coTeacherRows ?? []).map((t: any) => ({
    id: t.id as string,
    userId: t.user_id as string,
    permission: t.permission as 'admin' | 'manage' | 'view',
    createdAt: t.created_at as string,
    fullName: t.users?.full_name ?? '',
    email: t.users?.email ?? '',
  }))

  const invites = (inviteRows ?? []).map((i: any) => ({
    id: i.id as string,
    token: i.token as string,
    permission: i.permission as 'admin' | 'manage' | 'view',
    email: i.email as string | null,
    expiresAt: i.expires_at as string,
    createdAt: i.created_at as string,
  }))

  // A teacher-defined roster order is shared by the score matrix. Students
  // that have not been arranged yet follow alphabetically after saved rows.
  const students = (memberships ?? [])
    .map((m: any) => ({ ...m.users, roster_order: m.roster_order as number | null }))
    .sort((a: any, b: any) => (
      (a.roster_order ?? Number.MAX_SAFE_INTEGER) - (b.roster_order ?? Number.MAX_SAFE_INTEGER)
      || a.full_name.localeCompare(b.full_name, 'th')
    )) as (Pick<User, 'id' | 'full_name' | 'email'> & { roster_order: number | null })[]

  // Assignments linked to this classroom (via assignment_classrooms, not the
  // legacy single classroom_id column, so multi-classroom assignments count too)
  const linkedAssignmentIds = Array.from(new Set((assignmentLinkRows ?? []).map((l: any) => l.assignment_id)))
  const displayOrderByAssignment = new Map(
    (assignmentLinkRows ?? []).map((l: any) => [l.assignment_id as string, l.display_order as number | null])
  )
  const groupIdsByAssignment = new Map(
    (assignmentLinkRows ?? []).map((l: any) => [l.assignment_id as string, (l.group_ids ?? null) as string[] | null])
  )
  const categoryByAssignment = new Map(
    (assignmentLinkRows ?? []).map((l: any) => [l.assignment_id as string, (l.category_id ?? null) as string | null])
  )
  const assignmentCategories = (assignmentCategoryRows ?? []) as AssignmentCategory[]
  const groups = (groupRows ?? []) as ClassroomGroup[]
  // Members of students still on the roster only; the FK cascade makes a
  // leftover impossible, but the roster read and this one are not atomic.
  const rosterIdSet = new Set(students.map(s => s.id))
  const groupMembers: Record<string, string> = Object.fromEntries(
    ((groupMemberRows ?? []) as { student_id: string; group_id: string }[])
      .filter(m => rosterIdSet.has(m.student_id))
      .map(m => [m.student_id, m.group_id])
  )

  const assignmentCount = linkedAssignmentIds.length

  let classroomAssignments: {
    id: string; title: string; type: string; mode: string; status: string
    start_at: string | null; end_at: string | null; question_ids: string[]; random_question_count: number | null
    completion_rule: string | null; streak_target: number | null; created_at: string
    passing_type: 'score' | 'percent' | null; passing_value: number | null
    max_attempts: number | null; score_strategy: 'best' | 'average' | 'latest'
    display_order: number | null
    group_ids: string[] | null
    category_id: string | null
  }[] = []
  let classroomSubmissions: {
    id: string; assignment_id: string; student_id: string; status: string
    total_score: number | null; max_score: number; submitted_at: string | null; attempt_number: number
  }[] = []
  let classroomExtensions: {
    id: string; assignment_id: string; student_id: string; extended_end_at: string; note: string | null
  }[] = []
  // Auto-grading leaves `is_correct` null exactly on the answers a teacher has
  // to read (essays, manual fill-blanks). Answer rows are capped to keep this
  // classroom-level read bounded; the assignment tab shows the counts per งาน.
  const PENDING_REVIEW_ROW_CAP = 1000
  // How many hand-ins are waiting per งาน, keyed by assignment id.
  let pendingReviewByAssignment: Record<string, number> = {}
  if (c.classroom_type === 'subject' && canManage && linkedAssignmentIds.length > 0) {
    const rosterIds = new Set(students.map(s => s.id))
    const [{ data: assignmentRows }, { data: submissionRows }, { data: extensionRows }, { data: pendingAnswerRows }] = await Promise.all([
      admin
        .from('assignments')
        .select('id, title, type, mode, status, start_at, end_at, question_ids, random_question_count, completion_rule, streak_target, created_at, passing_type, passing_value, max_attempts, score_strategy, display_max_score')
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
      admin
        .from('submission_answers')
        .select('submission_id, submissions!inner(assignment_id, student_id, status)')
        .in('submissions.assignment_id', linkedAssignmentIds)
        .neq('submissions.status', 'in_progress')
        .is('is_correct', null)
        .limit(PENDING_REVIEW_ROW_CAP),
    ])

    // Same rows, also split per งาน so the "งานที่มอบหมาย" tab can put the
    // count on the งาน it belongs to instead of only on the overview total.
    const pendingSubmissionIdsByAssignment = new Map<string, Set<string>>()
    for (const row of (pendingAnswerRows ?? []) as any[]) {
      if (!rosterIds.has(row.submissions?.student_id)) continue
      const assignmentId = row.submissions?.assignment_id as string | undefined
      if (!assignmentId) continue
      let set = pendingSubmissionIdsByAssignment.get(assignmentId)
      if (!set) { set = new Set<string>(); pendingSubmissionIdsByAssignment.set(assignmentId, set) }
      set.add(row.submission_id as string)
    }
    pendingReviewByAssignment = Object.fromEntries(
      Array.from(pendingSubmissionIdsByAssignment, ([assignmentId, set]) => [assignmentId, set.size])
    )
    classroomAssignments = (assignmentRows ?? []).map(a => ({
      ...a,
      display_order: displayOrderByAssignment.get(a.id) ?? null,
      group_ids: groupIdsByAssignment.get(a.id) ?? null,
      category_id: categoryByAssignment.get(a.id) ?? null,
    }))
    const displayMaxByAssignment = new Map((assignmentRows ?? []).map(a => [a.id as string, (a as any).display_max_score as number | null]))
    classroomSubmissions = rescaleToDisplayMax(
      submissionRows ?? [],
      row => displayMaxByAssignment.get(row.assignment_id) ?? null
    )
    classroomExtensions = extensionRows ?? []
  }

  const isHomeroomAdvisor = c.classroom_type === 'homeroom' && canManage
  const studentIds = students.map(s => s.id)

  // Once the roster is known, aggregate work, private notes, and profile
  // rows are independent. Load them together rather than in three serial
  // stages. The explicit author relationship also removes the old follow-up
  // users query for note author names.
  const [
    { assignments: homeroomAssignments, submissions: homeroomSubmissions },
    { data: noteRows },
    { data: profileRows },
  ] = await Promise.all([
    isHomeroomAdvisor
      ? getHomeroomAggregate(admin, id, studentIds)
      : Promise.resolve({ assignments: [], submissions: [] }),
    isHomeroomAdvisor
      ? admin
          .from('student_notes')
          .select('id, student_id, body, created_at, author:users!student_notes_author_id_fkey(full_name)')
          .eq('classroom_id', id)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    canManage && studentIds.length > 0
      ? admin
          .from('student_profiles')
          .select(isHomeroomAdvisor
            ? 'student_id, nickname, date_of_birth, gender, food_allergy, chronic_disease, grade_level, section_number, school_name, student_code, class_number, address, phone, guardians'
            : 'student_id, grade_level, section_number, class_number, student_code')
          .in('student_id', studentIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const studentNotes: StudentNoteRow[] = (noteRows ?? []).map((n: any) => ({
    id: n.id as string,
    student_id: n.student_id as string,
    author_name: n.author?.full_name ?? 'ครู',
    body: n.body as string,
    created_at: n.created_at as string,
  }))

  // Roster columns (grade/section/class number) go to any teacher who can
  // manage this classroom, subject or homeroom, so they can see and sort by
  // them. The rest of student_profiles (DOB, health, address, guardians) is
  // sensitive and only ever leaves the server for the homeroom advisor —
  // subject teachers get those fields nulled out before this ever reaches
  // the client bundle, not just hidden in the UI.
  const studentProfiles: Record<string, StudentProfileRow> = Object.fromEntries(
    (profileRows ?? []).map((p: any) => [p.student_id, isHomeroomAdvisor ? p : {
      student_id: p.student_id,
      grade_level: p.grade_level,
      section_number: p.section_number,
      class_number: p.class_number,
      student_code: p.student_code,
      nickname: null, date_of_birth: null, gender: null, food_allergy: null, chronic_disease: null,
      school_name: null, address: null, phone: null, guardians: [],
    }])
  )

  // Other classrooms for "move student" feature (owners only).
  const ownedClassroomList = (otherClassroomRows ?? []) as {
    id: string; name: string; description: string | null; classroom_type: string
    status: string; deleted_at: string | null
  }[]
  const otherClassroomList = isOwner ? ownedClassroomList : []
  const otherClassrooms = otherClassroomList.map(({ id: classroomId, name }) => ({ id: classroomId, name }))
  const switchableClassrooms: Array<Pick<Classroom, 'id' | 'name' | 'description'>> = []
  const seenSwitchableClassroomIds = new Set<string>()
  const switchableCandidates = [
    c,
    ...ownedClassroomList.filter(row => row.status === 'active' && !row.deleted_at),
    ...(coTeachingClassroomRows ?? [])
      .map((row: any) => row.classrooms)
      .filter((row: any) => row?.status === 'active' && !row.deleted_at),
  ]
  for (const candidate of switchableCandidates) {
    if (!seenSwitchableClassroomIds.has(candidate.id)) {
      seenSwitchableClassroomIds.add(candidate.id)
      switchableClassrooms.push({
        id: candidate.id,
        name: candidate.name,
        description: candidate.description,
      })
    }
  }
  // Reusing or cross-posting an announcement is available in every other
  // active classroom this teacher can manage, including co-taught rooms. The
  // switchable list was already filtered to active, non-deleted classrooms.
  const crossPostTargets = switchableClassrooms
    .filter(row => row.id !== c.id)
    .map(({ id: classroomId, name }) => ({ id: classroomId, name }))

  // Who has seen each announcement. Only the teaching side can read these rows
  // (post_reads_select), and only this side has any use for them.
  const seenByPost = canManage ? await getPostSeenByPost(posts.map(p => p.id)) : {}
  const initialNavigationItem = resolveClassroomNavigationKey(
    sp.view,
    classroomNavigationFor(c.classroom_type, canManage),
  )
  const rawView = Array.isArray(sp.view) ? sp.view[0] : sp.view
  const rawPeopleView = Array.isArray(sp.people) ? sp.people[0] : sp.people
  const initialPeopleView = rawView === 'groups' || rawPeopleView === 'groups' ? 'groups' : 'students'
  const backHref = backHrefFromSearchParams(sp, '/classrooms')

  return (
    <ClassroomDetailClient
      classroom={c}
      switchableClassrooms={switchableClassrooms}
      students={students}
      assignmentCount={assignmentCount ?? 0}
      otherClassrooms={otherClassrooms}
      isOwner={isOwner}
      canManage={canManage}
      coTeachers={coTeachers}
      invites={invites}
      classroomAssignments={classroomAssignments}
      assignmentCategories={assignmentCategories}
      classroomSubmissions={classroomSubmissions}
      classroomExtensions={classroomExtensions}
      homeroomAssignments={homeroomAssignments}
      homeroomSubmissions={homeroomSubmissions}
      studentNotes={studentNotes}
      studentProfiles={studentProfiles}
      ownerName={ownerProfile?.full_name ?? 'ครูหลัก'}
      posts={posts}
      pendingReviewByAssignment={pendingReviewByAssignment}
      seenByPost={seenByPost}
      crossPostTargets={crossPostTargets}
      groups={groups}
      groupMembers={groupMembers}
      initialNavigationItem={initialNavigationItem}
      initialPeopleView={initialPeopleView}
      backHref={backHref}
    />
  )
}
