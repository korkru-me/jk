'use server'

import { revalidatePath } from 'next/cache'
import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getExamAccessSession } from '@/lib/exam-access-session'
import {
  buildStudentWorkUploadPaths,
  buildTeachingBoardUploadPaths,
  hasPreviewSignature,
  isSupportedWorkFormatVersion,
  isTeachingBoardSlot,
  isUuid,
  isWorkArtifactSource,
  isWorkPartKey,
  isWorkPreviewFormat,
  MATH_WORK_BUCKET,
  MAX_WORK_SCENE_BYTES,
  TEACHING_BOARD_SLOT_COUNT,
  validateStoredWorkFile,
  type WorkArtifactSource,
  type WorkPreviewFormat,
  type WorkUploadPaths,
} from '@/lib/math-work'
import {
  createLegacyTeacherImageSnapshot,
  validateDrawingScene,
  type DrawingSceneValidationResult,
  type LegacyTeacherImageSnapshot,
} from '@/lib/drawing-board-policy'
import { duplicateDrawingScene } from '@/lib/drawing-board-duplicate'
import {
  QUESTION_IMAGE_CLAIM_KIND,
  QUESTION_IMAGE_CLAIM_VERSION,
} from '@/lib/drawing-board-image-claim'
import {
  sha256Hex,
  signQuestionImageClaim,
  verifyQuestionImageClaim,
} from '@/lib/drawing-board-image-claim.server'
import {
  signWorkUploadReceipt,
  verifyWorkUploadReceipt,
} from '@/lib/math-work-upload-receipt.server'
import {
  isSafeDrawingBoardSvg,
} from '@/lib/drawing-board-svg.server'
import { upgradeLegacyTeacherScene } from '@/lib/drawing-board-legacy.server'
import type { ScratchpadScene } from '@/lib/scratchpad'

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

type SceneValidator = (value: unknown) => DrawingSceneValidationResult

const QUESTION_IMAGE_BUCKET = 'question-images'
const MAX_QUESTION_IMAGE_INPUT_BYTES = 10 * 1024 * 1024
const MAX_TRUSTED_QUESTION_IMAGE_BYTES = 1_200_000
// A claim is provenance, not authorization; authorization is checked again on
// every save. Keep it long enough for a full teaching day while still forcing
// an unsaved image to be re-issued if a tab is abandoned overnight.
const QUESTION_IMAGE_CLAIM_LIFETIME_MS = 24 * 60 * 60 * 1_000

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

async function createSignedPreviewTarget(
  admin: AdminClient,
  paths: WorkUploadPaths,
): Promise<{
  preview: { path: string; token: string }
} | { error: string }> {
  const bucket = admin.storage.from(MATH_WORK_BUCKET)
  const preview = await bucket.createSignedUploadUrl(paths.previewPath)

  if (preview.error) {
    return { error: 'เตรียมพื้นที่อัปโหลดไม่สำเร็จ กรุณาลองใหม่' }
  }

  return {
    preview: { path: paths.previewPath, token: preview.data.token },
  }
}

async function storeValidatedScene(
  admin: AdminClient,
  path: string,
  scene: ScratchpadScene,
): Promise<{ size: number } | { error: string }> {
  const json = JSON.stringify(scene)
  const size = new TextEncoder().encode(json).byteLength
  const { error } = await admin.storage.from(MATH_WORK_BUCKET).upload(
    path,
    new Blob([json], { type: 'application/json' }),
    { contentType: 'application/json', cacheControl: '300', upsert: false },
  )
  return error ? { error: 'เก็บไฟล์ต้นฉบับที่ตรวจแล้วไม่สำเร็จ กรุณาลองใหม่' } : { size }
}

async function loadStoredScene(admin: AdminClient, path: string | null | undefined): Promise<unknown | null> {
  if (!path) return null
  const downloaded = await admin.storage.from(MATH_WORK_BUCKET).download(path)
  if (downloaded.error) return null
  try {
    return JSON.parse(await downloaded.data.text()) as unknown
  } catch {
    return null
  }
}

