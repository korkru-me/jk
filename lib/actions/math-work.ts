'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getExamAccessSession } from '@/lib/exam-access-session'
import {
  buildStudentWorkUploadPaths,
  buildTeachingBoardUploadPaths,
  hasWebpSignature,
  isSupportedWorkFormatVersion,
  isUuid,
  isWorkArtifactSource,
  isWorkPartKey,
  MATH_WORK_BUCKET,
  readSceneElementCount,
  validateStoredWorkFile,
  type WorkArtifactSource,
  type WorkUploadPaths,
} from '@/lib/math-work'

const SIGNED_READ_SECONDS = 5 * 60

type AdminClient = ReturnType<typeof createAdminClient>
type SessionClient = Awaited<ReturnType<typeof createClient>>

interface StudentArtifactContext {
  answerId: string
  submissionId: string
  orgId: string
  questionType: string
  answerParts: unknown[]
}

interface StoredWorkInspection {
  previewSize: number
  sceneSize: number | null
  elementCount: number | null
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

function fileMetadata(value: unknown): { size?: number; contentType?: string } {
  if (!value || typeof value !== 'object') return {}
  const row = value as Record<string, unknown>
  const metadata = row.metadata && typeof row.metadata === 'object'
    ? row.metadata as Record<string, unknown>
    : {}
  return {
    size: typeof row.size === 'number'
      ? row.size
      : typeof metadata.size === 'number' ? metadata.size : undefined,
    contentType: typeof row.contentType === 'string'
      ? row.contentType
      : typeof metadata.mimetype === 'string' ? metadata.mimetype : undefined,
  }
}

function isAllowedPartKey(partKey: string, questionType: string, answerParts: unknown[]): boolean {
  if (partKey === 'answer') return true
  const match = /^part:(\d+)$/.exec(partKey)
  if (!match || questionType !== 'written') return false
  const partIndex = Number(match[1])
  const partCount = Math.max(1, answerParts.length)
  return partIndex >= 0 && partIndex < partCount
}

async function loadWritableStudentArtifactContext(
  admin: AdminClient,
  submissionAnswerId: string,
  studentId: string,
  sourceType: WorkArtifactSource,
): Promise<{ context: StudentArtifactContext } | { error: string }> {
  const { data: answer, error } = await admin
    .from('submission_answers')
    .select(`
      id, org_id, submission_id,
      questions(question_type, answer_parts),
      submissions(
        id, org_id, student_id, status, started_at, assignment_id,
        assignments(
          id, org_id, mode, duration_minutes, end_at, require_work_image,
          scratchpad_enabled, secure_browser_mode, android_exam_mode
        )
      )
    `)
    .eq('id', submissionAnswerId)
    .maybeSingle()

  if (error) return { error: 'ตรวจสอบสิทธิ์แนบวิธีทำไม่สำเร็จ กรุณาลองใหม่' }
  if (!answer) return { error: 'ไม่พบคำตอบ' }

  const submission = relationOne(answer.submissions)
  const assignment = relationOne(submission?.assignments)
  const question = relationOne(answer.questions)

  if (!submission || submission.student_id !== studentId) return { error: 'ไม่มีสิทธิ์แนบวิธีทำนี้' }
  if (!assignment || answer.org_id !== submission.org_id || answer.org_id !== assignment.org_id) {
    return { error: 'ข้อมูลคำตอบไม่อยู่ในสถาบันเดียวกัน' }
  }
  if (submission.status !== 'in_progress') return { error: 'ส่งงานแล้ว จึงแก้ไขวิธีทำไม่ได้' }
  if (assignment.mode !== 'online') return { error: 'งานแบบพิมพ์ไม่รองรับการแนบวิธีทำออนไลน์' }

  if (assignment.duration_minutes) {
    const deadline = new Date(submission.started_at).getTime() + assignment.duration_minutes * 60_000
    if (Date.now() > deadline) return { error: 'หมดเวลาทำข้อสอบแล้ว' }
  }

  if (assignment.end_at && new Date(assignment.end_at).getTime() < Date.now()) {
    const { data: extension } = await admin
      .from('assignment_extensions')
      .select('extended_end_at')
      .eq('assignment_id', submission.assignment_id)
      .eq('student_id', studentId)
      .maybeSingle()
    if (!extension?.extended_end_at || new Date(extension.extended_end_at).getTime() < Date.now()) {
      return { error: 'หมดเวลาส่งแล้ว' }
    }
  }

  if (
    assignment.secure_browser_mode === 'seb_required'
    && !await getExamAccessSession(
      studentId,
      submission.assignment_id,
      assignment.android_exam_mode === 'monitored',
    )
  ) {
    return { error: 'เซสชันเข้าสอบหมดอายุ กรุณากลับไปเปิดข้อสอบใหม่' }
  }

  if (sourceType === 'scratchpad' && assignment.scratchpad_enabled !== true) {
    return { error: 'ครูไม่ได้เปิดกระดาษทดสำหรับงานนี้' }
  }
  if (
    sourceType === 'photo'
    && assignment.scratchpad_enabled !== true
    && assignment.require_work_image !== true
  ) {
    return { error: 'งานนี้ไม่ได้เปิดให้แนบวิธีทำ' }
  }

  return {
    context: {
      answerId: answer.id,
      submissionId: submission.id,
      orgId: answer.org_id,
      questionType: question?.question_type ?? '',
      answerParts: Array.isArray(question?.answer_parts) ? question.answer_parts : [],
    },
  }
}

async function loadManagedTeachingBoardContext(
  supabase: SessionClient,
  assignmentId: string,
  questionId: string,
): Promise<{ orgId: string } | { error: string }> {
  const [{ data: canManage, error: permissionError }, { data: assignment, error: assignmentError }] = await Promise.all([
    supabase.rpc('can_manage_math_tools_assignment', { p_assignment_id: assignmentId }),
    supabase
      .from('assignments')
      .select('id, org_id, question_ids')
      .eq('id', assignmentId)
      .maybeSingle(),
  ])

  if (permissionError || assignmentError) return { error: 'ตรวจสอบสิทธิ์กระดานสอนไม่สำเร็จ กรุณาลองใหม่' }
  if (canManage !== true || !assignment) return { error: 'ไม่มีสิทธิ์สร้างกระดานสอนในงานนี้' }
  if (!(assignment.question_ids as string[]).includes(questionId)) return { error: 'โจทย์นี้ไม่ได้อยู่ในงานดังกล่าว' }
  return { orgId: assignment.org_id }
}

async function createSignedUploadTargets(
  admin: AdminClient,
  paths: WorkUploadPaths,
): Promise<{
  preview: { path: string; token: string }
  scene: { path: string; token: string } | null
} | { error: string }> {
  const bucket = admin.storage.from(MATH_WORK_BUCKET)
  const [preview, scene] = await Promise.all([
    bucket.createSignedUploadUrl(paths.previewPath),
    paths.scenePath ? bucket.createSignedUploadUrl(paths.scenePath) : Promise.resolve(null),
  ])

  if (preview.error || (scene && scene.error)) {
    return { error: 'เตรียมพื้นที่อัปโหลดไม่สำเร็จ กรุณาลองใหม่' }
  }

  return {
    preview: { path: paths.previewPath, token: preview.data.token },
    scene: scene ? { path: paths.scenePath!, token: scene.data.token } : null,
  }
}

async function inspectStoredWork(
  admin: AdminClient,
  paths: WorkUploadPaths,
): Promise<{ inspection: StoredWorkInspection } | { error: string }> {
  const bucket = admin.storage.from(MATH_WORK_BUCKET)
  const [previewInfo, sceneInfo] = await Promise.all([
    bucket.info(paths.previewPath),
    paths.scenePath ? bucket.info(paths.scenePath) : Promise.resolve(null),
  ])

  if (previewInfo.error || (sceneInfo && sceneInfo.error)) {
    return { error: 'ยังอัปโหลดไฟล์วิธีทำไม่ครบ กรุณาลองอัปโหลดอีกครั้ง' }
  }

  const previewMeta = fileMetadata(previewInfo.data)
  const previewCheck = validateStoredWorkFile({
    kind: 'preview',
    size: previewMeta.size,
    contentType: previewMeta.contentType,
  })
  if (!previewCheck.ok) return { error: previewCheck.error }

  let sceneSize: number | null = null
  if (sceneInfo) {
    const sceneMeta = fileMetadata(sceneInfo.data)
    const sceneCheck = validateStoredWorkFile({
      kind: 'scene',
      size: sceneMeta.size,
      contentType: sceneMeta.contentType,
    })
    if (!sceneCheck.ok) return { error: sceneCheck.error }
    sceneSize = sceneCheck.size
  }

  const [previewDownload, sceneDownload] = await Promise.all([
    bucket.download(paths.previewPath),
    paths.scenePath ? bucket.download(paths.scenePath) : Promise.resolve(null),
  ])
  if (previewDownload.error || (sceneDownload && sceneDownload.error)) {
    return { error: 'ตรวจสอบไฟล์วิธีทำไม่สำเร็จ กรุณาลองใหม่' }
  }

  const previewHeader = new Uint8Array((await previewDownload.data.arrayBuffer()).slice(0, 12))
  if (!hasWebpSignature(previewHeader)) return { error: 'ไฟล์ตัวอย่างไม่ใช่ WebP ที่ถูกต้อง' }

  let elementCount: number | null = null
  if (sceneDownload) {
    try {
      const scene = JSON.parse(await sceneDownload.data.text()) as unknown
      elementCount = readSceneElementCount(scene)
    } catch {
      return { error: 'ไฟล์ต้นฉบับเปิดอ่านไม่ได้' }
    }
    if (elementCount === null) return { error: 'รูปแบบไฟล์ต้นฉบับไม่รองรับหรือมีข้อมูลมากเกินไป' }
  }

  return {
    inspection: {
      previewSize: previewCheck.size,
      sceneSize,
      elementCount,
    },
  }
}

async function removeStoredWork(admin: AdminClient, paths: Array<string | null | undefined>) {
  const uniquePaths = Array.from(new Set(paths.filter((path): path is string => !!path)))
  if (uniquePaths.length > 0) await admin.storage.from(MATH_WORK_BUCKET).remove(uniquePaths)
}

async function signStoredPaths(admin: AdminClient, paths: string[]) {
  if (paths.length === 0) return new Map<string, string>()
  const { data, error } = await admin.storage
    .from(MATH_WORK_BUCKET)
    .createSignedUrls(Array.from(new Set(paths)), SIGNED_READ_SECONDS)
  if (error) return null
  return new Map((data ?? []).flatMap(row => row.signedUrl ? [[row.path, row.signedUrl] as const] : []))
}

export async function prepareStudentWorkArtifactUpload(input: {
  submissionAnswerId: string
  partKey: string
  sourceType: string
  includeScene: boolean
  formatVersion: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!isUuid(input.submissionAnswerId)) return { error: 'คำตอบไม่ถูกต้อง' }
  if (!isWorkPartKey(input.partKey)) return { error: 'ตำแหน่งวิธีทำไม่ถูกต้อง' }
  if (!isWorkArtifactSource(input.sourceType)) return { error: 'ประเภทวิธีทำไม่ถูกต้อง' }
  if (!isSupportedWorkFormatVersion(input.formatVersion)) return { error: 'เวอร์ชันพื้นที่เขียนไม่รองรับ' }
  if (input.sourceType === 'scratchpad' && !input.includeScene) {
    return { error: 'กระดาษทดต้องมีไฟล์ต้นฉบับเพื่อกลับมาแก้ไข' }
  }

  const admin = createAdminClient()
  const writable = await loadWritableStudentArtifactContext(
    admin,
    input.submissionAnswerId,
    user.id,
    input.sourceType,
  )
  if ('error' in writable) return writable
  if (!isAllowedPartKey(input.partKey, writable.context.questionType, writable.context.answerParts)) {
    return { error: 'ตำแหน่งวิธีทำไม่ตรงกับช่องคำตอบ' }
  }

  const uploadId = crypto.randomUUID()
  const paths = buildStudentWorkUploadPaths({
    studentId: user.id,
    submissionId: writable.context.submissionId,
    submissionAnswerId: writable.context.answerId,
    uploadId,
    includeScene: input.includeScene,
  })
  const targets = await createSignedUploadTargets(admin, paths)
  if ('error' in targets) return targets

  return {
    success: true as const,
    uploadId,
    expiresInSeconds: 2 * 60 * 60,
    ...targets,
  }
}

export async function saveStudentWorkArtifact(input: {
  submissionAnswerId: string
  partKey: string
  sourceType: string
  uploadId: string
  includeScene: boolean
  formatVersion: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!isUuid(input.submissionAnswerId) || !isUuid(input.uploadId)) return { error: 'ไฟล์วิธีทำไม่ถูกต้อง' }
  if (!isWorkPartKey(input.partKey)) return { error: 'ตำแหน่งวิธีทำไม่ถูกต้อง' }
  if (!isWorkArtifactSource(input.sourceType)) return { error: 'ประเภทวิธีทำไม่ถูกต้อง' }
  if (!isSupportedWorkFormatVersion(input.formatVersion)) return { error: 'เวอร์ชันพื้นที่เขียนไม่รองรับ' }
  if (input.sourceType === 'scratchpad' && !input.includeScene) {
    return { error: 'กระดาษทดต้องมีไฟล์ต้นฉบับเพื่อกลับมาแก้ไข' }
  }

  const admin = createAdminClient()
  const writable = await loadWritableStudentArtifactContext(
    admin,
    input.submissionAnswerId,
    user.id,
    input.sourceType,
  )
  if ('error' in writable) return writable
  if (!isAllowedPartKey(input.partKey, writable.context.questionType, writable.context.answerParts)) {
    return { error: 'ตำแหน่งวิธีทำไม่ตรงกับช่องคำตอบ' }
  }

  const paths = buildStudentWorkUploadPaths({
    studentId: user.id,
    submissionId: writable.context.submissionId,
    submissionAnswerId: writable.context.answerId,
    uploadId: input.uploadId,
    includeScene: input.includeScene,
  })
  const inspected = await inspectStoredWork(admin, paths)
  if ('error' in inspected) {
    await removeStoredWork(admin, [paths.previewPath, paths.scenePath])
    return inspected
  }

  const { data: previous } = await supabase
    .from('student_work_artifacts')
    .select('preview_path, scene_path')
    .eq('submission_answer_id', writable.context.answerId)
    .eq('part_key', input.partKey)
    .maybeSingle()

  const { data: artifact, error } = await supabase
    .from('student_work_artifacts')
    .upsert({
      org_id: writable.context.orgId,
      submission_answer_id: writable.context.answerId,
      student_id: user.id,
      part_key: input.partKey,
      source_type: input.sourceType,
      preview_path: paths.previewPath,
      scene_path: paths.scenePath,
      format_version: input.formatVersion,
      preview_size_bytes: inspected.inspection.previewSize,
      scene_size_bytes: inspected.inspection.sceneSize,
      element_count: inspected.inspection.elementCount,
    }, { onConflict: 'submission_answer_id,part_key' })
    .select('id, part_key, source_type, format_version, created_at, updated_at')
    .single()

  if (error || !artifact) {
    await removeStoredWork(admin, [paths.previewPath, paths.scenePath])
    return { error: 'บันทึกวิธีทำไม่สำเร็จ กรุณาลองใหม่' }
  }

  await removeStoredWork(admin, [previous?.preview_path, previous?.scene_path].filter(path => (
    path !== paths.previewPath && path !== paths.scenePath
  )))
  return { success: true as const, artifact }
}

export async function getStudentWorkArtifacts(submissionAnswerId: string) {
  if (!isUuid(submissionAnswerId)) return { error: 'คำตอบไม่ถูกต้อง' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: rows, error } = await supabase
    .from('student_work_artifacts')
    .select('id, part_key, source_type, preview_path, scene_path, format_version, student_id, created_at, updated_at')
    .eq('submission_answer_id', submissionAnswerId)
    .order('part_key')
  if (error) return { error: 'เปิดวิธีทำไม่สำเร็จ กรุณาลองใหม่' }

  const admin = createAdminClient()
  const paths = (rows ?? []).flatMap(row => [row.preview_path, row.scene_path].filter((path): path is string => !!path))
  const signed = await signStoredPaths(admin, paths)
  if (!signed) return { error: 'สร้างลิงก์เปิดวิธีทำไม่สำเร็จ กรุณาลองใหม่' }

  return {
    success: true as const,
    expiresInSeconds: SIGNED_READ_SECONDS,
    artifacts: (rows ?? []).map(row => ({
      id: row.id,
      submissionAnswerId,
      partKey: row.part_key,
      sourceType: row.source_type,
      formatVersion: row.format_version,
      studentId: row.student_id,
      previewUrl: signed.get(row.preview_path) ?? null,
      sceneUrl: row.scene_path ? (signed.get(row.scene_path) ?? null) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  }
}

export async function deleteStudentWorkArtifact(artifactId: string) {
  if (!isUuid(artifactId)) return { error: 'วิธีทำไม่ถูกต้อง' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: artifact } = await supabase
    .from('student_work_artifacts')
    .select('id, student_id, preview_path, scene_path')
    .eq('id', artifactId)
    .maybeSingle()
  if (!artifact || artifact.student_id !== user.id) return { error: 'ไม่พบวิธีทำหรือไม่มีสิทธิ์ลบ' }

  const { data: deleted, error } = await supabase
    .from('student_work_artifacts')
    .delete()
    .eq('id', artifactId)
    .eq('student_id', user.id)
    .select('id')
    .maybeSingle()
  if (error || !deleted) return { error: 'ลบวิธีทำไม่สำเร็จ กรุณาลองใหม่' }

  await removeStoredWork(createAdminClient(), [artifact.preview_path, artifact.scene_path])
  return { success: true as const }
}

export async function prepareTeachingBoardUpload(input: {
  assignmentId: string
  questionId: string
  slot: number
  formatVersion: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!isUuid(input.assignmentId) || !isUuid(input.questionId)) return { error: 'งานหรือโจทย์ไม่ถูกต้อง' }
  if (!Number.isInteger(input.slot) || input.slot < 1 || input.slot > 5) return { error: 'ช่องบันทึกต้องอยู่ระหว่าง 1–5' }
  if (!isSupportedWorkFormatVersion(input.formatVersion)) return { error: 'เวอร์ชันพื้นที่เขียนไม่รองรับ' }

  const managed = await loadManagedTeachingBoardContext(supabase, input.assignmentId, input.questionId)
  if ('error' in managed) return managed

  const uploadId = crypto.randomUUID()
  const paths = buildTeachingBoardUploadPaths({
    teacherId: user.id,
    assignmentId: input.assignmentId,
    questionId: input.questionId,
    slot: input.slot,
    uploadId,
  })
  const targets = await createSignedUploadTargets(createAdminClient(), paths)
  if ('error' in targets) return targets
  return {
    success: true as const,
    uploadId,
    expiresInSeconds: 2 * 60 * 60,
    ...targets,
  }
}

export async function saveTeachingBoard(input: {
  assignmentId: string
  questionId: string
  slot: number
  uploadId: string
  formatVersion: number
  replaceExisting: boolean
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!isUuid(input.assignmentId) || !isUuid(input.questionId) || !isUuid(input.uploadId)) {
    return { error: 'กระดานสอนไม่ถูกต้อง' }
  }
  if (!Number.isInteger(input.slot) || input.slot < 1 || input.slot > 5) return { error: 'ช่องบันทึกต้องอยู่ระหว่าง 1–5' }
  if (!isSupportedWorkFormatVersion(input.formatVersion)) return { error: 'เวอร์ชันพื้นที่เขียนไม่รองรับ' }

  const managed = await loadManagedTeachingBoardContext(supabase, input.assignmentId, input.questionId)
  if ('error' in managed) return managed

  const paths = buildTeachingBoardUploadPaths({
    teacherId: user.id,
    assignmentId: input.assignmentId,
    questionId: input.questionId,
    slot: input.slot,
    uploadId: input.uploadId,
  })
  const admin = createAdminClient()
  const inspected = await inspectStoredWork(admin, paths)
  if ('error' in inspected || inspected.inspection.sceneSize === null || inspected.inspection.elementCount === null) {
    await removeStoredWork(admin, [paths.previewPath, paths.scenePath])
    return 'error' in inspected ? inspected : { error: 'กระดานสอนต้องมีไฟล์ต้นฉบับ' }
  }

  const { data: previous } = await supabase
    .from('teaching_boards')
    .select('id, preview_path, scene_path')
    .eq('assignment_id', input.assignmentId)
    .eq('question_id', input.questionId)
    .eq('created_by', user.id)
    .eq('slot', input.slot)
    .maybeSingle()

  if (previous && !input.replaceExisting) {
    await removeStoredWork(admin, [paths.previewPath, paths.scenePath])
    return { error: `ช่องที่ ${input.slot} มีภาพอยู่แล้ว กรุณายืนยันการแทนที่` }
  }

  const { data: board, error } = await supabase
    .from('teaching_boards')
    .upsert({
      org_id: managed.orgId,
      assignment_id: input.assignmentId,
      question_id: input.questionId,
      created_by: user.id,
      slot: input.slot,
      preview_path: paths.previewPath,
      scene_path: paths.scenePath,
      format_version: input.formatVersion,
      preview_size_bytes: inspected.inspection.previewSize,
      scene_size_bytes: inspected.inspection.sceneSize,
      element_count: inspected.inspection.elementCount,
    }, { onConflict: 'assignment_id,question_id,created_by,slot' })
    .select('id, slot, format_version, created_at, updated_at')
    .single()

  if (error || !board) {
    await removeStoredWork(admin, [paths.previewPath, paths.scenePath])
    return { error: 'บันทึกกระดานสอนไม่สำเร็จ กรุณาลองใหม่' }
  }

  await removeStoredWork(admin, [previous?.preview_path, previous?.scene_path].filter(path => (
    path !== paths.previewPath && path !== paths.scenePath
  )))
  revalidatePath(`/assignments/${input.assignmentId}/teach`)
  return { success: true as const, board }
}

export async function getTeachingBoards(assignmentId: string, questionId: string) {
  if (!isUuid(assignmentId) || !isUuid(questionId)) return { error: 'งานหรือโจทย์ไม่ถูกต้อง' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const [{ data: rows, error }, { data: canManage }] = await Promise.all([
    supabase
      .from('teaching_boards')
      .select('id, slot, created_by, preview_path, scene_path, format_version, created_at, updated_at')
      .eq('assignment_id', assignmentId)
      .eq('question_id', questionId)
      .order('created_by')
      .order('slot'),
    supabase.rpc('can_manage_math_tools_assignment', { p_assignment_id: assignmentId }),
  ])
  if (error) return { error: 'เปิดกระดานสอนไม่สำเร็จ กรุณาลองใหม่' }

  const paths = (rows ?? []).flatMap(row => [row.preview_path, row.scene_path])
  const signed = await signStoredPaths(createAdminClient(), paths)
  if (!signed) return { error: 'สร้างลิงก์เปิดกระดานสอนไม่สำเร็จ กรุณาลองใหม่' }

  return {
    success: true as const,
    expiresInSeconds: SIGNED_READ_SECONDS,
    boards: (rows ?? []).map(row => ({
      id: row.id,
      slot: row.slot,
      createdBy: row.created_by,
      editable: canManage === true && row.created_by === user.id,
      formatVersion: row.format_version,
      previewUrl: signed.get(row.preview_path) ?? null,
      sceneUrl: signed.get(row.scene_path) ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  }
}

export async function deleteTeachingBoard(boardId: string) {
  if (!isUuid(boardId)) return { error: 'กระดานสอนไม่ถูกต้อง' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: board } = await supabase
    .from('teaching_boards')
    .select('id, assignment_id, created_by, preview_path, scene_path')
    .eq('id', boardId)
    .eq('created_by', user.id)
    .maybeSingle()
  if (!board) return { error: 'ไม่พบกระดานสอนหรือคุณไม่ใช่ผู้สร้าง' }

  const { data: deleted, error } = await supabase
    .from('teaching_boards')
    .delete()
    .eq('id', boardId)
    .eq('created_by', user.id)
    .select('id')
    .maybeSingle()
  if (error || !deleted) return { error: 'ลบกระดานสอนไม่สำเร็จ กรุณาลองใหม่' }

  await removeStoredWork(createAdminClient(), [board.preview_path, board.scene_path])
  revalidatePath(`/assignments/${board.assignment_id}/teach`)
  return { success: true as const }
}
