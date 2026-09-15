import 'server-only'

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * May this user act on this ชุดข้อสอบ as a teacher — read its hand-ins, and
 * score them by hand?
 *
 * This is the same rule the database already enforces on the assignment row
 * itself, spelled out in TypeScript rather than SQL:
 *
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

  const { data: assignment } = await admin
    .from('assignments')
    .select('created_by')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!assignment) return false
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