async function inspectStoredWork(
  admin: AdminClient,
  paths: WorkUploadPaths,
  previewFormat: WorkPreviewFormat,
  validateScene?: SceneValidator,
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
    previewFormat,
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
  if (!hasPreviewSignature(previewHeader, previewFormat)) {
    return { error: 'ไฟล์ตัวอย่างไม่ตรงกับชนิดภาพที่แจ้งไว้' }
  }

  let elementCount: number | null = null
  if (sceneDownload) {
    try {
      const scene = JSON.parse(await sceneDownload.data.text()) as unknown
      const validated = validateScene?.(scene)
        ?? validateDrawingScene(scene, { role: 'student' })
      if (!validated.ok) return { error: 'รูปแบบไฟล์ต้นฉบับไม่รองรับหรือมีข้อมูลต้องห้าม' }
      elementCount = validated.scene.elements.length
    } catch {
      return { error: 'ไฟล์ต้นฉบับเปิดอ่านไม่ได้' }
    }
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

/** Fail closed: never remove a path while either reference table still owns it. */
async function removeUnreferencedStoredWork(
  admin: AdminClient,
  paths: Array<string | null | undefined>,
) {
  const candidates = Array.from(new Set(paths.filter((path): path is string => !!path)))
  if (candidates.length === 0) return
  const results = await Promise.all([
    admin.from('student_work_artifacts').select('preview_path, scene_path').in('preview_path', candidates),
    admin.from('student_work_artifacts').select('preview_path, scene_path').in('scene_path', candidates),
    admin.from('teaching_boards').select('preview_path, scene_path').in('preview_path', candidates),
    admin.from('teaching_boards').select('preview_path, scene_path').in('scene_path', candidates),
  ])
  if (results.some(result => result.error)) return
  const referenced = new Set<string>()
  for (const result of results) {
    for (const row of result.data ?? []) {
      if (row.preview_path) referenced.add(row.preview_path)
      if (row.scene_path) referenced.add(row.scene_path)
    }
  }
  await removeStoredWork(admin, candidates.filter(path => !referenced.has(path)))
}

function uploadReceiptSecret(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  return secret && secret.length >= 20 ? secret : null
}

async function signStoredPaths(admin: AdminClient, paths: string[]) {
  if (paths.length === 0) return new Map<string, string>()
  const { data, error } = await admin.storage
    .from(MATH_WORK_BUCKET)
    .createSignedUrls(Array.from(new Set(paths)), SIGNED_READ_SECONDS)
  if (error) return null
  return new Map((data ?? []).flatMap(row => row.signedUrl ? [[row.path, row.signedUrl] as const] : []))
}

function previousTeacherImages(value: unknown): LegacyTeacherImageSnapshot | null {
  if (value === null) return null
  const validated = validateDrawingScene(value, {
    role: 'teacher',
    verifyTeacherImage: () => 'valid',
    allowUnsignedTeacherImages: true,
  })
  return validated.ok ? createLegacyTeacherImageSnapshot(validated.scene) : null
}

function teacherSceneValidator(input: {
  actorId: string
  assignmentId: string
  questionId: string
  previousScene: unknown | null
}): SceneValidator {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const legacyTeacherImages = previousTeacherImages(input.previousScene)
  return value => validateDrawingScene(value, {
    role: 'teacher',
    legacyTeacherImages,
    verifyTeacherImage: ({ fileId, mimeType, bytes, claim }) => verifyQuestionImageClaim(
      claim,
      {
        actorId: input.actorId,
        assignmentId: input.assignmentId,
        questionId: input.questionId,
        fileId,
        mimeType,
        dataSha256: sha256Hex(bytes),
      },
      secret,
    ),
  })
}

function questionImageStoragePath(sourceUrl: string): string | null {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!configured) return null
  try {
    const source = new URL(sourceUrl)
    const origin = new URL(configured)
    const prefix = `/storage/v1/object/public/${QUESTION_IMAGE_BUCKET}/`
    if (
      source.origin !== origin.origin
      || source.username
      || source.password
      || source.search
      || source.hash
      || !source.pathname.startsWith(prefix)
    ) return null
    const path = decodeURIComponent(source.pathname.slice(prefix.length))
    if (!path || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..')) {
      return null
    }
    return path
  } catch {
    return null
  }
}

async function rasterizeQuestionImage(sourceBytes: Uint8Array) {
  const image = sharp(sourceBytes, { animated: false, limitInputPixels: 40_000_000 })
  const metadata = await image.metadata()
  if (!metadata.format || !['jpeg', 'png', 'webp', 'gif', 'svg'].includes(metadata.format)) return null
  if (metadata.format === 'svg' && !isSafeDrawingBoardSvg(sourceBytes)) return null
  const rendered = await image
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })
  if (
    rendered.data.byteLength < 1
    || rendered.data.byteLength > MAX_TRUSTED_QUESTION_IMAGE_BYTES
    || !rendered.info.width
    || !rendered.info.height
  ) return null
  return rendered
}

