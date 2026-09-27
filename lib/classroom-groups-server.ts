import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { assignmentReachesStudent, type AssignmentLinkReach } from '@/lib/classroom-groups'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Group membership for a set of classrooms, keyed `${classroomId}:${studentId}`
 * → group id. Pass `studentIds` to read only those students' rows.
 *
 * Service-role reads: callers are pages and actions that have already decided
 * who may see what (a student's own rows, or a roster the teacher manages).
 */
export async function getGroupMembership(
  admin: AdminClient,
  classroomIds: string[],
  studentIds?: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (classroomIds.length === 0 || studentIds?.length === 0) return result
  let query = admin
    .from('classroom_group_members')
    .select('classroom_id, student_id, group_id')
    .in('classroom_id', classroomIds)
  if (studentIds) query = query.in('student_id', studentIds)
  const { data } = await query
  for (const row of (data ?? []) as { classroom_id: string; student_id: string; group_id: string }[]) {
    result.set(`${row.classroom_id}:${row.student_id}`, row.group_id)
  }
  return result
}

/** One student's group per classroom (classroomId → groupId). */
export async function getStudentGroups(
  admin: AdminClient,
  studentId: string,
  classroomIds: string[],
): Promise<Map<string, string>> {
  const membership = await getGroupMembership(admin, classroomIds, [studentId])
  const result = new Map<string, string>()
  for (const [key, groupId] of membership) result.set(key.slice(0, key.indexOf(':')), groupId)
  return result
}

/** Each student's group within one classroom (studentId → groupId). */
export async function getClassroomGroupOf(
  admin: AdminClient,
  classroomId: string,
  studentIds?: string[],
): Promise<Map<string, string>> {
  const membership = await getGroupMembership(admin, [classroomId], studentIds)
  const result = new Map<string, string>()
  for (const [key, groupId] of membership) result.set(key.slice(key.indexOf(':') + 1), groupId)
  return result
}

/**
 * Keep only the assignments that were handed to this student.
 *
 * For the student-facing lists that load assignments through the service role
 * with `assignment_classrooms!inner(classroom_id, group_ids)` — RLS is not in
 * that path, so the group rule has to be applied here. `submittedIds` are
 * งาน the student already has an attempt on; those stay, whatever group the
 * student is in now.
 */
export async function filterAssignmentsForStudent<T extends { id: string; assignment_classrooms: AssignmentLinkReach[] }>(
  admin: AdminClient,
  studentId: string,
  enrolledClassroomIds: string[],
  assignments: T[],
  submittedIds: ReadonlySet<string> = new Set(),
): Promise<T[]> {
  const needsGroups = assignments.some(a => a.assignment_classrooms.some(l => l.group_ids !== null))
  const groupOf = needsGroups ? await getStudentGroups(admin, studentId, enrolledClassroomIds) : new Map<string, string>()
  const enrolled = new Set(enrolledClassroomIds)
  return assignments.filter(a => assignmentReachesStudent(a.assignment_classrooms, enrolled, groupOf, submittedIds.has(a.id)))
}

/**
 * Of these classrooms, the ones this user may manage: owner, or an admin /
 * manage co-teacher — who may decide which กลุ่มย่อย of the room get a งาน.
 */
export async function manageableClassroomIds(
  admin: AdminClient,
  userId: string,
  classroomIds: string[],
): Promise<Set<string>> {
  if (classroomIds.length === 0) return new Set()
  const [{ data: owned }, { data: coTeaching }] = await Promise.all([
    admin.from('classrooms').select('id').in('id', classroomIds).eq('teacher_id', userId),
    admin
      .from('classroom_co_teachers')
      .select('classroom_id')
      .in('classroom_id', classroomIds)
      .eq('user_id', userId)
      .in('permission', ['admin', 'manage']),
  ])
  return new Set([
    ...((owned ?? []) as { id: string }[]).map(r => r.id),
    ...((coTeaching ?? []) as { classroom_id: string }[]).map(r => r.classroom_id),
  ])
}
