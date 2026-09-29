import 'server-only'

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { assignmentReachesStudent, type AssignmentLinkReach } from '@/lib/classroom-groups'
import { getStudentGroups } from '@/lib/classroom-groups-server'

/**
 * Was this งาน handed to this student — on the roster of a linked classroom
 * and, where the link names กลุ่มย่อย, in one of those groups?
 *
 * The server-side twin of get_my_visible_assignment_ids(), for the actions
 * that run on the service role (starting an attempt, SEB, Android approval).
 * A student with an attempt already keeps access after being moved out of
 * the group, same as the SQL.
 *
 * Does not look at status or dates — callers already read the assignment row
 * and apply their own rules to it.
 */
export async function studentHasAssignment(
  admin: ReturnType<typeof createAdminClient>,
  assignmentId: string,
  studentId: string,
  knownHasSubmission?: boolean,
): Promise<boolean> {
  const { data: linkRows } = await admin
    .from('assignment_classrooms')
    .select('classroom_id, group_ids')
    .eq('assignment_id', assignmentId)
  const links = (linkRows ?? []) as AssignmentLinkReach[]
  if (links.length === 0) return false

  const classroomIds = links.map(l => l.classroom_id)
  const needsGroups = links.some(l => l.group_ids !== null)
  const [{ data: memberships }, groupOf, hasSubmission] = await Promise.all([
    admin
      .from('classroom_students')
      .select('classroom_id')
      .eq('student_id', studentId)
      .in('classroom_id', classroomIds),
    needsGroups ? getStudentGroups(admin, studentId, classroomIds) : Promise.resolve(new Map<string, string>()),
    knownHasSubmission !== undefined || !needsGroups
      ? Promise.resolve(knownHasSubmission ?? false)
      : admin
          .from('submissions')
          .select('id')
          .eq('assignment_id', assignmentId)
          .eq('student_id', studentId)
          .limit(1)
          .then(({ data }) => (data?.length ?? 0) > 0),
  ])

  const enrolled = new Set((memberships ?? []).map((m: { classroom_id: string }) => m.classroom_id))
  return assignmentReachesStudent(links, enrolled, groupOf, hasSubmission)
}

/**
 * May this user act on this ชุดข้อสอบ as a teacher — read its hand-ins, and
 * score them by hand?
 *
 * This is the same rule the database already enforces on the assignment row
 * itself, spelled out in TypeScript rather than SQL:
 *
 *   assignments_super_admin_all → user is a trusted super admin
 *   assignments_org_teacher_all  →  created_by = auth.uid()
 *   assignments_co_teacher_all   →  id = ANY(get_my_co_teaching_assignment_ids())
 *                                   i.e. an admin/manage co-teacher on any
 *                                   classroom the assignment is linked to
 *
 * It has to be restated here because submissions and submission_answers are
 * not reachable through RLS by a co-teacher at all: their only teacher-side
 * policies are scoped to `assignments.created_by`, and migration
 * 20260824053336 revoked INSERT/UPDATE/DELETE on both tables from
 * `authenticated` outright, moving every mutation to the service role "after
 * exact auth/authz". This function is that authz. Callers reach those two
 * tables with the admin client only once it has returned true.
 *
 * Deliberately NOT widened beyond the assignment policy: a classroom owner
 * who did not create the assignment cannot edit it today, and a 'view'
 * co-teacher is not a grader. Student answers are sensitive, so this grants
 * exactly what the co-teacher UI already promises under "จัดการข้อสอบ —
 * สร้าง ตรวจ แก้ไขข้อสอบได้", and nothing more.
 *
 * Takes no client of its own on purpose: keyed only on the two ids, the React
 * cache actually dedupes the check when a page and the components under it
 * each ask (it lasts one render pass, never across requests or users).
 */
export const canManageAssignment = cache(async (
  assignmentId: string,
  userId: string,
): Promise<boolean> => {
  const admin = createAdminClient()

  const [{ data: assignment }, { data: superAdmin }] = await Promise.all([
    admin
      .from('assignments')
      .select('created_by')
      .eq('id', assignmentId)
      .maybeSingle(),
    admin
      .from('super_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (!assignment) return false
  if (superAdmin) return true
  if (assignment.created_by === userId) return true

  // Every classroom this ชุดข้อสอบ was handed to — a งาน can be assigned to
  // more than one, and admin/manage on any one of them is enough, matching
  // get_my_co_teaching_assignment_ids().
  const { data: links } = await admin
    .from('assignment_classrooms')
    .select('classroom_id')
    .eq('assignment_id', assignmentId)

  const classroomIds = (links ?? []).map((l: { classroom_id: string }) => l.classroom_id)
  if (classroomIds.length === 0) return false

  const { data: coTeacher } = await admin
    .from('classroom_co_teachers')
    .select('id')
    .eq('user_id', userId)
    .in('classroom_id', classroomIds)
    .in('permission', ['admin', 'manage'])
    .limit(1)
    .maybeSingle()

  return coTeacher != null
})