export async function prepareTeachingQuestionImage(input: {
  assignmentId: string
  questionId: string
  sourceUrl: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const claimSecret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!claimSecret || claimSecret.length < 20) return { error: 'ระบบตรวจสอบรูปโจทย์ยังไม่พร้อมใช้งาน' }
  if (!isUuid(input.assignmentId) || !isUuid(input.questionId)) return { error: 'งานหรือโจทย์ไม่ถูกต้อง' }
  if (typeof input.sourceUrl !== 'string' || input.sourceUrl.length > 4_000) return { error: 'ที่อยู่รูปโจทย์ไม่ถูกต้อง' }

  const managed = await loadManagedTeachingBoardContext(supabase, input.assignmentId, input.questionId)
  if ('error' in managed) return managed
  const { data: question, error: questionError } = await supabase
    .from('questions')
    .select('id, image_urls')
    .eq('id', input.questionId)
    .maybeSingle()
  if (questionError || !question) return { error: 'เปิดข้อมูลรูปโจทย์ไม่สำเร็จ' }
  const imageUrls = Array.isArray(question.image_urls) ? question.image_urls : []
  if (!imageUrls.includes(input.sourceUrl)) return { error: 'รูปนี้ไม่ได้อยู่ในโจทย์ปัจจุบัน' }

  const sourcePath = questionImageStoragePath(input.sourceUrl)
  if (!sourcePath) return { error: 'รูปโจทย์ต้องมาจากพื้นที่เก็บไฟล์ของระบบ' }
  const admin = createAdminClient()
  const downloaded = await admin.storage.from(QUESTION_IMAGE_BUCKET).download(sourcePath)
  if (downloaded.error) return { error: 'โหลดรูปจากโจทย์ไม่สำเร็จ' }
  if (downloaded.data.size < 1 || downloaded.data.size > MAX_QUESTION_IMAGE_INPUT_BYTES) {
    return { error: 'รูปโจทย์มีขนาดไม่ถูกต้องหรือเกิน 10 MB' }
  }

  const sourceBytes = new Uint8Array(await downloaded.data.arrayBuffer())
  try {
    const rendered = await rasterizeQuestionImage(sourceBytes)
    if (!rendered) return { error: 'รองรับรูปโจทย์เฉพาะ SVG, JPG, PNG, GIF และ WebP ที่ปลอดภัย' }

    const now = Date.now()
    const fileId = crypto.randomUUID()
    const mimeType = 'image/webp'
    const dataSha256 = sha256Hex(rendered.data)
    const claim = signQuestionImageClaim({
      version: QUESTION_IMAGE_CLAIM_VERSION,
      kind: QUESTION_IMAGE_CLAIM_KIND,
      actorId: user.id,
      assignmentId: input.assignmentId,
      questionId: input.questionId,
      sourcePath,
      sourceSha256: sha256Hex(sourceBytes),
      fileId,
      mimeType,
      dataSha256,
      issuedAt: now,
      expiresAt: now + QUESTION_IMAGE_CLAIM_LIFETIME_MS,
    }, claimSecret)

    return {
      success: true as const,
      width: rendered.info.width,
      height: rendered.info.height,
      file: {
        id: fileId,
        dataURL: `data:${mimeType};base64,${rendered.data.toString('base64')}`,
        mimeType,
        created: now,
        korkruQuestionImage: { version: QUESTION_IMAGE_CLAIM_VERSION, claim },
      },
    }
  } catch {
    return { error: 'รูปประกอบโจทย์นี้เปิดไม่ได้' }
  }
}

/**
 * Verifies a teacher scene and creates a detached next-step draft in memory.
 * Image provenance is re-issued because each trusted claim is cryptographically
 * bound to its file id; this action does not upload or persist anything.
 */
