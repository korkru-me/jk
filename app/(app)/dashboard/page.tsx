import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/auth/server'
import type { User } from '@/lib/types'
import {
  TeacherDashboard, type DashboardClassroom,
} from './_components/teacher-dashboard'
import type { CalendarEvent } from './_components/assignment-calendar'
import { StudentDashboard, type StudentDashboardPost } from './_components/student-dashboard'
import { computePassed } from '@/lib/grading'
import { rescaleToDisplayMax } from '@/lib/scoring'
import { filterAssignmentsForStudent } from '@/lib/classroom-groups-server'
import { getQuestionCardData } from '@/lib/actions/question-card-data'
import type { QuestionCardRow } from '@/components/questions/question-card'
import { sortClassroomsByRecentViews } from '@/lib/classroom-recency'

export const metadata = { title: 'หน้าหลัก — KorKru' }

/** How many rows each "recent" list on the teacher home shows. */
const RECENT_LIMIT = 5

export default async function DashboardPage() {
  const supabase = await createClient()
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('id, full_name, role')
    .eq('id', authUser.id)
    .single()

  if (!profile) redirect('/login')

  const user = profile as Pick<User, 'id' | 'full_name' | 'role'>

  if (user.role === 'teacher' || user.role === 'admin') {
    // Everything shown to a teacher is their own real data. Counts come back
    // with the first page of rows (`count: 'exact'` alongside `limit`), so the
    // totals and the previews cost one query each rather than two.
    const [classroomsRes, questionsRes, setsRes, recentClassroomViewsRes, teamsRes] = await Promise.all([
      // Roster and assignment tallies ride along on the classroom relation,
      // the same way the classroom list page reads them.
      admin
        .from('classrooms')
        .select('id, name, description, classroom_type, created_at, classroom_students(count), assignment_classrooms(count)')
        .eq('teacher_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase
        .from('questions')
        .select('id, title, question_text, question_type, difficulty, tags, group_id, order_in_group, subject, question_categories(name)', { count: 'exact' })
        .eq('created_by', user.id)
        .eq('is_research_snapshot', false)
        // Grouped questions are stored one row per member; only the first row
        // represents the question in a list.
        .or('group_id.is.null,order_in_group.eq.0')
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT),
      supabase
        .from('question_sets')
        .select('id, title, question_ids, sections', { count: 'exact' })
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT),
      supabase
        .from('classroom_recent_views')
        .select('classroom_id, viewed_at')
        .eq('user_id', user.id),
      supabase
        .from('organization_members')
        .select('organizations!inner(id, name, is_personal)')
        .eq('user_id', user.id)
        .eq('organizations.is_personal', false),
    ])

    // A set's question_ids keep pointing at deleted questions, so the stored
    // length overstates the set. Resolve which ids still exist and count only
    // those — the same rule the set library itself displays.
    const setRows = (setsRes.data ?? []) as any[]
    const referencedIds = Array.from(new Set(setRows.flatMap(set => set.question_ids ?? [])))
    const questionRows = (questionsRes.data ?? []) as unknown as QuestionCardRow[]
    const [questionCardData, { data: liveQuestions }] = await Promise.all([
      getQuestionCardData(questionRows.map(question => question.id)),
      referencedIds.length > 0
        ? supabase.from('questions').select('id').in('id', referencedIds)
        : Promise.resolve({ data: [] as { id: string }[] }),
    ])
    const liveQuestionIds = new Set((liveQuestions ?? []).map(q => q.id))

    const classroomRows = sortClassroomsByRecentViews(
      (classroomsRes.data ?? []) as any[],
      (recentClassroomViewsRes.data ?? []) as { classroom_id: string; viewed_at: string }[],
    )
    const classrooms: DashboardClassroom[] = classroomRows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      classroom_type: row.classroom_type,
      studentCount: row.classroom_students?.[0]?.count ?? 0,
      assignmentCount: row.assignment_classrooms?.[0]?.count ?? 0,
    }))

    return (
      <TeacherDashboard
        currentUserId={user.id}
        classroomsCount={classrooms.length}
        questionsCount={questionsRes.count ?? 0}
        setsCount={setsRes.count ?? 0}
        studentsCount={classrooms.reduce((sum, c) => sum + c.studentCount, 0)}
        classrooms={classrooms.slice(0, RECENT_LIMIT)}
        questionSets={setRows.map(set => ({
          id: set.id,
          title: set.title,
          sections: set.sections,
          questionCount: ((set.question_ids ?? []) as string[])
            .filter(id => liveQuestionIds.has(id)).length,
        }))}
        questions={questionRows}
        questionCardData={questionCardData}
        myTeams={((teamsRes.data ?? []) as unknown as { organizations: { id: string; name: string } }[])
          .map(row => ({ id: row.organizations.id, name: row.organizations.name }))}
      />
    )
  }

  // ─── Student path ─────────────────────────────────────────────────────────────
  const [membershipsRes, submissionsRes] = await Promise.all([
    supabase
      .from('classroom_students')
      .select('classroom_id')
      .eq('student_id', user.id),
    admin
      .from('submissions')
      .select('id, total_score, score_adjustment, max_score, status, assignment_id, created_at, assignments(display_max_score, show_results, end_at)')
      .eq('student_id', user.id),
  ])

  const classroomIds = (membershipsRes.data ?? []).map((m: any) => m.classroom_id)
  const rawSubmissions = submissionsRes.data ?? []

  // Fetch score-display settings through the submission relation so every
  // attempt can be rescaled without a second assignment lookup.
  const displayMaxByAssignment = new Map(rawSubmissions.map((s: any) => [
    s.assignment_id as string,
    (s.assignments?.display_max_score ?? null) as number | null,
  ]))
  const allSubmissions = rescaleToDisplayMax(
    rawSubmissions as any[],
    row => displayMaxByAssignment.get(row.assignment_id) ?? null
  )
  const completed = allSubmissions.filter(
    (s: any) => s.status === 'submitted' || s.status === 'graded'
  )
  // Once memberships are known, assignments and announcements are
  // independent and can be loaded in the same database round-trip window.
  // The inner join replaces the old links -> assignment-id -> assignments
  // waterfall while still using assignment_classrooms as the source of truth.
  const [assignmentsRes, recentPostsRes] = classroomIds.length > 0
    ? await Promise.all([
        admin
          .from('assignments')
          .select('id, title, question_ids, random_question_count, completion_rule, streak_target, classrooms(name), end_at, duration_minutes, type, passing_type, passing_value, assignment_classrooms!inner(classroom_id, group_ids)')
          .in('assignment_classrooms.classroom_id', classroomIds)
          .eq('status', 'published')
          .order('end_at', { ascending: true, nullsFirst: false }),
        supabase
          .from('classroom_posts')
          .select('id, classroom_id, body, created_at, users(full_name), classrooms(name)')
          .in('classroom_id', classroomIds)
          .order('created_at', { ascending: false })
          .limit(5),
      ])
    : [{ data: [] }, { data: [] }]

  // A งาน handed to กลุ่มย่อย the student is not in is not theirs to do.
  const allAssignments = await filterAssignmentsForStudent(
    admin,
    user.id,
    classroomIds,
    (assignmentsRes.data ?? []) as any[],
    new Set(allSubmissions.map((s: any) => s.assignment_id as string)),
  )
  const recentPosts = recentPostsRes.data ?? []

  let pendingAssignments: any[] = []
  let calendarEvents: CalendarEvent[] = []

  if (classroomIds.length > 0) {
    const inProgressMap = new Map(
      allSubmissions
        .filter((s: any) => s.status === 'in_progress')
        .map((s: any) => [s.assignment_id, s])
    )
    // Best (highest-scoring) submitted/graded attempt per assignment — an
    // exercise may have several retry attempts behind it.
    const bestByAssignment = new Map<string, any>()
    for (const s of completed) {
      const prev = bestByAssignment.get(s.assignment_id)
      if (!prev || (s.total_score ?? -1) > (prev.total_score ?? -1)) {
        bestByAssignment.set(s.assignment_id, s)
      }
    }

    // An exercise submission that hasn't cleared its passing threshold isn't
    // "done" yet — the student is expected to retry. Exams count once submitted.
    function isDone(a: any): boolean {
      const best = bestByAssignment.get(a.id)
      if (!best) return false
      if (a.type === 'exercise') {
        if (computePassed(best.total_score, best.max_score, a.passing_type, a.passing_value) === false) return false
      }
      return true
    }

    pendingAssignments = (allAssignments ?? [])
      .filter((a: any) => !isDone(a))
      .slice(0, 6)
      .map((a: any) => ({
        id: a.id,
        title: a.title,
        question_ids: a.question_ids,
        random_question_count: a.random_question_count,
        completion_rule: a.completion_rule,
        streak_target: a.streak_target,
        classrooms: a.classrooms,
        end_at: a.end_at,
        duration_minutes: a.duration_minutes,
        inProgress: inProgressMap.has(a.id),
        submissionId: inProgressMap.get(a.id)?.id ?? null,
      }))

    calendarEvents = (allAssignments ?? [])
      .filter((a: any) => a.end_at)
      .map((a: any) => ({
        id: a.id,
        title: a.title,
        classroomName: (a.classrooms as any)?.name ?? '',
        endAt: a.end_at as string,
        done: isDone(a),
        submissionId: bestByAssignment.get(a.id)?.id ?? null,
      }))
  }

  return (
    <StudentDashboard
      user={user}
      classroomsCount={classroomIds.length}
      pendingAssignments={pendingAssignments}
      calendarEvents={calendarEvents}
      recentPosts={recentPosts as unknown as StudentDashboardPost[]}
    />
  )
}
