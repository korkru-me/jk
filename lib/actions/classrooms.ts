'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyOrgId } from '@/lib/actions/org'

function generateClassCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ── Create ─────────────────────────────────────────────────────────────────

export async function createClassroom(data: { name: string; description: string }) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const orgId = await getMyOrgId()
  if (!orgId) return { error: 'ไม่พบข้อมูลสถาบัน กรุณาติดต่อผู้ดูแล' }

  const admin = createAdminClient()

  let classCode = generateClassCode()
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await admin
      .from('classrooms').select('id').eq('class_code', classCode).maybeSingle()
    if (!existing) break
    classCode = generateClassCode()
  }

  const { error } = await admin.from('classrooms').insert({
    org_id: orgId,
    teacher_id: user.id,
    name: data.name,
    description: data.description || null,
    class_code: classCode,
    status: 'active',
  })

  if (error) return { error: error.message }

  revalidatePath('/classrooms', 'layout')
  return { success: true }
}

// ── Soft delete (moves to trash, kept 3 months) ────────────────────────────

export async function deleteClassroom(id: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('classrooms')
    .update({ status: 'deleted', deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('teacher_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/classrooms')
  return { success: true }
}

export async function bulkDeleteClassrooms(ids: string[]) {
  if (!ids.length) return { error: 'ไม่ได้เลือกห้องเรียน' }
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('classrooms')
    .update({ status: 'deleted', deleted_at: new Date().toISOString() })
    .in('id', ids)
    .eq('teacher_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/classrooms')
  return { success: true }
}

// ── Archive ────────────────────────────────────────────────────────────────

export async function archiveClassroom(id: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('classrooms')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('teacher_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/classrooms')
  return { success: true }
}

export async function bulkArchiveClassrooms(ids: string[]) {
  if (!ids.length) return { error: 'ไม่ได้เลือกห้องเรียน' }
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('classrooms')
    .update({ status: 'archived' })
    .in('id', ids)
    .eq('teacher_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/classrooms')
  return { success: true }
}

// ── Restore (back to active) ───────────────────────────────────────────────

export async function restoreClassroom(id: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('classrooms')
    .update({ status: 'active', deleted_at: null })
    .eq('id', id)
    .eq('teacher_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/classrooms')
  revalidatePath('/classrooms/trash')
  revalidatePath('/classrooms/archived')
  return { success: true }
}

// ── Permanent delete (only after 3 months, or forced from trash page) ──────

export async function permanentDeleteClassroom(id: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const admin = createAdminClient()
  // Ownership check
  const { data: classroom } = await admin
    .from('classrooms').select('id').eq('id', id).eq('teacher_id', user.id).maybeSingle()
  if (!classroom) return { error: 'ไม่มีสิทธิ์' }
  const { error } = await admin.from('classrooms').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/classrooms/trash')
  return { success: true }
}

// ── Student management ─────────────────────────────────────────────────────

export async function joinClassroom(classCode: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const admin = createAdminClient()
  const { data: classroom } = await admin
    .from('classrooms')
    .select('id')
    .eq('class_code', classCode.trim().toUpperCase())
    .eq('status', 'active')
    .maybeSingle()
  if (!classroom) return { error: 'ไม่พบห้องเรียน ตรวจสอบรหัสอีกครั้ง' }
  const { error } = await admin
    .from('classroom_students').insert({ classroom_id: classroom.id, student_id: user.id })
  if (error) {
    if (error.code === '23505') return { error: 'คุณเข้าร่วมห้องเรียนนี้แล้ว' }
    return { error: error.message }
  }
  revalidatePath('/classrooms')
  redirect('/classrooms')
}

export async function leaveClassroom(classroomId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('classroom_students')
    .delete()
    .eq('classroom_id', classroomId)
    .eq('student_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/classrooms')
}

export async function removeStudent(classroomId: string, studentId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const admin = createAdminClient()
  const { data: classroom } = await admin
    .from('classrooms').select('id').eq('id', classroomId).eq('teacher_id', user.id).maybeSingle()
  if (!classroom) return { error: 'ไม่มีสิทธิ์' }
  const { error } = await admin
    .from('classroom_students')
    .delete()
    .eq('classroom_id', classroomId)
    .eq('student_id', studentId)
  if (error) return { error: error.message }
  revalidatePath(`/classrooms/${classroomId}`)
}