export async function duplicateTeachingBoardScene(input: {
  assignmentId: string
  questionId: string
  sourceBoardId?: string | null
  scene: unknown
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!isUuid(input.assignmentId) || !isUuid(input.questionId)) return { error: 'งานหรือโจทย์ไม่ถูกต้อง' }
  const managed = await loadManagedTeachingBoardContext(supabase, input.assignmentId, input.questionId)
  if ('error' in managed) return managed
  const claimSecret = uploadReceiptSecret()
  if (!claimSecret) return { error: 'ระบบตรวจสอบรูปโจทย์ยังไม่พร้อมใช้งาน' }

  let legacyTeacherImages: LegacyTeacherImageSnapshot | null = null
  if (input.sourceBoardId) {
    if (!isUuid(input.sourceBoardId)) return { error: 'กระดานต้นฉบับไม่ถูกต้อง' }
    const { data: sourceBoard, error: sourceBoardError } = await supabase
      .from('teaching_boards')
      .select('id, assignment_id, question_id, created_by, scene_path')
      .eq('id', input.sourceBoardId)
      .eq('assignment_id', input.assignmentId)
      .eq('question_id', input.questionId)
      .eq('created_by', user.id)
      .maybeSingle()
    if (sourceBoardError || !sourceBoard) return { error: 'ไม่พบกระดานต้นฉบับหรือไม่มีสิทธิ์ทำสำเนา' }
    const storedSource = await loadStoredScene(createAdminClient(), sourceBoard.scene_path)
    if (!storedSource) return { error: 'เปิดกระดานต้นฉบับเพื่อทำสำเนาไม่สำเร็จ' }
    legacyTeacherImages = previousTeacherImages(storedSource)
  }

  const verifiedFiles = new Map<string, { mimeType: string; bytes: Uint8Array }>()
  const validated = validateDrawingScene(input.scene, {
    role: 'teacher',
    legacyTeacherImages,
    verifyTeacherImage: ({ fileId, mimeType, bytes, claim }) => {
      verifiedFiles.set(fileId, { mimeType, bytes })
      const trust = verifyQuestionImageClaim(claim, {
        actorId: user.id,
        assignmentId: input.assignmentId,
        questionId: input.questionId,
        fileId,
        mimeType,
        dataSha256: sha256Hex(bytes),
      }, claimSecret)
      if (trust === 'valid' || trust === 'expired-authentic') {
        // Authentic expired claims can be re-issued after fresh authorization.
        return 'valid'
      }
      return 'invalid'
    },
  })
  if (!validated.ok) return { error: 'กระดานมีข้อมูลที่ไม่รองรับหรือรูปโจทย์ไม่ผ่านการตรวจสอบ' }

  const now = Date.now()
  const duplicated = duplicateDrawingScene(validated.scene, () => crypto.randomUUID(), now)
  const files: Record<string, unknown> = {}
  for (const [oldFileId, newFileId] of duplicated.fileIdMap) {
    const original = verifiedFiles.get(oldFileId)
    const value = duplicated.scene.files[newFileId]
    if (!original || !value || typeof value !== 'object' || Array.isArray(value)) {
      return { error: 'ทำสำเนารูปในกระดานไม่สำเร็จ' }
    }
    const dataSha256 = sha256Hex(original.bytes)
    const claim = signQuestionImageClaim({
      version: QUESTION_IMAGE_CLAIM_VERSION,
      kind: QUESTION_IMAGE_CLAIM_KIND,
      actorId: user.id,
      assignmentId: input.assignmentId,
      questionId: input.questionId,
      sourcePath: `duplicate-board/${oldFileId}`,
      sourceSha256: dataSha256,
      fileId: newFileId,
      mimeType: original.mimeType,
      dataSha256,
      issuedAt: now,
      expiresAt: now + QUESTION_IMAGE_CLAIM_LIFETIME_MS,
    }, claimSecret)
    files[newFileId] = {
      ...value,
      korkruQuestionImage: { version: QUESTION_IMAGE_CLAIM_VERSION, claim },
    }
  }
  const scene = { ...duplicated.scene, files }
  const final = validateDrawingScene(scene, {
    role: 'teacher',
    verifyTeacherImage: ({ fileId, mimeType, bytes, claim }) => verifyQuestionImageClaim(
      claim,
      {
        actorId: user.id,
        assignmentId: input.assignmentId,
        questionId: input.questionId,
        fileId,
        mimeType,
        dataSha256: sha256Hex(bytes),
      },
      claimSecret,
      now,
    ),
  })
  return final.ok
    ? { success: true as const, scene: final.scene }
    : { error: 'ทำสำเนากระดานไม่สำเร็จ' }
}

