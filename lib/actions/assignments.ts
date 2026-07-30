'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyOrgId } from '@/lib/actions/org'
import type { AssignmentStatus, ScoreStrategy } from '@/lib/types'

interface CreateAssignmentData {
  classroom_ids: string[]
  title: string
  description: string
  question_ids: string[]
  question_points?: Record<string, number> | null
  display_max_score?: number | null
  set_id?: string
  start_at: string | null
  end_at: string | null
  duration_minutes: number | null
  mode: 'online' | 'print'
  type?: 'exercise' | 'exam'
  shuffle_questions?: boolean
  shuffle_options?: boolean
  show_results?: 'immediate' | 'after_due'
  max_attempts?: number | null
  score_strategy?: ScoreStrategy
  access_code?: string | null
  passing_type?: 'score' | 'percent' | null
  passing_value?: number | null
  require_work_image?: boolean
  status?: AssignmentStatus
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

  // Only keep overrides for questions actually in this assignment, with a
  // valid positive point value — drops anything a tampered client might add.
  const questionIdSet = new Set(questionIds)
  const sanitizedPoints = Object.fromEntries(
    Object.entries(data.question_points ?? {}).filter(
      ([qid, pts]) => questionIdSet.has(qid) && Number.isFinite(pts) && pts > 0
    )
  )
  const questionPoints = Object.keys(sanitizedPoints).length > 0 ? sanitizedPoints : null
  const displayMaxScore = Number.isFinite(data.display_max_score) && (data.display_max_score as number) > 0
    ? data.display_max_score
    : null

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
      question_points: questionPoints,
      display_max_score: displayMaxScore,
      set_id: data.set_id ?? null,
      start_at: data.start_at || null,
      end_at: data.end_at || null,
      duration_minutes: data.duration_minutes || null,
      mode: data.mode,
      ...(data.type ? { type: data.type } : {}),
      shuffle_questions: data.shuffle_questions ?? false,
      shuffle_options: data.shuffle_options ?? false,
      show_results: data.show_results ?? 'immediate',
      max_attempts: data.max_attempts || null,
      score_strategy: data.score_strategy ?? 'best',
      access_code: data.access_code?.trim() || null,
      passing_type: data.passing_type ?? null,
      passing_value: data.passing_value ?? null,
      require_work_image: data.require_work_image ?? true,
      status: data.status ?? 'draft',
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

interface UpdateAssignmentData {
  title: string
  description: string
  start_at: string | null
  end_at: string | null
  duration_minutes: number | null
  max_attempts: number | null
  score_strategy: ScoreStrategy
  passing_type: 'score' | 'percent' | null
  passing_value: number | null
  question_points?: Record<string, number> | null
  display_max_score?: number | null
}

export async function updateAssignment(id: string, data: UpdateAssignmentData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (!data.title.trim()) return { error: 'กรุณากรอกชื่อชุดข้อสอบ' }
  if (data.start_at && data.end_at && data.start_at > data.end_at) {
    return { error: 'วันเปิดรับต้องอยู่ก่อนวันปิดรับ' }
  }

  // No explicit created_by filter — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all) already restricts this update to owner or
  // authorized co-teacher, same as updateAssignmentStatus above.
  const { data: existing } = await supabase
    .from('assignments')
    .select('question_ids')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return { error: 'ไม่พบชุดข้อสอบ' }

  // Same sanitization as createAssignment — only keep overrides for
  // questions actually in this assignment, with a valid positive value.
  const questionIdSet = new Set(existing.question_ids as string[])
  const sanitizedPoints = Object.fromEntries(
    Object.entries(data.question_points ?? {}).filter(
      ([qid, pts]) => questionIdSet.has(qid) && Number.isFinite(pts) && pts > 0
    )
  )
  const questionPoints = Object.keys(sanitizedPoints).length > 0 ? sanitizedPoints : null
  const displayMaxScore = Number.isFinite(data.display_max_score) && (data.display_max_score as number) > 0
    ? data.display_max_score
    : null

  const { error } = await supabase
    .from('assignments')
    .update({
      title: data.title.trim(),
      description: data.description.trim() || null,
      start_at: data.start_at || null,
      end_at: data.end_at || null,
      duration_minutes: data.duration_minutes || null,
      max_attempts: data.max_attempts || null,
      score_strategy: data.score_strategy,
      passing_type: data.passing_type,
      passing_value: data.passing_value,
      question_points: questionPoints,
      display_max_score: displayMaxScore,
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath(`/assignments/${id}`)
  return { success: true }
}

export async function deleteAssignment(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  // Fetch the home classroom before deleting so we have somewhere to send
  // the teacher back to — there's no more global assignments list page.
  const { data: existing } = await supabase
    .from('assignments')
    .select('classroom_id')
    .eq('id', id)
    .maybeSingle()

  // No explicit created_by filter — RLS already restricts this to owner or
  // authorized (admin/manage) co-teacher.
  const { error } = await supabase
    .from('assignments')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  const classroomId = existing?.classroom_id
  if (classroomId) revalidatePath(`/classrooms/${classroomId}`)
  redirect(classroomId ? `/classrooms/${classroomId}` : '/classrooms')
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
      show_results: source.show_results,
      max_attempts: source.max_attempts,
      score_strategy: source.score_strategy,
      access_code: null,
      passing_type: source.passing_type,
      passing_value: source.passing_value,
      require_work_image: source.require_work_image,
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
