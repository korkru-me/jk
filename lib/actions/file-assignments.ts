'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyOrgId } from '@/lib/actions/org'
import { manageableClassroomIds } from '@/lib/classroom-groups-server'
import { canManageAssignment, studentHasAssignment } from '@/lib/auth/assignment-access'
import { createInlineFileAssignment } from '@/lib/actions/assignments'
import { startSubmission, submitSubmission } from '@/lib/actions/submissions'
import { sanitizeRichTextForStorage } from '@/lib/rich-text-sanitize'
import { parseSubmittedFiles } from '@/lib/exam-attachment'
import { fileAssignmentInstructionStoragePath } from '@/lib/question-file-selection'
import { fileAssignmentQuestionOwner, fileAssignmentWithdrawalError, isFileAssignment, MAX_SUBMISSION_FILES, type FileAssignmentView } from '@/lib/file-assignment'
import { normalizeAssignmentLateSchedule } from '@/lib/late-submission'
import { fileAssignmentDescription } from '@/lib/file-assignment'

function instructionStorageOrigin(): string | null {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin } catch { return null }
}

export interface CreateFileAssignmentInput {
  classroom_ids: string[]
  title: string
  instructions: string
  attachment_urls: string[]
  max_score: number
  start_at: string | null
  due_at: string | null
  end_at: string | null
  status: 'draft' | 'published'
  copy_source_assignment_id?: string
}

export async function createFileAssignment(input: CreateFileAssignmentInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200) return { error: 'กรุณาระบุชื่องานไม่เกิน 200 ตัวอักษร' }
  if (typeof input.instructions !== 'string' || input.instructions.length > 100_000) return { error: 'คำสั่งของงานไม่ถูกต้อง' }
  if (!Number.isFinite(input.max_score) || input.max_score <= 0 || input.max_score > 1_000_000) return { error: 'คะแนนเต็มต้องมากกว่า 0 และไม่เกิน 1,000,000' }
  if (!Array.isArray(input.classroom_ids) || !input.classroom_ids.length || input.classroom_ids.length > 100) return { error: 'กรุณาเลือกห้องเรียน' }
  if (!['draft', 'published'].includes(input.status)) return { error: 'สถานะงานไม่ถูกต้อง' }
  const classroomIds = [...new Set(input.classroom_ids)]
  const allowed = await manageableClassroomIds(createAdminClient(), user.id, classroomIds)
  if (classroomIds.some(id => !allowed.has(id))) return { error: 'คุณไม่มีสิทธิ์มอบหมายงานให้ห้องเรียนที่เลือก' }
  const orgId = await getMyOrgId()
  if (!orgId) return { error: 'ไม่พบข้อมูลสถาบัน' }
  const instructions = sanitizeRichTextForStorage(input.instructions)
  if (!instructions.replace(/<[^>]*>/g, '').trim() && !input.attachment_urls?.length) return { error: 'กรุณาเขียนคำสั่งหรือแนบใบงาน' }
  if (!Array.isArray(input.attachment_urls) || input.attachment_urls.length > 10) return { error: 'แนบเอกสารประกอบได้ไม่เกิน 10 ไฟล์' }
  const storageOrigin = instructionStorageOrigin()
  const copiedFiles = new Set<string>()
  if (input.copy_source_assignment_id) {
    const source = await readFileAssignmentEditor(input.copy_source_assignment_id)
    if ('error' in source) return source
    for (const url of source.input.attachment_urls) copiedFiles.add(url)
  }
  if (input.attachment_urls.some(url => {
    const path = storageOrigin ? fileAssignmentInstructionStoragePath(url, storageOrigin) : null
    return !path || (!path.startsWith(`${user.id}/`) && !copiedFiles.has(url))
  })) {
    return { error: 'เอกสารประกอบต้องเป็นไฟล์ที่คุณแนบไว้ในระบบ' }
  }
  const assignmentId = crypto.randomUUID()
  const { data: question, error } = await supabase.from('questions').insert({
    org_id: orgId, created_by: user.id, title: input.title.trim(),
    question_text: instructions, question_type: 'file_upload', visibility: 'private',
    subject: '', difficulty: 'medium', is_random: false, variables: [], logic_rules: [],
    answer_formula: '', answer_parts: [], image_urls: [], tags: [],
    extra_data: { attachment_urls: input.attachment_urls, file_assignment_id: assignmentId, file_assignment_max_score: input.max_score },
  }).select('id').single()
  if (error || !question) return { error: 'สร้างคำสั่งของงานไม่สำเร็จ กรุณาลองใหม่' }
  try {
    return await createInlineFileAssignment({
      classroom_ids: classroomIds, title: input.title, description: instructions,
      question_ids: [question.id], question_points: { [question.id]: input.max_score },
      start_at: input.start_at, due_at: input.due_at, end_at: input.end_at,
      duration_minutes: null, mode: 'online', type: 'exercise', status: input.status,
      max_attempts: 1, score_strategy: 'latest', instant_check: false,
      calculator_enabled: false, scratchpad_enabled: false,
    }, assignmentId, question.id)
  } finally {
    // A failed create never leaves a prompt in the bank; preserve an assignment
    // if its response was lost rather than deleting content after a commit.
    const existing = await supabase.from('assignments').select('id').eq('id', assignmentId).maybeSingle()
    if (!existing.error && !existing.data) await supabase.from('questions').delete().eq('id', question.id).eq('created_by', user.id)
  }
}

