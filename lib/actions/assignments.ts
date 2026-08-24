'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyOrgId } from '@/lib/actions/org'
import { filterSectionsToQuestions, parseSections, type QuestionSetSection } from '@/lib/question-set-sections'
import type { AssignmentStatus, ScoreStrategy, ShowResultsMode } from '@/lib/types'

const SHOW_RESULTS_MODES: ShowResultsMode[] = ['immediate', 'score_only', 'after_due', 'never']

interface CreateAssignmentData {
  classroom_ids: string[]
  title: string
  description: string
  question_ids: string[]
  question_points?: Record<string, number> | null
  display_max_score?: number | null
  set_id?: string
  /** แฟ้มย่อย to freeze onto this assignment, normally copied from the แฟ้มโจทย์
   *  it was built from. Filtered server-side to questions this assignment
   *  actually contains. */
  sections?: QuestionSetSection[]
  /** Whether those แฟ้มย่อย appear for students and on the printed sheet. */
  show_sections?: boolean
  start_at: string | null
  end_at: string | null
  duration_minutes: number | null
  mode: 'online' | 'print'
  type?: 'exercise' | 'exam'
  shuffle_questions?: boolean
  shuffle_options?: boolean
  random_question_count?: number | null
  show_results?: ShowResultsMode
  max_attempts?: number | null
  score_strategy?: ScoreStrategy
  access_code?: string | null
  passing_type?: 'score' | 'percent' | null
  passing_value?: number | null
  require_work_image?: boolean
  proctoring_enabled?: boolean
  fullscreen_required?: boolean
  block_clipboard?: boolean
  exam_watermark_enabled?: boolean
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
  let sections = data.sections ?? []
  if (data.set_id) {
    const { data: set } = await supabase
      .from('question_sets')
      .select('question_ids, sections')
      .eq('id', data.set_id)
      .maybeSingle()
    if (!set) return { error: 'ไม่พบแฟ้มโจทย์' }
    // Keep the teacher's own choice and order — trimming questions, or
    // assigning a single แฟ้มย่อย, both have to survive this — while still
    // refusing any id the แฟ้ม doesn't contain. Falls back to the whole แฟ้ม
    // when nothing survives, which is what a caller sending no question_ids
    // at all relies on.
    const setIds = new Set<string>(set.question_ids)
    const kept = questionIds.filter(id => setIds.has(id))
    questionIds = kept.length > 0 ? kept : set.question_ids
    if (sections.length === 0) sections = parseSections(set.sections)
  }

  if (questionIds.length === 0) return { error: 'กรุณาเลือกโจทย์อย่างน้อย 1 ข้อ' }

  const showResults = data.show_results ?? 'immediate'
  if (!SHOW_RESULTS_MODES.includes(showResults)) return { error: 'รูปแบบการแสดงผลลัพธ์ไม่ถูกต้อง' }
  const isOnlineExam = data.mode === 'online' && data.type === 'exam'
  const proctoringEnabled = isOnlineExam && data.proctoring_enabled === true
  const randomQuestionCount = isOnlineExam
    && Number.isInteger(data.random_question_count)
    && (data.random_question_count as number) > 0
    && (data.random_question_count as number) < questionIds.length
      ? data.random_question_count
      : null

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
      sections: sections.length > 0 ? filterSectionsToQuestions(sections, questionIds) : null,
      show_sections: data.show_sections ?? true,
      start_at: data.start_at || null,
      end_at: data.end_at || null,
      duration_minutes: data.duration_minutes || null,
      mode: data.mode,
      ...(data.type ? { type: data.type } : {}),
      shuffle_questions: data.shuffle_questions ?? false,
      shuffle_options: data.shuffle_options ?? false,
      random_question_count: randomQuestionCount,
      show_results: showResults,
      max_attempts: data.max_attempts || null,
      score_strategy: data.score_strategy ?? 'best',
      access_code: data.access_code?.trim() || null,
      passing_type: data.passing_type ?? null,
      passing_value: data.passing_value ?? null,
      require_work_image: data.require_work_image ?? true,
      proctoring_enabled: proctoringEnabled,
      fullscreen_required: proctoringEnabled && data.fullscreen_required === true,
      block_clipboard: proctoringEnabled && data.block_clipboard === true,
      exam_watermark_enabled: isOnlineExam && data.exam_watermark_enabled === true,
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
  show_results: ShowResultsMode
  /** Only the visibility of the frozen แฟ้มย่อย is editable after the fact —
   *  the grouping itself belongs to the แฟ้มโจทย์ this งาน came from. */
  show_sections?: boolean
  proctoring_enabled: boolean
  fullscreen_required: boolean
  block_clipboard: boolean
  random_question_count: number | null
  exam_watermark_enabled: boolean
}

