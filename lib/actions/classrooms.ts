'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyOrgId } from '@/lib/actions/org'
import type { Assignment } from '@/lib/types'

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

export async function createClassroom(data: { name: string; description: string; classroomType?: 'subject' | 'homeroom' }) {
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
    classroom_type: data.classroomType ?? 'subject',
  })

  if (error) return { error: error.message }

  revalidatePath('/classrooms', 'layout')
  return { success: true }
}

function assignmentDraftCopyPayload(source: Assignment, classroomId: string, createdBy: string) {
  return {
    org_id: source.org_id,
    classroom_id: classroomId,
    created_by: createdBy,
    title: source.title,
    description: source.description,
    question_ids: source.question_ids,
    sections: source.sections ?? null,
    show_sections: source.show_sections ?? true,
    question_points: source.question_points,
    display_max_score: source.display_max_score,
    set_id: null,
    start_at: null,
    end_at: null,
    duration_minutes: source.duration_minutes,
    mode: source.mode,
    type: source.type,
    shuffle_questions: source.shuffle_questions,
    shuffle_options: source.shuffle_options,
    shared_random_seed: source.shared_random_seed ?? null,
    random_question_count: source.random_question_count ?? null,
    show_results: source.show_results,
    show_solutions: source.show_solutions ?? false,
    max_attempts: source.max_attempts,
    score_strategy: source.score_strategy,
    retry_scope: source.retry_scope ?? 'all',
    questions_per_page: source.questions_per_page ?? 1,
    instant_check: source.instant_check ?? false,
    instant_check_answer_key: source.instant_check_answer_key ?? true,
    completion_rule: source.completion_rule ?? 'fixed',
    streak_target: source.streak_target ?? null,
    streak_question_cap: source.streak_question_cap ?? null,
    streak_recycle_pool: source.streak_recycle_pool ?? true,
    access_code: null,
    passing_type: source.passing_type,
    passing_value: source.passing_value,
    require_work_image: source.require_work_image,
    calculator_enabled: source.mode === 'online' && (source.calculator_enabled ?? false),
    scratchpad_enabled: source.mode === 'online' && (source.scratchpad_enabled ?? false),
    proctoring_enabled: source.proctoring_enabled ?? false,
    fullscreen_required: source.fullscreen_required ?? false,
    block_clipboard: source.block_clipboard ?? false,
    exam_watermark_enabled: source.exam_watermark_enabled ?? false,
    secure_browser_mode: source.secure_browser_mode ?? 'browser',
    android_exam_mode: source.android_exam_mode ?? 'blocked',
    status: 'draft' as const,
  }
}

/**
 * Copy a classroom shell and its assigned exercises/exams. Every copied work
 * item receives a new assignment id and starts as a draft; roster,
 * submissions, scores, comments, announcements and pins are intentionally not
 * copied.
 */