/** Manager DTO contains only the fields the file-work editor needs. */
export async function readFileAssignmentEditor(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !await canManageAssignment(assignmentId, user.id)) return { error: 'คุณไม่มีสิทธิ์แก้ไขงานนี้' } as const
  const admin = createAdminClient()
  const { data: assignment } = await admin.from('assignments').select('id, title, description, question_ids, question_points, start_at, due_at, end_at, status')
    .eq('id', assignmentId).maybeSingle()
  if (!assignment || !isFileAssignment(assignment) || assignment.question_ids.length !== 1) return { error: 'ไม่พบงานส่งไฟล์' } as const
  const { data: question } = await admin.from('questions').select('id, question_text, extra_data').eq('id', assignment.question_ids[0]).maybeSingle()
  if (!question || fileAssignmentQuestionOwner(question.extra_data) !== assignment.id) return { error: 'คำสั่งไม่ตรงกับงานนี้' } as const
  const links = await admin.from('assignment_classrooms').select('classroom_id').eq('assignment_id', assignmentId)
  if (links.error) return { error: 'โหลดห้องเรียนไม่สำเร็จ' } as const
  const input: CreateFileAssignmentInput = {
    classroom_ids: (links.data ?? []).map(row => row.classroom_id), title: assignment.title,
    instructions: question.question_text, attachment_urls: question.extra_data?.attachment_urls ?? [],
    max_score: assignment.question_points?.[question.id] ?? question.extra_data?.file_assignment_max_score ?? 10,
    start_at: assignment.start_at, due_at: assignment.due_at, end_at: assignment.end_at,
    status: assignment.status === 'draft' ? 'draft' : 'published',
  }
  return { input, questionId: question.id, contentLocked: assignment.status !== 'draft' }
}