export async function updateAssignment(id: string, data: UpdateAssignmentData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (!data.title.trim()) return { error: 'กรุณากรอกชื่อชุดข้อสอบ' }
  if (data.start_at && data.end_at && data.start_at > data.end_at) {
    return { error: 'วันเปิดรับต้องอยู่ก่อนวันปิดรับ' }
  }
  if (!SHOW_RESULTS_MODES.includes(data.show_results)) return { error: 'รูปแบบการแสดงผลลัพธ์ไม่ถูกต้อง' }

  // No explicit created_by filter — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all) already restricts this update to owner or
  // authorized co-teacher, same as updateAssignmentStatus above.
  const { data: existing } = await supabase
    .from('assignments')
    .select('question_ids, type, mode, random_question_count')
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
  const isOnlineExam = existing.mode === 'online' && existing.type === 'exam'
  const proctoringEnabled = isOnlineExam && data.proctoring_enabled
  const randomQuestionCount = isOnlineExam
    && Number.isInteger(data.random_question_count)
    && data.random_question_count !== null
    && data.random_question_count > 0
    && data.random_question_count < existing.question_ids.length
      ? data.random_question_count
      : null

  // Existing attempts already have their subset frozen. Refuse to change the
  // draw size after anyone has started so later students do not receive a
  // materially different exam by accident.
  if (randomQuestionCount !== existing.random_question_count) {
    const { data: startedSubmission, error: startedSubmissionError } = await supabase
      .from('submissions')
      .select('id')
      .eq('assignment_id', id)
      .limit(1)
      .maybeSingle()
    if (startedSubmissionError) return { error: 'ตรวจสอบสถานะผู้เข้าสอบไม่สำเร็จ กรุณาลองใหม่' }
    if (startedSubmission) return { error: 'เปลี่ยนจำนวนข้อสุ่มไม่ได้หลังมีนักเรียนเริ่มทำข้อสอบแล้ว' }
  }

  const { error } = await supabase
    .from('assignments')
    .update({
      title: data.title.trim(),
      description: data.description.trim() || null,
      ...(data.show_sections === undefined ? {} : { show_sections: data.show_sections }),
      start_at: data.start_at || null,
      end_at: data.end_at || null,
      duration_minutes: data.duration_minutes || null,
      max_attempts: data.max_attempts || null,
      score_strategy: data.score_strategy,
      passing_type: data.passing_type,
      passing_value: data.passing_value,
      question_points: questionPoints,
      display_max_score: displayMaxScore,
      show_results: data.show_results,
      random_question_count: randomQuestionCount,
      proctoring_enabled: proctoringEnabled,
      fullscreen_required: proctoringEnabled && data.fullscreen_required,
      block_clipboard: proctoringEnabled && data.block_clipboard,
      exam_watermark_enabled: isOnlineExam && data.exam_watermark_enabled,
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
      random_question_count: source.random_question_count ?? null,
      show_results: source.show_results,
      max_attempts: source.max_attempts,
      score_strategy: source.score_strategy,
      access_code: null,
      passing_type: source.passing_type,
      passing_value: source.passing_value,
      require_work_image: source.require_work_image,
      proctoring_enabled: source.proctoring_enabled ?? false,
      fullscreen_required: source.fullscreen_required ?? false,
      block_clipboard: source.block_clipboard ?? false,
      exam_watermark_enabled: source.exam_watermark_enabled ?? false,
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