/**
 * Loads a board through the server boundary so legacy SVG files can be
 * rasterized before any raw scene reaches Excalidraw or the browser DOM.
 * The converted scene stays in memory until the owner explicitly saves it.
 */
export async function getTeachingBoardScene(boardId: string) {
  if (!isUuid(boardId)) return { error: 'กระดานสอนไม่ถูกต้อง' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const { data: board, error } = await supabase
    .from('teaching_boards')
    .select('id, assignment_id, question_id, created_by, scene_path')
    .eq('id', boardId)
    .maybeSingle()
  if (error || !board) return { error: 'ไม่พบกระดานสอนหรือไม่มีสิทธิ์เปิด' }

  const downloaded = await createAdminClient().storage.from(MATH_WORK_BUCKET).download(board.scene_path)
  if (downloaded.error || downloaded.data.size < 1 || downloaded.data.size > MAX_WORK_SCENE_BYTES) {
    return { error: 'ไฟล์ต้นฉบับของกระดานมีขนาดไม่ถูกต้อง' }
  }
  let raw: unknown
  try {
    raw = JSON.parse(await downloaded.data.text()) as unknown
  } catch {
    return { error: 'ไฟล์ต้นฉบับของกระดานเปิดอ่านไม่ได้' }
  }

  const existing = validateDrawingScene(raw, {
    role: 'teacher',
    verifyTeacherImage: () => 'valid',
    allowUnsignedTeacherImages: true,
  })
  if (existing.ok) return { success: true as const, scene: existing.scene, legacySvgRasterized: false }
  if (
    existing.code !== 'invalid-image-file'
    || !raw
    || typeof raw !== 'object'
    || Array.isArray(raw)
  ) return { error: 'รูปแบบกระดานสอนไม่รองรับ' }

  const receiptSecret = uploadReceiptSecret()
  if (!receiptSecret) return { error: 'ระบบแปลงรูปเดิมยังไม่พร้อมใช้งาน' }
  const upgraded = await upgradeLegacyTeacherScene({
    value: raw,
    context: {
      boardId: board.id,
      actorId: board.created_by,
      assignmentId: board.assignment_id,
      questionId: board.question_id,
    },
    secret: receiptSecret,
    rasterizeSvg: async bytes => (await rasterizeQuestionImage(bytes))?.data ?? null,
  })
  if (!upgraded.ok) {
    if (upgraded.reason === 'unsafe-svg') {
      return { error: 'รูป SVG เดิมในกระดานมีข้อมูลที่ไม่ปลอดภัย จึงเปิดแบบแก้ไขไม่ได้' }
    }
    if (upgraded.reason === 'rasterize-failed') {
      return { error: 'แปลงรูป SVG เดิมในกระดานไม่สำเร็จ' }
    }
    return { error: 'กระดานเดิมมีข้อมูลอื่นที่เวอร์ชันปัจจุบันยังไม่รองรับ' }
  }
  return { success: true as const, scene: upgraded.scene, legacySvgRasterized: true }
}

export async function prepareStudentWorkArtifactUpload(input: {
  submissionAnswerId: string
  partKey: string
  sourceType: string
  includeScene: boolean
  formatVersion: number
  previewFormat: string
  scene?: unknown
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!isUuid(input.submissionAnswerId)) return { error: 'คำตอบไม่ถูกต้อง' }
  if (!isWorkPartKey(input.partKey)) return { error: 'ตำแหน่งวิธีทำไม่ถูกต้อง' }
  if (!isWorkArtifactSource(input.sourceType)) return { error: 'ประเภทวิธีทำไม่ถูกต้อง' }
  if (!isSupportedWorkFormatVersion(input.formatVersion)) return { error: 'เวอร์ชันพื้นที่เขียนไม่รองรับ' }
  if (!isWorkPreviewFormat(input.previewFormat)) return { error: 'ชนิดภาพตัวอย่างไม่รองรับ' }
  if (input.includeScene !== (input.sourceType === 'scratchpad')) {
    return { error: input.sourceType === 'scratchpad'
      ? 'กระดาษทดต้องมีไฟล์ต้นฉบับเพื่อกลับมาแก้ไข'
      : 'รูปถ่ายต้องไม่มีไฟล์ scene' }
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

  const validatedScene = input.includeScene
    ? validateDrawingScene(input.scene, { role: 'student' })
    : null
  if (validatedScene && !validatedScene.ok) {
    return { error: 'กระดาษทดมีข้อมูลที่ไม่รองรับหรือมีข้อมูลต้องห้าม' }
  }
  if (!input.includeScene && input.scene !== undefined) return { error: 'รูปถ่ายต้องไม่มีไฟล์ scene' }
  const receiptSecret = uploadReceiptSecret()
  if (!receiptSecret) return { error: 'ระบบยืนยันการอัปโหลดยังไม่พร้อมใช้งาน' }

  const uploadId = crypto.randomUUID()
  const paths = buildStudentWorkUploadPaths({
    studentId: user.id,
    submissionId: writable.context.submissionId,
    submissionAnswerId: writable.context.answerId,
    uploadId,
    includeScene: input.includeScene,
    previewFormat: input.previewFormat,
  })
  if (paths.scenePath && validatedScene?.ok) {
    const stored = await storeValidatedScene(admin, paths.scenePath, validatedScene.scene)
    if ('error' in stored) return stored
  }
  const targets = await createSignedPreviewTarget(admin, paths)
  if ('error' in targets) await removeStoredWork(admin, [paths.scenePath])
  if ('error' in targets) return targets

  return {
    success: true as const,
    uploadId,
    uploadReceipt: signWorkUploadReceipt({
      target: 'student',
      actorId: user.id,
      submissionAnswerId: writable.context.answerId,
      partKey: input.partKey,
      sourceType: input.sourceType,
      includeScene: input.includeScene,
      uploadId,
      previewFormat: input.previewFormat,
    }, receiptSecret),
    expiresInSeconds: 2 * 60 * 60,
    sceneStored: Boolean(paths.scenePath),
    ...targets,
  }
}

export async function saveStudentWorkArtifact(input: {
  submissionAnswerId: string
  partKey: string
  sourceType: string
  uploadId: string
  uploadReceipt: string
  includeScene: boolean
  formatVersion: number
  previewFormat: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!isUuid(input.submissionAnswerId) || !isUuid(input.uploadId)) return { error: 'ไฟล์วิธีทำไม่ถูกต้อง' }
  if (!isWorkPartKey(input.partKey)) return { error: 'ตำแหน่งวิธีทำไม่ถูกต้อง' }
  if (!isWorkArtifactSource(input.sourceType)) return { error: 'ประเภทวิธีทำไม่ถูกต้อง' }
  if (!isSupportedWorkFormatVersion(input.formatVersion)) return { error: 'เวอร์ชันพื้นที่เขียนไม่รองรับ' }
  if (!isWorkPreviewFormat(input.previewFormat)) return { error: 'ชนิดภาพตัวอย่างไม่รองรับ' }
  if (input.includeScene !== (input.sourceType === 'scratchpad')) {
    return { error: input.sourceType === 'scratchpad'
      ? 'กระดาษทดต้องมีไฟล์ต้นฉบับเพื่อกลับมาแก้ไข'
      : 'รูปถ่ายต้องไม่มีไฟล์ scene' }
  }
  const receiptSecret = uploadReceiptSecret()
  if (
    !receiptSecret
    || typeof input.uploadReceipt !== 'string'
    || !verifyWorkUploadReceipt(input.uploadReceipt, {
      target: 'student',
      actorId: user.id,
      submissionAnswerId: input.submissionAnswerId,
      partKey: input.partKey,
      sourceType: input.sourceType,
      includeScene: input.includeScene,
      uploadId: input.uploadId,
      previewFormat: input.previewFormat,
    }, receiptSecret)
  ) return { error: 'สิทธิ์อัปโหลดหมดอายุหรือไม่ตรงกับวิธีทำนี้ กรุณาเริ่มแนบใหม่' }

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
    previewFormat: input.previewFormat,
  })
  const inspected = await inspectStoredWork(
    admin,
    paths,
    input.previewFormat,
    input.includeScene ? value => validateDrawingScene(value, { role: 'student' }) : undefined,
  )
  if ('error' in inspected) {
    // Keep failed candidates for the bounded orphan cleanup. Deleting here can
    // race an idempotent retry that has already committed the same receipt.
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
    return { error: 'บันทึกวิธีทำไม่สำเร็จ กรุณาลองใหม่' }
  }

  await removeUnreferencedStoredWork(admin, [previous?.preview_path, previous?.scene_path].filter(path => (
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

  await removeUnreferencedStoredWork(createAdminClient(), [artifact.preview_path, artifact.scene_path])
  return { success: true as const }
}

export async function prepareTeachingBoardUpload(input: {
  assignmentId: string
  questionId: string
  slot: number
  formatVersion: number
  previewFormat: string
  scene: unknown
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!isUuid(input.assignmentId) || !isUuid(input.questionId)) return { error: 'งานหรือโจทย์ไม่ถูกต้อง' }
  if (!isTeachingBoardSlot(input.slot)) return { error: `ช่องบันทึกต้องอยู่ระหว่าง 1–${TEACHING_BOARD_SLOT_COUNT}` }
  if (!isSupportedWorkFormatVersion(input.formatVersion)) return { error: 'เวอร์ชันพื้นที่เขียนไม่รองรับ' }
  if (!isWorkPreviewFormat(input.previewFormat)) return { error: 'ชนิดภาพตัวอย่างไม่รองรับ' }

  const managed = await loadManagedTeachingBoardContext(supabase, input.assignmentId, input.questionId)
  if ('error' in managed) return managed

  const { data: previous } = await supabase
    .from('teaching_boards')
    .select('scene_path')
    .eq('assignment_id', input.assignmentId)
    .eq('question_id', input.questionId)
    .eq('created_by', user.id)
    .eq('slot', input.slot)
    .maybeSingle()
  const admin = createAdminClient()
  const previousScene = await loadStoredScene(admin, previous?.scene_path)
  const validateTeacherScene = teacherSceneValidator({
    actorId: user.id,
    assignmentId: input.assignmentId,
    questionId: input.questionId,
    previousScene,
  })
  const validatedScene = validateTeacherScene(input.scene)
  if (!validatedScene.ok) return {
    error: validatedScene.code === 'expired-image-claim'
      ? 'สิทธิ์ของรูปโจทย์หมดอายุ กรุณานำรูปเดิมออกแล้วใส่จากโจทย์อีกครั้ง'
      : 'กระดานมีข้อมูลที่ไม่รองรับหรือรูปโจทย์ไม่ผ่านการตรวจสอบ',
  }
  const receiptSecret = uploadReceiptSecret()
  if (!receiptSecret) return { error: 'ระบบยืนยันการอัปโหลดยังไม่พร้อมใช้งาน' }

  const uploadId = crypto.randomUUID()
  const paths = buildTeachingBoardUploadPaths({
    teacherId: user.id,
    assignmentId: input.assignmentId,
    questionId: input.questionId,
    slot: input.slot,
    uploadId,
    previewFormat: input.previewFormat,
  })
  const stored = await storeValidatedScene(admin, paths.scenePath!, validatedScene.scene)
  if ('error' in stored) return stored
  const targets = await createSignedPreviewTarget(admin, paths)
  if ('error' in targets) await removeStoredWork(admin, [paths.scenePath])
  if ('error' in targets) return targets
  return {
    success: true as const,
    uploadId,
    uploadReceipt: signWorkUploadReceipt({
      target: 'teacher',
      actorId: user.id,
      assignmentId: input.assignmentId,
      questionId: input.questionId,
      slot: input.slot,
      uploadId,
      previewFormat: input.previewFormat,
    }, receiptSecret),
    expiresInSeconds: 2 * 60 * 60,
    sceneStored: true as const,
    ...targets,
  }
}

export async function saveTeachingBoard(input: {
  assignmentId: string
  questionId: string
  slot: number
  uploadId: string
  uploadReceipt: string
  formatVersion: number
  replaceExisting: boolean
  previewFormat: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!isUuid(input.assignmentId) || !isUuid(input.questionId) || !isUuid(input.uploadId)) {
    return { error: 'กระดานสอนไม่ถูกต้อง' }
  }
  if (!isTeachingBoardSlot(input.slot)) return { error: `ช่องบันทึกต้องอยู่ระหว่าง 1–${TEACHING_BOARD_SLOT_COUNT}` }
  if (!isSupportedWorkFormatVersion(input.formatVersion)) return { error: 'เวอร์ชันพื้นที่เขียนไม่รองรับ' }
  if (!isWorkPreviewFormat(input.previewFormat)) return { error: 'ชนิดภาพตัวอย่างไม่รองรับ' }
  const receiptSecret = uploadReceiptSecret()
  if (
    !receiptSecret
    || typeof input.uploadReceipt !== 'string'
    || !verifyWorkUploadReceipt(input.uploadReceipt, {
      target: 'teacher',
      actorId: user.id,
      assignmentId: input.assignmentId,
      questionId: input.questionId,
      slot: input.slot,
      uploadId: input.uploadId,
      previewFormat: input.previewFormat,
    }, receiptSecret)
  ) return { error: 'สิทธิ์อัปโหลดหมดอายุหรือไม่ตรงกับกระดานนี้ กรุณาเริ่มบันทึกใหม่' }

  const managed = await loadManagedTeachingBoardContext(supabase, input.assignmentId, input.questionId)
  if ('error' in managed) return managed

  const paths = buildTeachingBoardUploadPaths({
    teacherId: user.id,
    assignmentId: input.assignmentId,
    questionId: input.questionId,
    slot: input.slot,
    uploadId: input.uploadId,
    previewFormat: input.previewFormat,
  })
  const admin = createAdminClient()
  const { data: previous } = await supabase
    .from('teaching_boards')
    .select('id, preview_path, scene_path')
    .eq('assignment_id', input.assignmentId)
    .eq('question_id', input.questionId)
    .eq('created_by', user.id)
    .eq('slot', input.slot)
    .maybeSingle()
  const previousScene = await loadStoredScene(admin, previous?.scene_path)
  const inspected = await inspectStoredWork(
    admin,
    paths,
    input.previewFormat,
    teacherSceneValidator({
      actorId: user.id,
      assignmentId: input.assignmentId,
      questionId: input.questionId,
      previousScene,
    }),
  )
  if ('error' in inspected || inspected.inspection.sceneSize === null || inspected.inspection.elementCount === null) {
    return 'error' in inspected ? inspected : { error: 'กระดานสอนต้องมีไฟล์ต้นฉบับ' }
  }

  if (previous && !input.replaceExisting) {
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
    return { error: 'บันทึกกระดานสอนไม่สำเร็จ กรุณาลองใหม่' }
  }

  await removeUnreferencedStoredWork(admin, [previous?.preview_path, previous?.scene_path].filter(path => (
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
      .select('id, slot, created_by, preview_path, format_version, created_at, updated_at')
      .eq('assignment_id', assignmentId)
      .eq('question_id', questionId)
      .order('created_by')
      .order('slot'),
    supabase.rpc('can_manage_math_tools_assignment', { p_assignment_id: assignmentId }),
  ])
  if (error) return { error: 'เปิดกระดานสอนไม่สำเร็จ กรุณาลองใหม่' }

  const admin = createAdminClient()
  const creatorIds = Array.from(new Set((rows ?? []).map(row => row.created_by)))
  const [{ data: creators }, signed] = await Promise.all([
    creatorIds.length > 0
      ? admin.from('users').select('id, full_name').in('id', creatorIds)
      : Promise.resolve({ data: [] }),
    signStoredPaths(admin, (rows ?? []).map(row => row.preview_path)),
  ])
  if (!signed) return { error: 'สร้างลิงก์เปิดกระดานสอนไม่สำเร็จ กรุณาลองใหม่' }
  const creatorNames = new Map((creators ?? []).map(row => [row.id, row.full_name || 'ครูผู้สอน']))

  return {
    success: true as const,
    expiresInSeconds: SIGNED_READ_SECONDS,
    boards: (rows ?? []).map(row => ({
      id: row.id,
      slot: row.slot,
      createdBy: row.created_by,
      creatorName: creatorNames.get(row.created_by) ?? 'ครูผู้สอน',
      editable: canManage === true && row.created_by === user.id,
      formatVersion: row.format_version,
      previewUrl: signed.get(row.preview_path) ?? null,
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

  await removeUnreferencedStoredWork(createAdminClient(), [board.preview_path, board.scene_path])
  revalidatePath(`/assignments/${board.assignment_id}/teach`)
  return { success: true as const }
}
