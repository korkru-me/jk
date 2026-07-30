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

  const { data: otherMemberships } = await admin
    .from('classroom_students')
    .select('classroom_id')
    .in('student_id', rosterStudentIds)
    .neq('classroom_id', homeroomClassroomId)
  const otherClassroomIds = Array.from(new Set((otherMemberships ?? []).map((m: any) => m.classroom_id)))
  if (otherClassroomIds.length === 0) return { assignments: [], submissions: [] }

  const { data: subjectClassrooms } = await admin
    .from('classrooms')
    .select('id, name')
    .in('id', otherClassroomIds)
    .eq('classroom_type', 'subject')
    .eq('status', 'active')
  const classroomNameMap = new Map((subjectClassrooms ?? []).map((cr: any) => [cr.id as string, cr.name as string]))
  const subjectClassroomIds = Array.from(classroomNameMap.keys())
  if (subjectClassroomIds.length === 0) return { assignments: [], submissions: [] }

  const { data: linkRows } = await admin
    .from('assignment_classrooms')
    .select('assignment_id, classroom_id')
    .in('classroom_id', subjectClassroomIds)

  // An assignment can be linked to several classrooms; keep the first one
  // that overlaps this roster as the label source.
  const assignmentClassroomMap = new Map<string, string>()
  for (const l of (linkRows ?? []) as any[]) {
    if (!assignmentClassroomMap.has(l.assignment_id)) assignmentClassroomMap.set(l.assignment_id, l.classroom_id)
  }
  const assignmentIds = Array.from(assignmentClassroomMap.keys())
  if (assignmentIds.length === 0) return { assignments: [], submissions: [] }

  const [{ data: assignmentRows }, { data: submissionRows }] = await Promise.all([
    admin
      .from('assignments')
      .select('id, title, end_at, status, passing_type, passing_value, score_strategy, display_max_score')
      .in('id', assignmentIds)
      .eq('status', 'published')
      .order('end_at', { ascending: true, nullsFirst: false }),
    admin
      .from('submissions')
      .select('id, assignment_id, student_id, status, total_score, max_score, submitted_at, attempt_number')
      .in('assignment_id', assignmentIds)
      .in('student_id', rosterStudentIds),
  ])

  const assignments: HomeroomAssignmentRow[] = (assignmentRows ?? []).map((a: any) => {
    const clsId = assignmentClassroomMap.get(a.id)!
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
