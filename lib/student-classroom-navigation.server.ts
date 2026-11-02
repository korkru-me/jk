import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Classroom } from './types'
import { fetchAllRows } from './supabase/fetch-all-rows'

export type StudentClassroomOption = Pick<Classroom, 'id' | 'name' | 'description' | 'classroom_type'>
type EnrolledRoom = StudentClassroomOption & Pick<Classroom, 'status' | 'deleted_at'>

/** The caller must first verify the session and the current room's membership. */
export async function loadStudentClassroomNavigation(admin: SupabaseClient, studentId: string): Promise<StudentClassroomOption[]> {
  const result = await fetchAllRows((from, to) => admin.from('classroom_students')
    .select('classrooms!inner(id, name, description, classroom_type, status, deleted_at)')
    .eq('student_id', studentId)
    .eq('classrooms.status', 'active')
    .is('classrooms.deleted_at', null)
    .order('classroom_id')
    .range(from, to)
    .returns<{ classrooms: EnrolledRoom | null }[]>())
  if (result.error) throw new Error('โหลดรายชื่อห้องเรียนไม่สำเร็จ')

  const options = new Map<string, StudentClassroomOption>()
  for (const { classrooms: room } of result.rows) {
    if (!room || room.status !== 'active' || room.deleted_at !== null) continue
    options.set(room.id, { id: room.id, name: room.name, description: room.description, classroom_type: room.classroom_type })
  }
  return [...options.values()].sort((a, b) =>
    Number(b.classroom_type === 'homeroom') - Number(a.classroom_type === 'homeroom')
    || a.name.localeCompare(b.name, 'th') || a.id.localeCompare(b.id))
}
