'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function canManageClassroom(admin: ReturnType<typeof createAdminClient>, classroomId: string, userId: string) {
  const { data: classroom } = await admin
    .from('classrooms').select('teacher_id').eq('id', classroomId).maybeSingle()
  if (!classroom) return false
  if (classroom.teacher_id === userId) return true
  const { data: coTeacher } = await admin
    .from('classroom_co_teachers')
    .select('permission')
    .eq('classroom_id', classroomId)
    .eq('user_id', userId)
    .maybeSingle()
  return coTeacher?.permission === 'admin' || coTeacher?.permission === 'manage'
}

export async function addStudentNote(classroomId: string, studentId: string, body: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!body.trim()) return { error: 'กรุณากรอกบันทึก' }

  const admin = createAdminClient()
  if (!(await canManageClassroom(admin, classroomId, user.id))) return { error: 'ไม่มีสิทธิ์' }

  const { error } = await admin.from('student_notes').insert({
    classroom_id: classroomId,
    student_id: studentId,
    author_id: user.id,
    body: body.trim(),
  })
  if (error) return { error: error.message }

  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
}

export async function deleteStudentNote(noteId: string, classroomId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const admin = createAdminClient()
  if (!(await canManageClassroom(admin, classroomId, user.id))) return { error: 'ไม่มีสิทธิ์' }

  const { error } = await admin
    .from('student_notes')
    .delete()
    .eq('id', noteId)
    .eq('classroom_id', classroomId)
  if (error) return { error: error.message }

  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
}
