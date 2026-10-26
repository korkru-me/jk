import { createAdminClient } from '@/lib/supabase/admin'
import { homeroomAssignmentScope } from '@/lib/homeroom-assignment-scope'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { rescaleToDisplayMax } from '@/lib/scoring'
import { withVoidedScoreMetadata } from '@/lib/voided-score-metadata.server'

export interface HomeroomAssignmentRow {
  id: string
  title: string
  classroomId: string
  classroomName: string
  classroomStudentIds: string[]
  assignedStudentIds: string[]
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
// the roster's students are assigned in their *subject* classrooms. Used by
// the classroom detail page for the overview and homework panels.
export async function getHomeroomAggregate(
  admin: ReturnType<typeof createAdminClient>,
  homeroomClassroomId: string,
  rosterStudentIds: string[],
): Promise<{ assignments: HomeroomAssignmentRow[]; submissions: HomeroomSubmissionRow[] }> {
  if (rosterStudentIds.length === 0) return { assignments: [], submissions: [] }

  // Join the subject classroom while reading memberships. This replaces the
  // old membership -> classroom lookup waterfall with one round-trip and
  // prevents inactive/non-subject rooms from entering the rest of the query.
  const { rows: otherMemberships, error: membershipError } = await fetchAllRows((from, to) => admin
    .from('classroom_students')
    .select('classroom_id, student_id, classrooms!inner(id, name, classroom_type, status)')
    .in('student_id', rosterStudentIds)
    .neq('classroom_id', homeroomClassroomId)
    .eq('classrooms.classroom_type', 'subject')
    .eq('classrooms.status', 'active')
    .order('classroom_id').order('student_id').range(from, to))
  if (membershipError) throw membershipError

  const classroomNameMap = new Map<string, string>()
  for (const membership of (otherMemberships ?? []) as any[]) {
    classroomNameMap.set(membership.classroom_id, membership.classrooms.name)
  }
  const subjectClassroomIds = Array.from(classroomNameMap.keys())
  if (subjectClassroomIds.length === 0) return { assignments: [], submissions: [] }

  // Pull the assignment-classroom links as a nested relation so discovering
  // links and loading published assignments is one query instead of two.
  const { rows: assignmentRows, error: assignmentError } = await fetchAllRows((from, to) => admin
    .from('assignments')
    .select('id, title, end_at, status, passing_type, passing_value, score_strategy, display_max_score, assignment_classrooms!inner(classroom_id, group_ids)')
    .in('assignment_classrooms.classroom_id', subjectClassroomIds)
    .eq('status', 'published')
    .order('end_at', { ascending: true, nullsFirst: false }).order('id').range(from, to))
  if (assignmentError) throw assignmentError

  const publishedAssignmentIds = (assignmentRows ?? []).map((a: any) => a.id as string)
  if (publishedAssignmentIds.length === 0) return { assignments: [], submissions: [] }

  const [{ rows: submissionRows, error: submissionError }, { rows: groupRows, error: groupError }] = await Promise.all([
    fetchAllRows((from, to) => admin
    .from('submissions')
    .select('id, assignment_id, student_id, status, total_score, score_adjustment, max_score, submitted_at, attempt_number')
    .in('assignment_id', publishedAssignmentIds)
    .in('student_id', rosterStudentIds)
    .order('id').range(from, to)),
    fetchAllRows((from, to) => admin.from('classroom_group_members')
      .select('classroom_id, student_id, group_id')
      .in('classroom_id', subjectClassroomIds).in('student_id', rosterStudentIds)
      .order('classroom_id').order('student_id').range(from, to)),
  ])
  if (submissionError) throw submissionError
  if (groupError) throw groupError

  const assignments: HomeroomAssignmentRow[] = (assignmentRows ?? []).map((a: any) => {
    const links = a.assignment_classrooms as { classroom_id: string; group_ids: string[] | null }[]
    const roomIds = [...new Set(links.map(link => link.classroom_id))]
    const clsId = roomIds[0]
    const scope = homeroomAssignmentScope(links, otherMemberships, groupRows,
      new Set(submissionRows.filter(row => row.assignment_id === a.id).map(row => row.student_id)))
    return {
      id: a.id as string,
      title: a.title as string,
      classroomId: clsId,
      classroomName: roomIds.map(id => classroomNameMap.get(id) ?? '').filter(Boolean).join(' · '),
      ...scope,
      end_at: a.end_at as string | null,
      passing_type: a.passing_type,
      passing_value: a.passing_value,
      score_strategy: a.score_strategy,
    }
  })

  const displayMaxByAssignment = new Map((assignmentRows ?? []).map((a: any) => [a.id as string, a.display_max_score as number | null]))
  const submissions = rescaleToDisplayMax(
    await withVoidedScoreMetadata(admin, (submissionRows ?? []) as HomeroomSubmissionRow[]),
    row => displayMaxByAssignment.get(row.assignment_id) ?? null
  )

  return { assignments, submissions }
}
