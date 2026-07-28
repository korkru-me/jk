'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { StudentProfile, StudentGuardian } from '@/lib/types'
import { buildFullName } from '@/lib/utils'

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function canManageClassroom(admin: ReturnType<typeof createAdminClient>, classroomId: string, userId: string) {
  const { data: classroom } = await admin
    .from('classrooms').select('teacher_id, classroom_type').eq('id', classroomId).maybeSingle()
  if (!classroom || classroom.classroom_type !== 'homeroom') return false
  if (classroom.teacher_id === userId) return true
  const { data: coTeacher } = await admin
    .from('classroom_co_teachers')
    .select('permission')
    .eq('classroom_id', classroomId)
    .eq('user_id', userId)
    .maybeSingle()
  return coTeacher?.permission === 'admin' || coTeacher?.permission === 'manage'
}

export async function getMyStudentProfile(): Promise<StudentProfile | null> {
  const user = await getAuthUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('student_profiles')
    .select('*')
    .eq('student_id', user.id)
    .maybeSingle()
  return data as StudentProfile | null
}

export async function updateMyStudentProfile(formData: FormData) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่พบผู้ใช้งาน' }

  const field = (name: string) => {
    const v = (formData.get(name) as string)?.trim()
    return v ? v : null
  }
  const intField = (name: string) => {
    const v = (formData.get(name) as string)?.trim()
    return v ? parseInt(v, 10) : null
  }

  const prefix = field('prefix')
  const first_name = field('first_name')
  const last_name = field('last_name')
  if (!prefix || !first_name || !last_name) {
    return { error: 'กรุณากรอกคำนำหน้าชื่อ ชื่อ และสกุล' }
  }

  let guardians: StudentGuardian[] = []
  try {
    const raw = formData.get('guardians') as string | null
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) {
      guardians = parsed
        .map((g: any) => ({ name: (g?.name ?? '').trim(), phone: (g?.phone ?? '').trim() }))
        .filter(g => g.name || g.phone)
        .slice(0, 3)
    }
  } catch {
    return { error: 'ข้อมูลผู้ปกครองไม่ถูกต้อง' }
  }

  const admin = createAdminClient()

  const { error: nameError } = await admin
    .from('users')
    .update({
      prefix,
      first_name,
      last_name,
      full_name: buildFullName(prefix, first_name, last_name),
    })
    .eq('id', user.id)
  if (nameError) return { error: nameError.message }

  const { error } = await admin.from('student_profiles').upsert({
    student_id: user.id,
    nickname: field('nickname'),
    date_of_birth: field('date_of_birth'),
    gender: field('gender'),
    food_allergy: field('food_allergy'),
    chronic_disease: field('chronic_disease'),
    grade_level: field('grade_level'),
    section_number: intField('section_number'),
    school_name: field('school_name'),
    student_code: field('student_code'),
    class_number: intField('class_number'),
    address: field('address'),
    phone: field('phone'),
    guardians,
  })
  if (error) return { error: error.message }

  revalidatePath('/settings/profile')
  return { success: true }
}

// Homeroom advisor (owner or admin/manage co-teacher) viewing personal info
// for the students on their homeroom roster — same privilege level required
// for private student_notes.
export async function getHomeroomStudentProfiles(classroomId: string): Promise<Record<string, StudentProfile>> {
  const user = await getAuthUser()
  if (!user) return {}

  const admin = createAdminClient()
  if (!(await canManageClassroom(admin, classroomId, user.id))) return {}

  const { data: memberships } = await admin
    .from('classroom_students')
    .select('student_id')
    .eq('classroom_id', classroomId)
  const studentIds = (memberships ?? []).map((m: any) => m.student_id as string)
  if (studentIds.length === 0) return {}

  const { data: profiles } = await admin
    .from('student_profiles')
    .select('*')
    .in('student_id', studentIds)

  const byId: Record<string, StudentProfile> = {}
  for (const p of (profiles ?? []) as StudentProfile[]) byId[p.student_id] = p
  return byId
}
