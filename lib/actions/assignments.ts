'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyOrgId } from '@/lib/actions/org'
import type { AssignmentStatus } from '@/lib/types'

interface CreateAssignmentData {
  classroom_ids: string[]
  title: string
  description: string
  question_ids: string[]
  set_id?: string
  start_at: string | null
  end_at: string | null
  duration_minutes: number | null
  mode: 'online' | 'print'
  type?: 'exercise' | 'exam'
}

export async function createAssignment(data: CreateAssignmentData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (data.classroom_ids.length === 0) return { error: 'กรุณาเลือกห้องเรียนอย่างน้อย 1 ห้อง' }

  // When created from a saved set, trust the set's own question_ids (fetched
  // server-side under RLS) rather than whatever the client sent, so a
  // tampered request can't smuggle in questions the set doesn't contain.
  let questionIds = data.question_ids
  if (data.set_id) {
    const { data: set } = await supabase
      .from('question_sets')
      .select('question_ids')
      .eq('id', data.set_id)
      .maybeSingle()
    if (!set) return { error: 'ไม่พบชุดโจทย์' }
    questionIds = set.question_ids
  }

  if (questionIds.length === 0) return { error: 'กรุณาเลือกโจทย์อย่างน้อย 1 ข้อ' }

  const orgId = await getMyOrgId()
  if (!orgId) return { error: 'ไม่พบข้อมูลสถาบัน กรุณาติดต่อผู้ดูแล' }

  const { data: assignment, error } = await supabase
    .from('assignments')
    .insert({
      org_id: orgId,
      classroom_id: data.classroom_ids[0],
      created_by: user.id,
      title: data.title.trim(),
      description: data.description.trim() || null,
      question_ids: questionIds,
      set_id: data.set_id ?? null,
      start_at: data.start_at || null,
      end_at: data.end_at || null,
      duration_minutes: data.duration_minutes || null,
      mode: data.mode,
      ...(data.type ? { type: data.type } : {}),
      status: 'draft',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  const { error: linkError } = await supabase
    .from('assignment_classrooms')
    .insert(data.classroom_ids.map(classroom_id => ({ assignment_id: assignment.id, classroom_id })))

  if (linkError) return { error: 'ไม่มีสิทธิ์มอบหมายงานให้ห้องเรียนนี้' }

  revalidatePath('/assignments')
  redirect(`/assignments/${assignment.id}`)
}

export async function updateAssignmentStatus(id: string, status: AssignmentStatus) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  // No explicit created_by filter — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all, the latter scoped to admin/manage
  // permission) already restricts this update to owner or authorized
  // co-teacher; an update matching zero rows fails silently (0 rows
  // affected, not an error), which is acceptable here.
  const { error } = await supabase
    .from('assignments')
    .update({ status })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath(`/assignments/${id}`)
  return { success: true }
}

export async function deleteAssignment(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  // No explicit created_by filter — RLS already restricts this to owner or
  // authorized (admin/manage) co-teacher.
  const { error } = await supabase
    .from('assignments')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/assignments')
  redirect('/assignments')
}

export async function duplicateAssignment(id: string, opts?: { targetClassroomIds?: string[] }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: source } = await supabase
    .from('assignments')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!source) return { error: 'ไม่พบชุดข้อสอบ' }

  const { data: sourceLinks } = await supabase
    .from('assignment_classrooms')
    .select('classroom_id')
    .eq('assignment_id', id)

  const targetClassroomIds = opts?.targetClassroomIds?.length
    ? opts.targetClassroomIds
    : (sourceLinks ?? []).map((l: any) => l.classroom_id)

  if (targetClassroomIds.length === 0) return { error: 'ไม่พบห้องเรียนปลายทาง' }

  const orgId = await getMyOrgId()
  if (!orgId) return { error: 'ไม่พบข้อมูลสถาบัน กรุณาติดต่อผู้ดูแล' }

  const { data: copy, error } = await supabase
    .from('assignments')
    .insert({
      org_id: orgId,
      classroom_id: targetClassroomIds[0],
      created_by: user.id,
      title: `${source.title} (สำเนา)`,
      description: source.description,
      question_ids: source.question_ids,
      set_id: null,
      start_at: null,
      end_at: null,
      duration_minutes: source.duration_minutes,
      mode: source.mode,
      type: source.type,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  const { error: linkError } = await supabase
    .from('assignment_classrooms')
    .insert(targetClassroomIds.map(classroom_id => ({ assignment_id: copy.id, classroom_id })))

  if (linkError) return { error: 'ไม่มีสิทธิ์มอบหมายงานให้ห้องเรียนปลายทาง' }

  revalidatePath('/assignments')
  redirect(`/assignments/${copy.id}`)
}

export async function getMyAssignments() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('assignments')
    .select('*, classrooms(name)')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  return data ?? []
}

export async function getStudentAssignments() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: memberships } = await supabase
    .from('classroom_students')
    .select('classroom_id')
    .eq('student_id', user.id)

  if (!memberships || memberships.length === 0) return []

  const classroomIds = memberships.map((m: { classroom_id: string }) => m.classroom_id)

  const { data } = await supabase
    .from('assignments')
    .select('*, classrooms(name), submissions(id, status, total_score, max_score)')
    .in('classroom_id', classroomIds)
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  return data ?? []
}
