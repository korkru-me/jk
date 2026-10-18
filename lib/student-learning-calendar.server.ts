import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStudentGroups } from './classroom-groups-server'
import { fetchAllRows } from './supabase/fetch-all-rows'
import { buildStudentLearningData, type LearningAssignment, type LearningSubmission } from '@/app/(app)/dashboard/_components/student-learning-data'
import type { StudentClassroom } from '@/app/(app)/classrooms/_components/student-view'
import { withVoidedScoreMetadata } from './voided-score-metadata.server'

/** Call after verified Auth and the homeroom's exact membership check. Uses
 * the learning-home projection and only this student's memberships/attempts. */
export async function loadStudentLearningCalendar(admin: SupabaseClient, studentId: string) {
  const [memberships, submissions] = await Promise.all([
    fetchAllRows((from, to) => admin.from('classroom_students')
      .select('classroom_id, classrooms(id, name, description, status, classroom_type)')
      .eq('student_id', studentId).order('classroom_id').range(from, to)),
    fetchAllRows((from, to) => admin.from('submissions')
      .select('id, assignment_id, total_score, max_score, score_adjustment, status, attempt_number, created_at, assignments(id, classroom_id, title, type, end_at, duration_minutes, passing_type, passing_value, score_strategy, display_max_score, show_results, classrooms(name))')
      .eq('student_id', studentId).order('id').range(from, to)),
  ])
  if (memberships.error || submissions.error) throw new Error('โหลดปฏิทินงานไม่สำเร็จ กรุณาลองใหม่')
  // Ungenerated PostgREST relationship types infer arrays for to-one joins;
  // cast only at this same boundary used by the learning-home page.
  const classrooms = (memberships.rows as unknown as { classrooms: StudentClassroom | null }[])
    .flatMap(row => row.classrooms ? [row.classrooms] : [])
  const classroomIds = classrooms.map(room => room.id)
  const [assignments, groupOf] = classroomIds.length ? await Promise.all([
    fetchAllRows((from, to) => admin.from('assignments')
      .select('id, classroom_id, title, type, created_at, end_at, duration_minutes, passing_type, passing_value, score_strategy, display_max_score, show_results, assignment_classrooms!inner(classroom_id, group_ids)')
      .in('assignment_classrooms.classroom_id', classroomIds).eq('status', 'published').order('id').range(from, to)),
    getStudentGroups(admin, studentId, classroomIds),
  ]) : [{ rows: [], error: null }, new Map<string, string>()]
  if (assignments.error) throw new Error('โหลดกำหนดส่งงานไม่สำเร็จ กรุณาลองใหม่')
  return buildStudentLearningData({ classrooms, groupOf,
    assignments: assignments.rows as unknown as LearningAssignment[],
    submissions: (await withVoidedScoreMetadata(admin, submissions.rows)) as unknown as LearningSubmission[],
  }).calendarEvents
}
