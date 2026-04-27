'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function generateClassCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

export async function createClassroom(data: { name: string; description: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  // Generate unique code with retry
  let classCode = generateClassCode()
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await supabase
      .from('classrooms').select('id').eq('class_code', classCode).maybeSingle()
    if (!existing) break
    classCode = generateClassCode()
  }

  const { error } = await supabase.from('classrooms').insert({
    teacher_id: user.id,
    name: data.name,
    description: data.description || null,
    class_code: classCode,
  })
  if (error) return { error: error.message }
  revalidatePath('/classrooms')
  redirect('/classrooms')
}

export async function deleteClassroom(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const { error } = await supabase
    .from('classrooms').delete().eq('id', id).eq('teacher_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/classrooms')
}

export async function joinClassroom(classCode: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: classroom } = await supabase
    .from('classrooms').select('id').eq('class_code', classCode.trim().toUpperCase()).maybeSingle()
  if (!classroom) return { error: 'ไม่พบห้องเรียน ตรวจสอบรหัสอีกครั้ง' }

  const { error } = await supabase
    .from('classroom_students').insert({ classroom_id: classroom.id, student_id: user.id })
  if (error) {
    if (error.code === '23505') return { error: 'คุณเข้าร่วมห้องเรียนนี้แล้ว' }
    return { error: error.message }
  }
  revalidatePath('/classrooms')
  redirect('/classrooms')
}

export async function leaveClassroom(classroomId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const { error } = await supabase
    .from('classroom_students')
    .delete()
    .eq('classroom_id', classroomId)
    .eq('student_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/classrooms')
}

export async function removeStudent(classroomId: string, studentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  // Ownership check via RLS (classrooms_teacher_all policy)
  const { data: classroom } = await supabase
    .from('classrooms').select('id').eq('id', classroomId).eq('teacher_id', user.id).maybeSingle()
  if (!classroom) return { error: 'ไม่มีสิทธิ์' }
  const { error } = await supabase
    .from('classroom_students')
    .delete()
    .eq('classroom_id', classroomId)
    .eq('student_id', studentId)
  if (error) return { error: error.message }
  revalidatePath(`/classrooms/${classroomId}`)
}