export async function updateFileAssignment(assignmentId: string, input: CreateFileAssignmentInput) {
  const existing = await readFileAssignmentEditor(assignmentId)
  if ('error' in existing) return existing
  if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200 || typeof input.instructions !== 'string'
    || !Number.isFinite(input.max_score) || input.max_score <= 0 || input.max_score > 1_000_000 || !Array.isArray(input.attachment_urls) || input.attachment_urls.length > 10) return { error: 'รายละเอียดงานไม่ถูกต้อง' }
  const old = existing.input
  if (JSON.stringify([...input.classroom_ids].sort()) !== JSON.stringify([...old.classroom_ids].sort())) return { error: 'แก้ไขห้องเป้าหมายได้จากหน้าจัดการงาน' }
  const instructions = sanitizeRichTextForStorage(input.instructions)
  const contentChanged = instructions !== old.instructions || input.max_score !== old.max_score || JSON.stringify(input.attachment_urls) !== JSON.stringify(old.attachment_urls)
  if (existing.contentLocked && contentChanged) return { error: 'งานที่เผยแพร่แล้วแก้ได้เฉพาะชื่อและกำหนดการ เพื่อรักษาไฟล์และคะแนนที่นักเรียนได้รับ' }
  const schedule = normalizeAssignmentLateSchedule({ dueAt: input.due_at, endAt: input.end_at, startAt: input.start_at, bands: [] })
  if ('error' in schedule) return schedule
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const storageOrigin = instructionStorageOrigin()
  if (input.attachment_urls.some(url => {
    const path = storageOrigin ? fileAssignmentInstructionStoragePath(url, storageOrigin) : null
    return !path || (!path.startsWith(`${user.id}/`) && !old.attachment_urls.includes(url))
  })) return { error: 'เอกสารประกอบไม่ถูกต้อง' }
  const admin = createAdminClient()
  if (contentChanged) {
    const question = await admin.from('questions').update({ question_text: instructions, title: input.title.trim(), extra_data: { attachment_urls: input.attachment_urls, file_assignment_id: assignmentId, file_assignment_max_score: input.max_score } })
      .eq('id', existing.questionId).eq('extra_data->>file_assignment_id', assignmentId)
    if (question.error) return { error: 'บันทึกคำสั่งไม่สำเร็จ กรุณาลองใหม่' }
  }
  const saved = await supabase.from('assignments').update({ title: input.title.trim(), description: fileAssignmentDescription(assignmentId, instructions),
    question_points: { [existing.questionId]: input.max_score }, start_at: input.start_at, due_at: schedule.value.dueAt,
    end_at: input.end_at, late_bands: schedule.value.bands }).eq('id', assignmentId)
  if (saved.error) return { error: 'บันทึกงานไม่สำเร็จ กรุณาลองใหม่' }
  revalidatePath(`/assignments/${assignmentId}`)
  revalidatePath(`/assignments/${assignmentId}/take`)
  revalidatePath(`/assignments/${assignmentId}/edit`)
  for (const classroomId of input.classroom_ids) revalidatePath(`/classrooms/${classroomId}`)
  redirect(`/assignments/${assignmentId}`)
}

async function ownFileAssignment(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' } as const
  const admin = createAdminClient()
  if (!await studentHasAssignment(admin, assignmentId, user.id)) return { error: 'คุณไม่มีสิทธิ์เข้าถึงงานนี้' } as const
  const { data: assignment } = await admin.from('assignments').select('id, title, description, question_ids, classroom_id, status, start_at, due_at, end_at')
    .eq('id', assignmentId).neq('status', 'draft').maybeSingle()
  if (!assignment || !isFileAssignment(assignment) || assignment.question_ids.length !== 1) return { error: 'ไม่พบงานส่งไฟล์' } as const
  const { data: question } = await admin.from('questions').select('id, question_text, extra_data')
    .eq('id', assignment.question_ids[0]).maybeSingle()
  if (!question || fileAssignmentQuestionOwner(question.extra_data) !== assignment.id) return { error: 'คำสั่งไม่ตรงกับงานนี้' } as const
  return { user, admin, assignment, question }
}

export async function readFileAssignment(assignmentId: string): Promise<{ view: FileAssignmentView } | { error: string }> {
  const access = await ownFileAssignment(assignmentId)
  if ('error' in access) return { error: access.error ?? 'ไม่พบงานนี้' }
  const { admin, assignment, question, user } = access
  const { data: submission, error } = await admin.from('submissions')
    .select('id, status, total_score, submitted_at').eq('assignment_id', assignmentId).eq('student_id', user.id)
    .order('attempt_number', { ascending: false }).limit(1).maybeSingle()
  if (error) return { error: 'โหลดงานที่ส่งไม่สำเร็จ กรุณาลองใหม่' }
  const answerResult = submission ? await admin.from('submission_answers').select('id, student_answer, is_correct, answer_reviewed_at, work_reviewed_at')
    .eq('submission_id', submission.id).eq('question_id', question.id).single() : null
  if (answerResult?.error) return { error: 'โหลดไฟล์คำตอบไม่สำเร็จ กรุณาลองใหม่' }
  const answer = answerResult?.data
  const files = parseSubmittedFiles(answer?.student_answer ?? '')
  if (!files) return { error: 'อ่านรายการไฟล์ไม่สำเร็จ กรุณาแจ้งครูผู้สอน' }
  return { view: {
    id: assignment.id, title: assignment.title, classroomId: assignment.classroom_id,
    instructions: question.question_text, attachments: question.extra_data?.attachment_urls ?? [],
    maxScore: question.extra_data?.file_assignment_max_score ?? 10,
    startAt: assignment.start_at, dueAt: assignment.due_at, endAt: assignment.end_at, status: assignment.status,
    submission: submission && answer ? { id: submission.id, answerId: answer.id, status: submission.status,
      files, score: submission.status === 'graded' ? submission.total_score : null, submittedAt: submission.submitted_at } : null,
    withdrawalError: submission ? fileAssignmentWithdrawalError({ assignmentStatus: assignment.status,
      submissionStatus: submission.status, dueAt: assignment.due_at, endAt: assignment.end_at,
      reviewed: !answer || answer.is_correct !== null || Boolean(answer.answer_reviewed_at || answer.work_reviewed_at) }) : null,
  } }
}