export async function duplicateClassroom(
  id: string,
  overrides?: { name: string; description: string },
) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const admin = createAdminClient()
  const { data: source, error: sourceError } = await admin
    .from('classrooms')
    .select('*')
    .eq('id', id)
    .eq('teacher_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (sourceError) return { error: sourceError.message }
  if (!source) return { error: 'ไม่พบห้องเรียน หรือคุณไม่มีสิทธิ์คัดลอกห้องนี้' }

  const name = overrides?.name.trim() || `${source.name} (สำเนา)`
  if (name.length > 100) return { error: 'ชื่อห้องเรียนไม่เกิน 100 ตัวอักษร' }
  const description = overrides ? overrides.description.trim() : source.description

  let classCode = generateClassCode()
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await admin
      .from('classrooms').select('id').eq('class_code', classCode).maybeSingle()
    if (!existing) break
    classCode = generateClassCode()
  }

  const { data: lastOrder } = await admin
    .from('classrooms')
    .select('display_order')
    .eq('teacher_id', user.id)
    .eq('status', 'active')
    .eq('classroom_type', source.classroom_type)
    .not('display_order', 'is', null)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: copy, error: copyError } = await admin
    .from('classrooms')
    .insert({
      org_id: source.org_id,
      teacher_id: user.id,
      name,
      description: description || null,
      class_code: classCode,
      status: 'active',
      classroom_type: source.classroom_type,
      pinned_at: null,
      display_order: (lastOrder?.display_order ?? 0) + 1,
    })
    .select('id')
    .single()
  if (copyError) return { error: copyError.message }

  const createdAssignmentIds: string[] = []
  const cleanup = async () => {
    if (createdAssignmentIds.length > 0) {
      await admin.from('assignments').delete().in('id', createdAssignmentIds).eq('created_by', user.id)
    }
    await admin.from('classrooms').delete().eq('id', copy.id).eq('teacher_id', user.id)
  }

  const { data: links, error: linksError } = await admin
    .from('assignment_classrooms')
    .select('assignment_id')
    .eq('classroom_id', source.id)
  if (linksError) {
    await cleanup()
    return { error: 'อ่านรายการงานของห้องต้นฉบับไม่สำเร็จ กรุณาลองใหม่' }
  }

  const assignmentIds = Array.from(new Set((links ?? []).map(link => link.assignment_id)))
  if (assignmentIds.length > 0) {
    const { data: sourceAssignments, error: assignmentError } = await admin
      .from('assignments')
      .select('*')
      .in('id', assignmentIds)
    if (assignmentError) {
      await cleanup()
      return { error: 'อ่านแบบฝึกหัดและข้อสอบของห้องต้นฉบับไม่สำเร็จ กรุณาลองใหม่' }
    }

    for (const sourceAssignment of (sourceAssignments ?? []) as Assignment[]) {
      const { data: assignmentCopy, error: insertError } = await admin
        .from('assignments')
        .insert(assignmentDraftCopyPayload(sourceAssignment, copy.id, user.id))
        .select('id')
        .single()
      if (insertError) {
        await cleanup()
        return { error: `คัดลอกงาน “${sourceAssignment.title}” ไม่สำเร็จ ห้องเรียนใหม่จึงยังไม่ถูกสร้าง` }
      }
      createdAssignmentIds.push(assignmentCopy.id)

      const { error: linkError } = await admin.from('assignment_classrooms').insert({
        assignment_id: assignmentCopy.id,
        classroom_id: copy.id,
        group_ids: null,
      })
      if (linkError) {
        await cleanup()
        return { error: `ผูกงาน “${sourceAssignment.title}” กับห้องเรียนใหม่ไม่สำเร็จ ห้องเรียนใหม่จึงยังไม่ถูกสร้าง` }
      }
    }
  }

  revalidatePath('/classrooms', 'layout')
  return { success: true, id: copy.id, copiedAssignments: createdAssignmentIds.length }
}

// ── Update (rename / edit the description shown on the classroom header) ───

export async function updateClassroom(id: string, data: { name: string; description: string }) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const name = data.name.trim()
  if (!name) return { error: 'กรุณากรอกชื่อห้องเรียน' }

  const admin = createAdminClient()
  // `.eq('teacher_id')` is the authorization check: a non-owner matches no row,
  // so `updated` comes back empty rather than the update silently succeeding.
  const { data: updated, error } = await admin
    .from('classrooms')
    .update({ name, description: data.description.trim() || null })
    .eq('id', id)
    .eq('teacher_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!updated) return { error: 'ไม่มีสิทธิ์แก้ไขห้องเรียนนี้' }

  revalidatePath('/classrooms')
  revalidatePath(`/classrooms/${id}`)
  return { success: true }
}

// ── Soft delete (moves to trash, kept for 30 days) ─────────────────────────

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
  return { success: true }
}

// ── Permanent delete (scheduled after 30 days, or forced from trash page) ──

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

// ── Manual classroom ordering ──────────────────────────────────────────────

export async function reorderClassrooms(orderedClassroomIds: string[]) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const ids = orderedClassroomIds.filter(id => typeof id === 'string' && id)
  if (ids.length === 0 || ids.length > 500 || new Set(ids).size !== ids.length) {
    return { error: 'ลำดับห้องเรียนไม่ถูกต้อง กรุณารีเฟรชแล้วลองใหม่' }
  }

  // Pinning is no longer part of the classroom list UI. Clear any legacy pins
  // owned by this teacher before the existing atomic order RPC validates the
  // complete subject-room list.
  const admin = createAdminClient()
  const { error: unpinError } = await admin
    .from('classrooms')
    .update({ pinned_at: null })
    .in('id', ids)
    .eq('teacher_id', user.id)
    .eq('status', 'active')
    .eq('classroom_type', 'subject')
  if (unpinError) return { error: 'เตรียมลำดับห้องเรียนไม่สำเร็จ กรุณาลองใหม่' }

  // The RPC checks auth.uid(), ownership and active status again inside one
  // transaction. A forged list still cannot reorder someone else's room.
  const supabase = await createClient()
  const { error } = await supabase.rpc('reorder_my_classrooms', { ordered_ids: ids })
  if (error) return { error: 'รายการห้องเรียนมีการเปลี่ยนแปลง กรุณารีเฟรชแล้วลองจัดลำดับอีกครั้ง' }

  revalidatePath('/classrooms')
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
  return removeStudents(classroomId, [studentId])
}

