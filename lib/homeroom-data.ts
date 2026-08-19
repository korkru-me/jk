import { createAdminClient } from '@/lib/supabase/admin'
import { rescaleToDisplayMax } from '@/lib/scoring'

export interface HomeroomAssignmentRow {
  id: string
  title: string
  classroomId: string
  classroomName: string
  end_at: string | null
  passing_type: 'score' | 'percent' | null
  passing_value: number | null
  score_strategy: 'best' | 'average' | 'latest'
}

export interface HomeroomSubmissionRow {
  id: string
  assignment_id: string
  student_id: string
  status: string
  total_score: number | null
  max_score: number
  submitted_at: string | null
  attempt_number: number
}

// A homeroom classroom has no assignments of its own — it monitors whatever
// the roster's students are assigned in their *subject* classrooms. Shared
// by the classroom detail page and the printable parent report page.
export async function getHomeroomAggregate(
  admin: ReturnType<typeof createAdminClient>,
  homeroomClassroomId: string,
  rosterStudentIds: string[],
): Promise<{ assignments: HomeroomAssignmentRow[]; submissions: HomeroomSubmissionRow[] }> {
  if (rosterStudentIds.length === 0) return { assignments: [], submissions: [] }

  // Join the subject classroom while reading memberships. This replaces the
  // old membership -> classroom lookup waterfall with one round-trip and
  // prevents inactive/non-subject rooms from entering the rest of the query.
  const { data: otherMemberships } = await admin
    .from('classroom_students')
    .select('classroom_id, classrooms!inner(id, name, classroom_type, status)')
    .in('student_id', rosterStudentIds)
    .neq('classroom_id', homeroomClassroomId)
    .eq('classrooms.classroom_type', 'subject')
    .eq('classrooms.status', 'active')

  const classroomNameMap = new Map<string, string>()
  for (const membership of (otherMemberships ?? []) as any[]) {
    classroomNameMap.set(membership.classroom_id, membership.classrooms.name)
  }
  const subjectClassroomIds = Array.from(classroomNameMap.keys())
  if (subjectClassroomIds.length === 0) return { assignments: [], submissions: [] }

  // Pull the assignment-classroom links as a nested relation so discovering
  // links and loading published assignments is one query instead of two.
  const { data: assignmentRows } = await admin
    .from('assignments')
    .select('id, title, end_at, status, passing_type, passing_value, score_strategy, display_max_score, assignment_classrooms!inner(classroom_id)')
    .in('assignment_classrooms.classroom_id', subjectClassroomIds)
    .eq('status', 'published')
    .order('end_at', { ascending: true, nullsFirst: false })

  const publishedAssignmentIds = (assignmentRows ?? []).map((a: any) => a.id as string)
  if (publishedAssignmentIds.length === 0) return { assignments: [], submissions: [] }

  const { data: submissionRows } = await admin
    .from('submissions')
    .select('id, assignment_id, student_id, status, total_score, max_score, submitted_at, attempt_number')
    .in('assignment_id', publishedAssignmentIds)
    .in('student_id', rosterStudentIds)

  const assignments: HomeroomAssignmentRow[] = (assignmentRows ?? []).map((a: any) => {
    // An assignment can be linked to several classrooms; keep the first one
    // that overlaps this roster as the label source.
    const clsId = a.assignment_classrooms
      .map((link: any) => link.classroom_id as string)
      .find((classroomId: string) => classroomNameMap.has(classroomId))!
    return {
      id: a.id as string,
      title: a.title as string,
      classroomId: clsId,
      classroomName: classroomNameMap.get(clsId) ?? '',
      end_at: a.end_at as string | null,
      passing_type: a.passing_type,
      passing_value: a.passing_value,
      score_strategy: a.score_strategy,
    }
  })

  const displayMaxByAssignment = new Map((assignmentRows ?? []).map((a: any) => [a.id as string, a.display_max_score as number | null]))
  const submissions = rescaleToDisplayMax(
    (submissionRows ?? []) as HomeroomSubmissionRow[],
    row => displayMaxByAssignment.get(row.assignment_id) ?? null
  )

  return { assignments, submissions }
}
