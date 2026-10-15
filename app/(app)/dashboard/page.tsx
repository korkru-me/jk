import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/auth/server'
import type { User } from '@/lib/types'
import {
  TeacherDashboard, type DashboardClassroom,
} from './_components/teacher-dashboard'
import { StudentDashboard, type StudentDashboardPost } from './_components/student-dashboard'
import { getStudentGroups } from '@/lib/classroom-groups-server'
import type { StudentClassroom } from '../classrooms/_components/student-view'
import { buildStudentLearningData, type LearningAssignment, type LearningSubmission } from './_components/student-learning-data'
import { getQuestionCardData } from '@/lib/actions/question-card-data'
import type { QuestionCardRow } from '@/components/questions/question-card'
import { sortClassroomsByRecentViews } from '@/lib/classroom-recency'
import { loadStudentPracticeLibraries } from '../practice/_lib/student-landing-data'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'

export async function generateMetadata() {
  const user = await getAuthUser()
  if (!user) return { title: 'หน้าหลัก — KorKru' }
  const supabase = await createClient()
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  return { title: `${profile?.role === 'student' ? 'พื้นที่เรียนรู้ของฉัน' : 'หน้าหลัก'} — KorKru` }
}

/** How many rows each "recent" list on the teacher home shows. */
const RECENT_LIMIT = 5

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ join?: string | string[] }>
}) {
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
        fullName={user.full_name}
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

  // Student path: every service-role read is scoped to the verified user or
  // their roster rows. Classroom links, group targets and score visibility
  // retain the same rules as the former student pages.
  const [membershipsRes, submissionsRes, practiceLibraries] = await Promise.all([
    admin.from('classroom_students')
      .select('classroom_id, classrooms(id, name, description, status, classroom_type)')
      .eq('student_id', user.id),
    admin.from('submissions')
      .select('id, assignment_id, total_score, max_score, score_adjustment, status, attempt_number, created_at, assignments(id, classroom_id, title, type, end_at, duration_minutes, passing_type, passing_value, score_strategy, display_max_score, show_results, classrooms(name))')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false }),
    isPracticeLibraryEnabled(process.env)
      ? loadStudentPracticeLibraries(supabase, user.id).catch(() => ({ items: [], error: 'โหลดคลังฝึกไม่สำเร็จ' }))
      : Promise.resolve({ items: [], error: null }),
  ])
  if (membershipsRes.error || submissionsRes.error) throw new Error('ไม่สามารถโหลดข้อมูลการเรียนได้ กรุณาลองใหม่')
  // Supabase's ungenerated relationship types infer arrays for these to-one
  // joins. Only the query boundary is cast; all projections below are typed.
  const memberships = (membershipsRes.data ?? []) as unknown as { classroom_id: string; classrooms: StudentClassroom | null }[]
  const classrooms = memberships.flatMap(row => row.classrooms ? [row.classrooms] : [])
  const classroomIds = classrooms.map(c => c.id)
  const [assignmentsRes, recentPostsRes, groupOf] = classroomIds.length > 0
    ? await Promise.all([
        admin.from('assignments')
          .select('id, classroom_id, title, type, created_at, end_at, duration_minutes, passing_type, passing_value, score_strategy, display_max_score, show_results, assignment_classrooms!inner(classroom_id, group_ids)')
          .in('assignment_classrooms.classroom_id', classroomIds)
          .eq('status', 'published')
          .order('end_at', { ascending: true, nullsFirst: false }),
        supabase.from('classroom_posts')
          // post_reads also links posts to users; explicitly choose the author.
          .select('id, classroom_id, body, created_at, users!classroom_posts_author_id_fkey(full_name), classrooms(name)')
          .in('classroom_id', classroomIds)
          .order('created_at', { ascending: false }).limit(5),
        getStudentGroups(admin, user.id, classroomIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, new Map<string, string>()]
  if (assignmentsRes.error || recentPostsRes.error) throw new Error('ไม่สามารถโหลดงานและประกาศได้ กรุณาลองใหม่')
  const data = buildStudentLearningData({
    classrooms, groupOf,
    assignments: (assignmentsRes.data ?? []) as unknown as LearningAssignment[],
    submissions: (submissionsRes.data ?? []) as unknown as LearningSubmission[],
    practiceLibraries: practiceLibraries.items,
    practiceError: practiceLibraries.error,
  })
  const { join } = await searchParams

  return (
    <StudentDashboard user={user} data={data}
      initialJoinCode={(Array.isArray(join) ? join[0] : join) ?? ''}
      recentPosts={(recentPostsRes.data ?? []) as unknown as StudentDashboardPost[]}
    />
  )
}
