import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/auth/server'
import type { Classroom, User } from '@/lib/types'
import { ClassroomDetailClient } from './_components/classroom-detail-client'
import { ClassroomEntryLoading } from './_components/classroom-entry-loading'
import { StudentClassroomView, type StudentAssignmentRow } from './_components/student-classroom-view'
import { HomeroomStudentView } from './_components/homeroom-student-view'
import { getClassroomPosts, getPostSeenByPost } from '@/lib/actions/classroom-posts'
import { getClassroomAnnouncementAcknowledgementStatus } from '@/lib/actions/classroom-announcement-acknowledgements'
import { isAnnouncementAcknowledgementEnabled } from '@/lib/classroom-announcement-acknowledgements'
import { getHomeroomAggregate } from '@/lib/homeroom-data'
import { selectOfficialAttempt, rescaleToDisplayMax } from '@/lib/scoring'
import { isAttemptExpired } from '@/lib/grading'
import { completionAttemptLimit, findPassingCompletion } from '@/lib/assignment-completion'
import { fetchAllRows, fetchRowsInChunks } from '@/lib/supabase/fetch-all-rows'
import { buildHomeroomClassmates, type HomeroomClassmateUser } from '@/lib/student-homeroom-classmates'
import type { StudentNoteRow, StudentProfileRow } from './_components/homeroom-overview'
import { loadStudentLearningCalendar } from '@/lib/student-learning-calendar.server'
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
  type ClassroomNavigationKey,
} from '@/lib/classroom-navigation'
import { backHrefFromSearchParams } from '@/lib/back-link'
import { ClassroomRecentViewTracker } from './_components/classroom-recent-view-tracker'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { loadClassroomPracticeLibraries } from '@/lib/classroom-practice-libraries.server'
import { loadClassroomRecentWork } from '@/lib/classroom-recent-work.server'
import { readWithVoidedScoreMetadata, withVoidedScoreMetadata } from '@/lib/voided-score-metadata.server'

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
  const showPracticeLibraries = isPracticeLibraryEnabled(process.env) && c.classroom_type === 'subject'

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
    // personal calendar aggregated from their other
    // (subject) classrooms instead of an assignment list.
    if (c.classroom_type === 'homeroom') {
      const [
        { data: teacherProfile },
        { count: studentCount },
        classmateResult,
        posts,
        calendarEvents,
      ] = await Promise.all([
        admin.from('users').select('full_name').eq('id', c.teacher_id).single(),
        admin.from('classroom_students').select('id', { count: 'exact', head: true }).eq('classroom_id', id),
        fetchAllRows((from, to) => admin.from('classroom_students')
          .select('student_id, users!classroom_students_student_id_fkey!inner(id, full_name, prefix, first_name, last_name)')
          .eq('classroom_id', id).neq('student_id', authUser.id).order('student_id').range(from, to)
          .returns<{ student_id: string; users: HomeroomClassmateUser }[]>()),
        getClassroomPosts(id),
        loadStudentLearningCalendar(admin, authUser.id),
      ])
      if (classmateResult.error) throw new Error('โหลดรายชื่อเพื่อนร่วมห้องไม่สำเร็จ')
      // Membership was verified above. Read only numbers for this room's peers;
      // no other student profile fields enter the student-facing projection.
      const numbers = await fetchRowsInChunks(classmateResult.rows.map(row => row.student_id), ids =>
        admin.from('student_profiles').select('student_id, class_number').in('student_id', ids)
          .returns<{ student_id: string; class_number: number | null }[]>(),
      )
      if (numbers.error) throw new Error('โหลดเลขที่เพื่อนร่วมห้องไม่สำเร็จ')
      const classmates = buildHomeroomClassmates(classmateResult.rows.map(row => row.users), numbers.rows, authUser.id)

      return (
        <HomeroomStudentView
          classroom={c}
          teacherName={teacherProfile?.full_name ?? 'ครูที่ปรึกษา'}
          studentCount={studentCount ?? 0}
          classmates={classmates}
          calendarEvents={calendarEvents}
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
      practiceLibraries,
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
      showPracticeLibraries
        ? loadClassroomPracticeLibraries(supabase, id, 'student_member')
        : Promise.resolve(null),
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

    const { data: queriedSubRows } = publishedIds.length > 0
      ? await fetchAllRows((from, to) => admin
          .from('submissions')
          .select('id, assignment_id, status, total_score, score_adjustment, max_score, streak_reached, attempt_number, started_at')
          .in('assignment_id', publishedIds)
          .eq('student_id', authUser!.id)
          .order('id').range(from, to)).then(({ rows, error }) => ({ data: rows, error }))
      : { data: [] }

    const rawSubRows = await withVoidedScoreMetadata(admin, queriedSubRows ?? [])
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
      // finalized only by an explicit waiting-room recovery POST rather than
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
        max_attempts: completionAttemptLimit(a),
        completion_reached: findPassingCompletion(a, (rawSubRows ?? []).filter(s => s.assignment_id === a.id)) != null,
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
        practiceLibraries={practiceLibraries}
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

  const initialNavigationItem = resolveClassroomNavigationKey(
    sp.view,
    classroomNavigationFor(c.classroom_type, canManage),
  )
  const rawView = Array.isArray(sp.view) ? sp.view[0] : sp.view
  const rawPeopleView = Array.isArray(sp.people) ? sp.people[0] : sp.people
  const initialPeopleView = rawView === 'groups' || rawPeopleView === 'groups' ? 'groups' : 'students'
  const backHref = backHrefFromSearchParams(sp, '/classrooms')
  // This shell contains only classroom metadata after the exact teaching
  // relationship check above; roster, scores and invitation tokens stay behind it.
  const summary = { id: c.id, name: c.name, description: c.description, classroom_type: c.classroom_type }
  return (
    <Suspense key={id} fallback={
      <ClassroomEntryLoading classroom={summary} canManage={canManage} initialNavigationItem={initialNavigationItem} backHref={backHref} />
    }>
      <TeacherClassroomContent
        classroom={c}
        supabase={supabase}
        admin={admin}
        actorId={authUser.id}
        isOwner={isOwner}
        canManage={canManage}
        hasGroups={hasGroups}
        canManageInvites={canManageInvites}
        myCoTeacherPermission={myCoTeacherPermission}
        showPracticeLibraries={showPracticeLibraries}
        initialNavigationItem={initialNavigationItem}
        initialPeopleView={initialPeopleView}
        backHref={backHref}
      />
    </Suspense>
  )
}

type TeacherSubmissionRow = {
  id: string; assignment_id: string; student_id: string; status: string
  total_score: number | null; score_adjustment: number | null; max_score: number
  submitted_at: string | null; attempt_number: number; voided_max_score?: number
}

/** Invoked only by the authenticated, exact-authorized teaching branch above. */
async function TeacherClassroomContent({
  classroom: c, supabase, admin, actorId, isOwner, canManage, hasGroups,
  canManageInvites, myCoTeacherPermission, showPracticeLibraries,
  initialNavigationItem, initialPeopleView, backHref,
}: {
  classroom: Classroom
  supabase: Awaited<ReturnType<typeof createClient>>
  admin: ReturnType<typeof createAdminClient>
  actorId: string
  isOwner: boolean
  canManage: boolean
  hasGroups: boolean
  canManageInvites: boolean
  myCoTeacherPermission: 'admin' | 'manage' | 'view' | undefined
  showPracticeLibraries: boolean
  initialNavigationItem: ClassroomNavigationKey
  initialPeopleView: 'students' | 'groups'
  backHref: string
}) {
  const id = c.id
  const isOverview = initialNavigationItem === 'overview'
  const isAssignments = initialNavigationItem === 'assignments'
  const isCoTeachers = initialNavigationItem === 'coteachers'
  const isScores = initialNavigationItem === 'scores'
  const needsProgress = isOverview || isAssignments || isScores || initialNavigationItem === 'ability'
  const isHomeroomAdvisor = c.classroom_type === 'homeroom' && canManage
  const needsPrivateProfiles = isHomeroomAdvisor && (initialNavigationItem === 'students' || initialNavigationItem === 'homeroom')

  const membershipsPromise = fetchAllRows((from, to) => admin
    .from('classroom_students')
    .select('student_id, roster_order, users!inner(id, full_name, email)')
    .eq('classroom_id', id).order('student_id').range(from, to))
  const linksPromise = c.classroom_type === 'subject'
    ? getAssignmentClassroomLinks(admin, id)
    : Promise.resolve([] as AssignmentClassroomLinkRow[])
  const postsPromise = isOverview ? getClassroomPosts(id) : Promise.resolve([])
  const acknowledgementsEnabled = isAnnouncementAcknowledgementEnabled(process.env)
  // Start receipt reads with announcements, independently of score/profile reads.
  const announcementStatusPromise = postsPromise.then(async posts => {
    const acknowledgementStatus = isOverview && canManage && acknowledgementsEnabled
      ? await getClassroomAnnouncementAcknowledgementStatus(id) : {}
    const seenByPost = isOverview && canManage && !acknowledgementsEnabled
      ? await getPostSeenByPost(posts.map(post => post.id)) : {}
    return {
      posts: canManage && acknowledgementsEnabled
        ? posts.map(post => ({ ...post, acknowledgementStatus: acknowledgementStatus[post.id] ?? { round: 1, remindedAt: null, studentIds: [] } }))
        : posts,
      seenByPost,
    }
  })

  const studentDataPromise = membershipsPromise.then(async ({ rows: memberships, error }) => {
    if (error) throw error
    const studentIds = memberships.map(membership => membership.student_id)
    const [homeroomWork, { data: noteRows }, { data: profileRows }] = await Promise.all([
      isHomeroomAdvisor && (isOverview || initialNavigationItem === 'homeroom')
        ? getHomeroomAggregate(admin, id, studentIds)
        : Promise.resolve({ assignments: [], submissions: [] }),
      needsPrivateProfiles
        ? admin.from('student_notes')
            .select('id, student_id, body, created_at, author:users!student_notes_author_id_fkey(full_name)')
            .eq('classroom_id', id).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      canManage && !isCoTeachers && studentIds.length > 0
        ? admin.from('student_profiles')
            .select(needsPrivateProfiles
              ? 'student_id, nickname, date_of_birth, gender, food_allergy, chronic_disease, grade_level, section_number, school_name, student_code, class_number, address, phone, guardians'
              : 'student_id, grade_level, section_number, class_number, student_code')
            .in('student_id', studentIds)
        : Promise.resolve({ data: [] }),
    ])
    return { homeroomWork, noteRows, profileRows }
  })

  const recentWorkPromise = isAssignments && canManage
    ? linksPromise.then(links => loadClassroomRecentWork(supabase, id, actorId,
        Array.from(new Set(links.map(link => link.assignment_id))), showPracticeLibraries))
    : Promise.resolve(null)

  const workPromise = Promise.all([membershipsPromise, linksPromise]).then(async ([membershipResult, links]) => {
    if (membershipResult.error) throw membershipResult.error
    const assignmentIds = Array.from(new Set(links.map(link => link.assignment_id)))
    const studentIds = membershipResult.rows.map(membership => membership.student_id)
    const rosterIds = new Set(studentIds)
    if (c.classroom_type !== 'subject' || !canManage || assignmentIds.length === 0 || isCoTeachers) {
      return { assignments: [], submissions: [] as TeacherSubmissionRow[], extensions: [], pendingReviewByAssignment: {} }
    }
    // Preserve all attempts used by official-score/completion selection, while
    // restricting a shared assignment to this classroom's current roster.
    const [{ data: assignmentRows }, submissionResult, { data: extensionRows }, { data: pendingAnswerRows }] = await Promise.all([
      admin.from('assignments')
        .select('id, title, type, mode, status, start_at, end_at, question_ids, random_question_count, completion_rule, streak_target, created_at, passing_type, passing_value, max_attempts, score_strategy, display_max_score')
        .in('id', assignmentIds).order('created_at', { ascending: false }),
      needsProgress && studentIds.length > 0
        ? readWithVoidedScoreMetadata(async includeVoided => {
            const result = await fetchRowsInChunks<TeacherSubmissionRow, string>(assignmentIds, async ids => {
              const pageResult = await fetchAllRows((from, to) => admin.from('submissions')
                .select(`id, assignment_id, student_id, status, total_score, score_adjustment, max_score, submitted_at, attempt_number${includeVoided ? ', voided_max_score' : ''}`)
                .in('assignment_id', ids).in('student_id', studentIds)
                .order('id').range(from, to).returns<TeacherSubmissionRow[]>())
              return { data: pageResult.rows, error: pageResult.error }
            })
            return { data: result.rows, error: result.error }
          })
        : Promise.resolve({ data: [] as TeacherSubmissionRow[], error: null }),
      isScores && studentIds.length > 0
        ? admin.from('assignment_extensions')
            .select('id, assignment_id, student_id, extended_end_at, note')
            .in('assignment_id', assignmentIds).in('student_id', studentIds)
        : Promise.resolve({ data: [] }),
      needsProgress && studentIds.length > 0
        ? admin.from('submission_answers')
            .select('submission_id, submissions!inner(assignment_id, student_id, status)')
            .in('submissions.assignment_id', assignmentIds).in('submissions.student_id', studentIds)
            .neq('submissions.status', 'in_progress').is('is_correct', null).limit(1000)
        : Promise.resolve({ data: [] }),
    ])
    if (submissionResult.error) throw submissionResult.error
    const pendingSubmissionIdsByAssignment = new Map<string, Set<string>>()
    // The Supabase relationship boundary currently infers the to-one join as an
    // array; its existing runtime shape is a single submissions object.
    for (const row of (pendingAnswerRows ?? []) as unknown as {
      submission_id: string; submissions: { assignment_id: string; student_id: string } | null
    }[]) {
      if (!row.submissions || !rosterIds.has(row.submissions.student_id)) continue
      const assignmentId = row.submissions.assignment_id
      let set = pendingSubmissionIdsByAssignment.get(assignmentId)
      if (!set) { set = new Set<string>(); pendingSubmissionIdsByAssignment.set(assignmentId, set) }
      set.add(row.submission_id)
    }
    const linkByAssignment = new Map(links.map(link => [link.assignment_id, link]))
    const displayMaxByAssignment = new Map((assignmentRows ?? []).map(assignment => [assignment.id, assignment.display_max_score as number | null]))
    return {
      assignments: (assignmentRows ?? []).map(assignment => ({
        ...assignment,
        display_order: linkByAssignment.get(assignment.id)?.display_order ?? null,
        group_ids: linkByAssignment.get(assignment.id)?.group_ids ?? null,
        category_id: linkByAssignment.get(assignment.id)?.category_id ?? null,
      })),
      submissions: rescaleToDisplayMax(submissionResult.data ?? [], row => displayMaxByAssignment.get(row.assignment_id) ?? null),
      extensions: extensionRows ?? [],
      pendingReviewByAssignment: Object.fromEntries(Array.from(pendingSubmissionIdsByAssignment, ([assignmentId, set]) => [assignmentId, set.size])),
    }
  })

  const [
    { data: coTeacherRows }, { data: inviteRows }, membershipResult, assignmentLinkRows,
    assignmentCategoryRows, { data: ownerProfile }, { data: otherClassroomRows },
    { data: coTeachingClassroomRows }, { data: groupRows }, { data: groupMemberRows },
    practiceLibraries, studentData, work, announcementStatus, recentWork,
  ] = await Promise.all([
    isCoTeachers
      ? admin.from('classroom_co_teachers')
          .select('id, user_id, permission, created_at, users(id, full_name, email)')
          .eq('classroom_id', id).order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    isCoTeachers && canManageInvites
      ? admin.from('classroom_invitations').select('id, token, permission, email, expires_at, created_at')
          .eq('classroom_id', id).is('used_at', null).gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    membershipsPromise,
    linksPromise,
    c.classroom_type === 'subject' && canManage && !isCoTeachers
      ? getAssignmentCategories(admin, id) : Promise.resolve([] as AssignmentCategory[]),
    admin.from('users').select('full_name').eq('id', c.teacher_id).single(),
    admin.from('classrooms').select('id, name, description, classroom_type, status, deleted_at')
      .eq('teacher_id', actorId).neq('id', id),
    admin.from('classroom_co_teachers').select('classrooms(id, name, description, classroom_type, status, deleted_at)')
      .eq('user_id', actorId),
    hasGroups && !isCoTeachers
      ? admin.from('classroom_groups').select('id, classroom_id, name, color, position')
          .eq('classroom_id', id).order('position').order('created_at')
      : Promise.resolve({ data: [] as ClassroomGroup[] }),
    hasGroups && !isCoTeachers
      ? admin.from('classroom_group_members').select('student_id, group_id').eq('classroom_id', id)
      : Promise.resolve({ data: [] as { student_id: string; group_id: string }[] }),
    isAssignments && showPracticeLibraries
      ? loadClassroomPracticeLibraries(supabase, id, isOwner ? 'classroom_owner'
          : myCoTeacherPermission === 'admin' ? 'co_teacher_admin'
          : myCoTeacherPermission === 'manage' ? 'co_teacher_manage' : 'co_teacher_view')
      : Promise.resolve(null),
    studentDataPromise,
    workPromise,
    announcementStatusPromise,
    recentWorkPromise,
  ])
  if (membershipResult.error) throw membershipResult.error

  const coTeachers = (coTeacherRows ?? []).map((teacher: any) => ({
    id: teacher.id as string, userId: teacher.user_id as string,
    permission: teacher.permission as 'admin' | 'manage' | 'view', createdAt: teacher.created_at as string,
    fullName: teacher.users?.full_name ?? '', email: teacher.users?.email ?? '',
  }))
  const invites = (inviteRows ?? []).map(invite => ({
    id: invite.id as string, token: invite.token as string, permission: invite.permission as 'admin' | 'manage' | 'view',
    email: invite.email as string | null, expiresAt: invite.expires_at as string, createdAt: invite.created_at as string,
  }))
  const students = membershipResult.rows
    .map((membership: any) => ({ ...membership.users, roster_order: membership.roster_order as number | null }))
    .sort((a: any, b: any) => (a.roster_order ?? Number.MAX_SAFE_INTEGER) - (b.roster_order ?? Number.MAX_SAFE_INTEGER)
      || a.full_name.localeCompare(b.full_name, 'th')) as (Pick<User, 'id' | 'full_name' | 'email'> & { roster_order: number | null })[]
  const rosterIds = new Set(students.map(student => student.id))
  const groupMembers = Object.fromEntries((groupMemberRows ?? [])
    .filter(member => rosterIds.has(member.student_id)).map(member => [member.student_id, member.group_id]))
  const studentNotes: StudentNoteRow[] = (studentData.noteRows ?? []).map((note: any) => ({
    id: note.id as string, student_id: note.student_id as string, author_name: note.author?.full_name ?? 'ครู',
    body: note.body as string, created_at: note.created_at as string,
  }))
  // Sensitive profile fields are absent from reads outside the advisor's people
  // and homeroom tabs, and normalized to the existing safe DTO elsewhere.
  const studentProfiles: Record<string, StudentProfileRow> = Object.fromEntries(
    (studentData.profileRows ?? []).map((profile: any) => [profile.student_id, needsPrivateProfiles ? profile : {
      student_id: profile.student_id, grade_level: profile.grade_level, section_number: profile.section_number,
      class_number: profile.class_number, student_code: profile.student_code,
      nickname: null, date_of_birth: null, gender: null, food_allergy: null, chronic_disease: null,
      school_name: null, address: null, phone: null, guardians: [],
    }]),
  )
  const switchableClassrooms: Array<Pick<Classroom, 'id' | 'name' | 'description'>> = []
  const seenClassroomIds = new Set<string>()
  const candidates = [c, ...(otherClassroomRows ?? []).filter(room => room.status === 'active' && !room.deleted_at),
    ...(coTeachingClassroomRows ?? []).map((row: any) => row.classrooms)
      .filter((room: any) => room?.status === 'active' && !room.deleted_at)]
  for (const room of candidates) {
    if (seenClassroomIds.has(room.id)) continue
    seenClassroomIds.add(room.id)
    switchableClassrooms.push({ id: room.id, name: room.name, description: room.description })
  }
  const crossPostTargets = switchableClassrooms.filter(room => room.id !== id)
    .map(room => ({ id: room.id, name: room.name }))

  return (
    <>
      {isOwner && <ClassroomRecentViewTracker classroomId={id} />}
      <ClassroomDetailClient
        key={id}
        classroom={c}
        switchableClassrooms={switchableClassrooms}
        students={students}
        assignmentCount={new Set(assignmentLinkRows.map(link => link.assignment_id)).size}
        isOwner={isOwner}
        canManage={canManage}
        coTeachers={coTeachers}
        invites={invites}
        classroomAssignments={work.assignments}
        practiceLibraries={practiceLibraries}
        recentWork={recentWork}
        assignmentCategories={assignmentCategoryRows}
        classroomSubmissions={work.submissions}
        classroomExtensions={work.extensions}
        homeroomAssignments={studentData.homeroomWork.assignments}
        homeroomSubmissions={studentData.homeroomWork.submissions}
        studentNotes={studentNotes}
        studentProfiles={studentProfiles}
        ownerName={ownerProfile?.full_name ?? 'ครูหลัก'}
        posts={announcementStatus.posts}
        pendingReviewByAssignment={work.pendingReviewByAssignment}
        seenByPost={announcementStatus.seenByPost}
        crossPostTargets={crossPostTargets}
        groups={groupRows ?? []}
        groupMembers={groupMembers}
        initialNavigationItem={initialNavigationItem}
        loadedNavigationItem={initialNavigationItem}
        initialPeopleView={initialPeopleView}
        backHref={backHref}
      />
    </>
  )
}