export async function removeStudents(classroomId: string, studentIds: string[]) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (!Array.isArray(studentIds) || studentIds.length === 0 || studentIds.length > 500) {
    return { error: 'รายการนักเรียนไม่ถูกต้อง' }
  }
  const uniqueIds = [...new Set(studentIds)]
  if (
    uniqueIds.length !== studentIds.length
    || uniqueIds.some(studentId => typeof studentId !== 'string' || !studentId)
  ) {
    return { error: 'รายการนักเรียนไม่ถูกต้อง' }
  }

  const admin = createAdminClient()
  if (!(await canManageClassroom(admin, classroomId, user.id))) return { error: 'ไม่มีสิทธิ์' }

  const { error } = await admin
    .from('classroom_students')
    .delete()
    .eq('classroom_id', classroomId)
    .in('student_id', uniqueIds)
  if (error) return { error: error.message }
  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
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

export async function reorderAssignmentDisplayOrder(classroomId: string, orderedAssignmentIds: string[]) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (orderedAssignmentIds.length === 0 || orderedAssignmentIds.length > 500) {
    return { error: 'รายการงานไม่ถูกต้อง กรุณาลองใหม่' }
  }
  const uniqueIds = [...new Set(orderedAssignmentIds)]
  if (uniqueIds.length !== orderedAssignmentIds.length || uniqueIds.some(id => typeof id !== 'string' || !id)) {
    return { error: 'รายการงานไม่ถูกต้อง กรุณาลองใหม่' }
  }

  const admin = createAdminClient()
  if (!(await canManageClassroom(admin, classroomId, user.id))) return { error: 'ไม่มีสิทธิ์' }

  const { data: links, error: linkError } = await admin
    .from('assignment_classrooms')
    .select('id, assignment_id')
    .eq('classroom_id', classroomId)
    .in('assignment_id', uniqueIds)
  if (linkError) return { error: linkError.message }
  if (!links || links.length !== uniqueIds.length) {
    return { error: 'มีรายการงานเปลี่ยนแปลง กรุณารีเฟรชแล้วลองจัดลำดับอีกครั้ง' }
  }

  const linkByAssignment = new Map(links.map(link => [link.assignment_id, link.id]))
  const { error } = await admin
    .from('assignment_classrooms')
    .upsert(orderedAssignmentIds.map((assignmentId, index) => ({
      id: linkByAssignment.get(assignmentId)!,
      assignment_id: assignmentId,
      classroom_id: classroomId,
      display_order: index + 1,
    })), { onConflict: 'id' })
  if (error) return { error: error.message }
  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
}

export async function reorderClassroomStudentRoster(classroomId: string, orderedStudentIds: string[]) {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (orderedStudentIds.length === 0 || orderedStudentIds.length > 500) {
    return { error: 'รายชื่อนักเรียนไม่ถูกต้อง กรุณาลองใหม่' }
  }
  const uniqueIds = [...new Set(orderedStudentIds)]
  if (uniqueIds.length !== orderedStudentIds.length || uniqueIds.some(id => typeof id !== 'string' || !id)) {
    return { error: 'รายชื่อนักเรียนไม่ถูกต้อง กรุณาลองใหม่' }
  }

  const admin = createAdminClient()
  if (!(await canManageClassroom(admin, classroomId, user.id))) return { error: 'ไม่มีสิทธิ์' }

  const { data: memberships, error: membershipError } = await admin
    .from('classroom_students')
    .select('id, student_id')
    .eq('classroom_id', classroomId)
  if (membershipError) return { error: membershipError.message }
  const requested = new Set(uniqueIds)
  if (!memberships || memberships.length !== uniqueIds.length || memberships.some(row => !requested.has(row.student_id))) {
    return { error: 'รายชื่อนักเรียนมีการเปลี่ยนแปลง กรุณารีเฟรชแล้วลองจัดลำดับอีกครั้ง' }
  }

  const membershipByStudent = new Map(memberships.map(row => [row.student_id, row.id]))
  const { error } = await admin
    .from('classroom_students')
    .upsert(orderedStudentIds.map((studentId, index) => ({
      id: membershipByStudent.get(studentId)!,
      classroom_id: classroomId,
      student_id: studentId,
      roster_order: index + 1,
    })), { onConflict: 'id' })
  if (error) return { error: error.message }
  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
}