export async function startFileAssignment(assignmentId: string) {
  const access = await ownFileAssignment(assignmentId)
  if ('error' in access) return access
  const result = await startSubmission(assignmentId)
  if ('error' in result && result.error) return { error: result.error }
  revalidatePath(`/assignments/${assignmentId}/take`)
  return { success: true as const }
}

export async function submitFileAssignment(assignmentId: string, submissionId: string) {
  const access = await ownFileAssignment(assignmentId)
  if ('error' in access) return access
  const { data: submission } = await access.admin.from('submissions').select('id, status')
    .eq('id', submissionId).eq('assignment_id', assignmentId).eq('student_id', access.user.id).maybeSingle()
  if (!submission || submission.status !== 'in_progress') return { error: 'งานนี้ไม่อยู่ในสถานะที่ส่งได้' }
  const { data: answer } = await access.admin.from('submission_answers').select('student_answer')
    .eq('submission_id', submissionId).eq('question_id', access.question.id).single()
  const files = parseSubmittedFiles(answer?.student_answer)
  if (!files?.length || files.length > MAX_SUBMISSION_FILES) return { error: `กรุณาแนบคำตอบตั้งแต่ 1 ถึง ${MAX_SUBMISSION_FILES} ไฟล์` }
  const result = await submitSubmission(submissionId)
  revalidatePath(`/assignments/${assignmentId}/take`)
  revalidatePath(`/classrooms/${access.assignment.classroom_id}`)
  return result
}

export async function withdrawFileAssignment(assignmentId: string, submissionId: string) {
  const access = await ownFileAssignment(assignmentId)
  if ('error' in access) return access
  const { admin, user, assignment } = access
  const { data: submission } = await admin.from('submissions').select('id, status, submitted_at')
    .eq('id', submissionId).eq('assignment_id', assignmentId).eq('student_id', user.id).maybeSingle()
  if (!submission) return { error: 'ไม่พบงานที่ส่ง' }
  const { data: answer } = await admin.from('submission_answers').select('id, is_correct, answer_reviewed_at, work_reviewed_at')
    .eq('submission_id', submissionId).eq('question_id', access.question.id).single()
  const error = fileAssignmentWithdrawalError({ assignmentStatus: assignment.status, submissionStatus: submission.status,
    dueAt: assignment.due_at, endAt: assignment.end_at, reviewed: !answer || answer.is_correct !== null || Boolean(answer.answer_reviewed_at || answer.work_reviewed_at) })
  if (error) return { error }
  // The grading RPC locks the header first and changes this single-answer
  // submission to graded. Its commit makes this conditional update lose;
  // if withdrawal wins, grading rejects the now-active header instead.
  const update = await admin.from('submissions').update({ status: 'in_progress', submitted_at: null, closed_at: null, close_reason: null, total_score: null }, { count: 'exact' })
    .eq('id', submissionId).eq('student_id', user.id).eq('status', 'submitted').eq('submitted_at', submission.submitted_at)
  if (update.error || update.count !== 1) return { error: 'สถานะงานเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่' }
  revalidatePath(`/assignments/${assignmentId}/take`)
  revalidatePath(`/assignments/${assignmentId}`)
  revalidatePath(`/classrooms/${assignment.classroom_id}`)
  return { success: true as const }
}
