'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  MAX_ASSIGNMENT_CATEGORIES_PER_CLASSROOM,
  isAssignmentCategoryColor,
  normalizeAssignmentCategoryName,
  type AssignmentCategory,
} from '@/lib/assignment-categories'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CATEGORY_COLUMNS = 'id, classroom_id, name, color, position'
const NO_PERMISSION = 'ไม่มีสิทธิ์จัดกลุ่มงานในห้องเรียนนี้'
const STALE = 'ข้อมูลบนหน้าไม่ตรงกับล่าสุด กรุณารีเฟรชหน้าแล้วลองอีกครั้ง'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

async function authorize(classroomId: string): Promise<{ userId: string } | { error: string }> {
  if (!UUID.test(classroomId)) return { error: STALE }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const admin = createAdminClient()
  const { data: classroom } = await admin
    .from('classrooms')
    .select('teacher_id')
    .eq('id', classroomId)
    .maybeSingle()
  if (!classroom) return { error: NO_PERMISSION }
  if (classroom.teacher_id === user.id) return { userId: user.id }

  const { data: coTeacher } = await admin
    .from('classroom_co_teachers')
    .select('permission')
    .eq('classroom_id', classroomId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (coTeacher?.permission === 'admin' || coTeacher?.permission === 'manage') {
    return { userId: user.id }
  }
  return { error: NO_PERMISSION }
}

function writeError(error: { code?: string } | null): string {
  if (error?.code === '42501') return NO_PERMISSION
  if (error?.code === '23505') return 'มีกลุ่มชื่อนี้ในห้องแล้ว'
  if (error?.code === '23503' || error?.code === '23514') return STALE
  return 'บันทึกกลุ่มงานไม่สำเร็จ กรุณาลองใหม่'
}

async function categoriesOf(classroomId: string): Promise<AssignmentCategory[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('classroom_assignment_categories')
    .select(CATEGORY_COLUMNS)
    .eq('classroom_id', classroomId)
    .order('position')
    .order('created_at')
  return (data ?? []) as AssignmentCategory[]
}

export async function createAssignmentCategory(
  classroomId: string,
  input: { name: string; color: string },
): Promise<Result<{ category: AssignmentCategory }>> {
  const auth = await authorize(classroomId)
  if ('error' in auth) return { ok: false, error: auth.error }

  const name = normalizeAssignmentCategoryName(input.name)
  if (!name) return { ok: false, error: 'กรุณาตั้งชื่อกลุ่ม (ไม่เกิน 60 ตัวอักษร)' }
  if (!isAssignmentCategoryColor(input.color)) return { ok: false, error: 'สีกลุ่มไม่ถูกต้อง' }

  const existing = await categoriesOf(classroomId)
  if (existing.length >= MAX_ASSIGNMENT_CATEGORIES_PER_CLASSROOM) {
    return { ok: false, error: `ห้องหนึ่งมีได้ไม่เกิน ${MAX_ASSIGNMENT_CATEGORIES_PER_CLASSROOM} กลุ่มงาน` }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('classroom_assignment_categories')
    .insert({
      classroom_id: classroomId,
      name,
      color: input.color,
      position: existing.reduce((max, category) => Math.max(max, category.position), -1) + 1,
      created_by: auth.userId,
    })
    .select(CATEGORY_COLUMNS)
    .single()
  if (error || !data) return { ok: false, error: writeError(error) }
  revalidatePath(`/classrooms/${classroomId}`)
  return { ok: true, category: data as AssignmentCategory }
}

export async function updateAssignmentCategory(
  classroomId: string,
  categoryId: string,
  patch: { name: string; color: string },
): Promise<Result<{ category: AssignmentCategory }>> {
  const auth = await authorize(classroomId)
  if ('error' in auth) return { ok: false, error: auth.error }
  if (!UUID.test(categoryId)) return { ok: false, error: STALE }

  const name = normalizeAssignmentCategoryName(patch.name)
  if (!name) return { ok: false, error: 'กรุณาตั้งชื่อกลุ่ม (ไม่เกิน 60 ตัวอักษร)' }
  if (!isAssignmentCategoryColor(patch.color)) return { ok: false, error: 'สีกลุ่มไม่ถูกต้อง' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('classroom_assignment_categories')
    .update({ name, color: patch.color })
    .eq('id', categoryId)
    .eq('classroom_id', classroomId)
    .select(CATEGORY_COLUMNS)
    .maybeSingle()
  if (error) return { ok: false, error: writeError(error) }
  if (!data) return { ok: false, error: STALE }
  revalidatePath(`/classrooms/${classroomId}`)
  return { ok: true, category: data as AssignmentCategory }
}

export async function deleteAssignmentCategory(
  classroomId: string,
  categoryId: string,
): Promise<Result> {
  const auth = await authorize(classroomId)
  if ('error' in auth) return { ok: false, error: auth.error }
  if (!UUID.test(categoryId)) return { ok: false, error: STALE }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('classroom_assignment_categories')
    .delete()
    .eq('id', categoryId)
    .eq('classroom_id', classroomId)
    .select('id')
  if (error) return { ok: false, error: writeError(error) }
  if (!data || data.length === 0) return { ok: false, error: STALE }
  revalidatePath(`/classrooms/${classroomId}`)
  return { ok: true }
}

export async function setAssignmentCategory(
  classroomId: string,
  assignmentId: string,
  categoryId: string | null,
): Promise<Result> {
  const auth = await authorize(classroomId)
  if ('error' in auth) return { ok: false, error: auth.error }
  if (!UUID.test(assignmentId) || (categoryId !== null && !UUID.test(categoryId))) {
    return { ok: false, error: STALE }
  }

  const admin = createAdminClient()
  if (categoryId !== null) {
    const { data: category } = await admin
      .from('classroom_assignment_categories')
      .select('id')
      .eq('id', categoryId)
      .eq('classroom_id', classroomId)
      .maybeSingle()
    if (!category) return { ok: false, error: STALE }
  }

  // assignment_classrooms intentionally has no browser UPDATE policy. The
  // exact classroom and category were authorized above, so this service write
  // is pinned to the one classroom/assignment link the teacher is looking at.
  const { data: updated, error } = await admin
    .from('assignment_classrooms')
    .update({ category_id: categoryId })
    .eq('classroom_id', classroomId)
    .eq('assignment_id', assignmentId)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: writeError(error) }
  if (!updated) return { ok: false, error: STALE }
  revalidatePath(`/classrooms/${classroomId}`)
  return { ok: true }
}
