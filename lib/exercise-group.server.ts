import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { studentHasAssignment } from '@/lib/auth/assignment-access'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import type { ExerciseGroupContext } from '@/lib/exercise-group'

export async function exerciseGroupResultSource(submissionId: string, viewerId: string) {
  const admin = createAdminClient()
  const { data: own } = await admin.from('submissions').select('*').eq('id', submissionId).eq('student_id', viewerId).maybeSingle()
  if (own && !own.group_source_submission_id) return { id: submissionId, ownerId: viewerId }
  const canonicalId = own?.group_source_submission_id ?? submissionId
  const { data: membership, error } = await admin.from('exercise_group_members').select('assignment_id')
    .eq('submission_id', canonicalId).eq('student_id', viewerId).maybeSingle()
  if (error || !membership) return { id: submissionId, ownerId: viewerId }
  const { data: source } = await admin.from('submissions').select('id, student_id')
    .eq('id', canonicalId).eq('assignment_id', membership.assignment_id).maybeSingle()
  return source ? { id: source.id, ownerId: source.student_id } : { id: submissionId, ownerId: viewerId }
}

/** Caller supplies the authenticated actor, never a browser-provided identity. */
export async function readExerciseGroupContext(assignmentId: string, studentId: string): Promise<ExerciseGroupContext | undefined> {
  const admin = createAdminClient()
  if (!await studentHasAssignment(admin, assignmentId, studentId)) return undefined
  const { data: assignment, error } = await admin.from('assignments').select('*').eq('id', assignmentId).eq('status', 'published').maybeSingle()
  if (error) throw new Error('โหลดรูปแบบการส่งงานไม่สำเร็จ')
  if (assignment?.submission_mode !== 'group') return undefined
  const { data: links, error: linkError } = await admin.from('assignment_classrooms')
    .select('classroom_id, group_ids, classrooms(name)').eq('assignment_id', assignmentId)
  if (linkError) throw new Error('โหลดห้องเรียนของงานกลุ่มไม่สำเร็จ')
  const ownRooms = await admin.from('classroom_students').select('classroom_id').eq('student_id', studentId)
  if (ownRooms.error) throw new Error('ตรวจรายชื่อห้องเรียนไม่สำเร็จ')
  const enrolled = new Set((ownRooms.data ?? []).map(row => row.classroom_id))
  const rooms: ExerciseGroupContext['rooms'] = []
  for (const link of links ?? []) {
    if (!enrolled.has(link.classroom_id)) continue
    const { rows, error: rosterError } = await fetchAllRows((from, to) => admin.from('classroom_students')
      .select('student_id, users!classroom_students_student_id_fkey!inner(full_name, role, status)')
      .eq('classroom_id', link.classroom_id).order('student_id').range(from, to))
    if (rosterError) throw new Error('โหลดรายชื่อสมาชิกไม่สำเร็จ')
    let eligible: Set<string> | null = null
    if (link.group_ids !== null) {
      const { rows: grouped, error: groupError } = await fetchAllRows((from, to) => admin.from('classroom_group_members')
        .select('student_id').eq('classroom_id', link.classroom_id).in('group_id', link.group_ids)
        .order('student_id').range(from, to))
      if (groupError) throw new Error('ตรวจผู้ได้รับมอบหมายไม่สำเร็จ')
      eligible = new Set(grouped.map(row => row.student_id))
      if (!eligible.has(studentId)) continue
    }
    const room = Array.isArray(link.classrooms) ? link.classrooms[0] : link.classrooms
    rooms.push({ id: link.classroom_id, name: room?.name ?? 'ห้องเรียน', students: rows.flatMap(row => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users
      return row.student_id !== studentId && user?.role === 'student' && user.status === 'active'
        && (!eligible || eligible.has(row.student_id)) ? [{ id: row.student_id, name: user.full_name || 'นักเรียน' }] : []
    }) })
  }
  return { min: assignment.group_min_members, max: assignment.group_max_members, rooms }
}
