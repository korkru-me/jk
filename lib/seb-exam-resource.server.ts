import 'server-only'

import { createHash } from 'node:crypto'
import { authorizeWaitingObject } from '@/lib/seb-waiting.server'
import { getExamTakingData, type ExamTakingData } from '@/lib/exam-taking'
import { getWritableStudentAnswer } from '@/lib/exam-write-access'
import { readSebSessionSecret } from '@/lib/seb'
import { isSebExamContextClaims, type SebExamContextClaims } from '@/lib/seb-exam-context-core'
import { examAttachmentDefinition, hasExamAttachmentSignature, parseSubmittedFiles } from '@/lib/exam-attachment'
import { inspectStoredExamAttachment } from '@/lib/exam-attachment-storage.server'
import { MATH_WORK_BUCKET, MAX_WORK_PREVIEW_BYTES, MAX_WORK_SCENE_BYTES } from '@/lib/math-work'
import { sanitizeRichTextHtml } from '@/lib/rich-text-sanitize'
import { validateDrawingScene } from '@/lib/drawing-board-policy'
import {
  signWaitingExamUploadReceipt,
  validWaitingExamUploadTarget,
  verifyWaitingExamUploadReceipt,
  type WaitingExamUploadTarget,
} from '@/lib/seb-exam-upload-receipt'

export const WAITING_EXAM_RESOURCE_MAX_BYTES = 10 * 1024 * 1024
type Bucket = 'question-images' | 'work-images' | 'submission-files' | typeof MATH_WORK_BUCKET
type Asset = Readonly<{ bucket: Bucket; path: string }>
type ResourceCode = 'SEB_EXAM_RESOURCE_DENIED' | 'SEB_EXAM_RESOURCE_INVALID'
  | 'SEB_EXAM_RESOURCE_UNAVAILABLE' | 'SEB_EXAM_RESOURCE_TOO_LARGE' | 'SEB_EXAM_RESOURCE_FAILED'
export type WaitingExamResourceResult =
  | Readonly<{ ok: true; bytes: Uint8Array; mimeType: string }>
  | Readonly<{ ok: false; code: ResourceCode }>
export type WaitingExamUploadResult =
  | Readonly<{ ok: true; reused: boolean }>
  | Readonly<{ ok: false; code: 'SEB_EXAM_UPLOAD_DENIED' | 'SEB_EXAM_UPLOAD_INVALID' | 'SEB_EXAM_UPLOAD_FAILED' }>

function storageOrigin(): string | null {
  try {
    const configured = process.env.NEXT_PUBLIC_SUPABASE_URL
    const parsed = new URL(configured ?? '')
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      && configured === parsed.origin ? parsed.origin : null
  } catch { return null }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function liveContext(context: SebExamContextClaims) {
  return isSebExamContextClaims(context) && context.userId !== null
    && context.expiresAt > Date.now() && context.issuedAt <= Date.now() + 60_000
}

function assetFromUrl(src: unknown, origin: string): Asset | null {
  if (typeof src !== 'string' || src.length < 1 || src.length > 4096
    || /[\u0000-\u0020\u007f\\]/u.test(src) || /%2e|%2f|%5c/i.test(src)
    || src.split(/[?#]/)[0].split('/').some(segment => segment === '.' || segment === '..')) return null
  try {
    const url = new URL(src)
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || url.hash) return null
    const match = /^\/storage\/v1\/object\/(public|sign)\/(question-images|work-images|submission-files|math-work-artifacts)\/(.+)$/.exec(url.pathname)
    if (!match) return null
    const bucket = match[2] as Bucket
    if (match[1] === 'sign') {
      const keys = [...url.searchParams.keys()]
      // The token is transport data, never permission. Only current artifact
      // metadata may admit its canonical private path below.
      if (bucket !== MATH_WORK_BUCKET || keys.length !== 1 || keys[0] !== 'token'
        || !url.searchParams.get('token')) return null
    } else if (bucket === MATH_WORK_BUCKET || url.search) return null
    const path = decodeURIComponent(match[3])
    if (path.length > 1000 || /[\u0000-\u001f\u007f\\]/u.test(path)
      || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) return null
    return Object.freeze({ bucket, path })
  } catch { return null }
}

function assetKey(asset: Asset) { return `${asset.bucket}:${asset.path}` }

function snapshotAssets(data: ExamTakingData, origin: string): ReadonlyMap<string, Asset> {
  const assets = new Map<string, Asset>()
  let remaining = 10_000
  let htmlBudget = 4 * 1024 * 1024
  const add = (value: unknown, bucket: Bucket, answerId?: string) => {
    if (--remaining < 0) throw new Error('bounded')
    const asset = assetFromUrl(value, origin)
    if (!asset || asset.bucket !== bucket) return
    if (bucket === MATH_WORK_BUCKET) {
      if (!answerId || !asset.path.startsWith(`students/${data.submission.student_id}/${data.submission.id}/${answerId}/`)
        || asset.path.split('/').length !== 6
        || !/\/(?:preview\.(?:png|webp)|scene\.json)$/.test(asset.path)) return
    } else if (bucket === 'work-images' || bucket === 'submission-files') {
      const segments = asset.path.split('/')
      const current = answerId && asset.path.startsWith(`${data.submission.student_id}/${data.submission.id}/${answerId}/`) && segments.length === 4
      const legacy = segments.length === 2 && segments[0] === data.submission.student_id
      if (!current && !legacy) return
    }
    assets.set(assetKey(asset), asset)
  }
  const html = (value: unknown) => {
    if (typeof value !== 'string') return
    htmlBudget -= value.length
    if (htmlBudget < 0) throw new Error('bounded')
    const sanitized = sanitizeRichTextHtml(value, { storageOrigin: origin, allowBlobImages: false })
    for (const match of sanitized.matchAll(/<img\s+src="([^"]+)"/g)) {
      add(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'), 'question-images')
    }
  }
  // Only the safe DTO's named question/choice fields; never whole-row walking
  // or solution/answer-key fields, even if someone adds them to a future DTO.
  const extra = (value: unknown, depth = 0) => {
    if (depth > 5 || --remaining < 0) throw new Error('bounded')
    if (Array.isArray(value)) { for (const item of value) extra(item, depth + 1); return }
    if (!record(value)) return
    for (const key of ['image_url', 'left_image', 'right_image']) add(value[key], 'question-images')
    for (const key of ['image_urls', 'attachment_urls']) {
      if (Array.isArray(value[key])) for (const url of value[key]) add(url, 'question-images')
    }
    for (const key of ['text', 'prompt', 'sub_text', 'left_text', 'right_text']) html(value[key])
    for (const key of ['parts', 'rows', 'items', 'options', 'choices', 'statements']) {
      if (Array.isArray(value[key])) extra(value[key], depth + 1)
    }
  }
  const answerIds = new Set(data.answers.map(answer => answer.id))
  for (const answer of data.answers) {
    const question = answer.questions
    for (const url of question.image_urls ?? []) add(url, 'question-images')
    html(question.question_text)
    extra(question.mcq_options)
    extra(question.matching_options)
    extra(question.answer_parts)
    extra(question.extra_data)
    for (const url of answer.work_images ?? []) add(url, 'work-images', answer.id)
    if (question.question_type === 'file_upload') {
      for (const file of parseSubmittedFiles(answer.student_answer) ?? []) add(file.url, 'submission-files', answer.id)
    }
  }
  for (const artifact of data.artifacts) {
    if (!answerIds.has(artifact.submissionAnswerId)) continue
    add(artifact.previewUrl, MATH_WORK_BUCKET, artifact.submissionAnswerId)
    add(artifact.sceneUrl, MATH_WORK_BUCKET, artifact.submissionAnswerId)
  }
  return assets
}

function resourceMime(bytes: Uint8Array, asset: Asset): string | null {
  if (asset.bucket === MATH_WORK_BUCKET && asset.path.endsWith('/scene.json')) {
    try {
      return bytes.length <= MAX_WORK_SCENE_BYTES && validateDrawingScene(
        JSON.parse(Buffer.from(bytes).toString('utf8')), { role: 'student' },
      ).ok ? 'application/json' : null
    } catch { return null }
  }
  const candidates = asset.bucket === 'work-images' ? ['image/png', 'image/jpeg', 'image/webp']
    : asset.bucket === MATH_WORK_BUCKET ? [asset.path.endsWith('/preview.png') ? 'image/png' : 'image/webp']
      : ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
  for (const mime of candidates) if (hasExamAttachmentSignature(bytes, mime)) return mime
  if (asset.bucket === 'question-images' && ['GIF87a', 'GIF89a'].includes(Buffer.from(bytes.subarray(0, 6)).toString('ascii'))) return 'image/gif'
  // No HTML, SVG, JavaScript or arbitrary binary passthrough.
  return null
}

/** No HTTP fetch or signed-token authority; the response route supplies no-store/nosniff. */
export async function loadWaitingExamResource(
  context: SebExamContextClaims,
  submissionId: string,
  src: string,
): Promise<WaitingExamResourceResult> {
  try {
    if (!liveContext(context)) return Object.freeze({ ok: false, code: 'SEB_EXAM_RESOURCE_DENIED' })
    const origin = storageOrigin()
    const requested = origin && assetFromUrl(src, origin)
    if (!origin || !requested) return Object.freeze({ ok: false, code: 'SEB_EXAM_RESOURCE_INVALID' })
    const access = await authorizeWaitingObject(context, 'submission', submissionId)
    if (!access || access.submissionId !== submissionId || access.user.id !== context.userId) {
      return Object.freeze({ ok: false, code: 'SEB_EXAM_RESOURCE_DENIED' })
    }
    const data = await getExamTakingData(submissionId)
    if (!data || data.submission.id !== submissionId || data.submission.student_id !== context.userId
      || data.submission.assignment_id !== context.assignmentId || !data.assignment.secure_browser_verified
      || data.assignment.exam_access_mode !== 'seb') return Object.freeze({ ok: false, code: 'SEB_EXAM_RESOURCE_DENIED' })
    const asset = snapshotAssets(data, origin).get(assetKey(requested))
    if (!asset) return Object.freeze({ ok: false, code: 'SEB_EXAM_RESOURCE_DENIED' })
    const maxBytes = asset.bucket === MATH_WORK_BUCKET
      ? asset.path.endsWith('/scene.json') ? MAX_WORK_SCENE_BYTES : MAX_WORK_PREVIEW_BYTES
      : asset.bucket === 'work-images' ? examAttachmentDefinition('work_image').maxBytes : WAITING_EXAM_RESOURCE_MAX_BYTES
    const { data: object, error } = await access.admin.storage.from(asset.bucket).download(asset.path)
    if (error || !object) return Object.freeze({ ok: false, code: 'SEB_EXAM_RESOURCE_UNAVAILABLE' })
    if (object.size < 1 || object.size > maxBytes) return Object.freeze({ ok: false, code: 'SEB_EXAM_RESOURCE_TOO_LARGE' })
    const bytes = new Uint8Array(await object.arrayBuffer())
    if (bytes.length !== object.size || bytes.length > maxBytes) return Object.freeze({ ok: false, code: 'SEB_EXAM_RESOURCE_INVALID' })
    const mimeType = resourceMime(bytes, asset)
    return mimeType ? Object.freeze({ ok: true, bytes, mimeType }) : Object.freeze({ ok: false, code: 'SEB_EXAM_RESOURCE_INVALID' })
  } catch { return Object.freeze({ ok: false, code: 'SEB_EXAM_RESOURCE_FAILED' }) }
}

async function writableTarget(context: SebExamContextClaims, answerId: string) {
  if (!liveContext(context)) return null
  const access = await authorizeWaitingObject(context, 'answer', answerId)
  if (!access || access.answerId !== answerId || access.user.id !== context.userId) return null
  const writable = await getWritableStudentAnswer(access.admin, answerId, access.user.id)
  if ('error' in writable || writable.answer.id !== answerId || writable.answer.carried_over
    || writable.submission.id !== access.submissionId || writable.submission.student_id !== context.userId
    || writable.submission.assignment_id !== context.assignmentId || writable.submission.status !== 'in_progress'
    || writable.submission.seb_config_revision !== context.revision || writable.submission.exam_access_mode !== 'seb'
    || writable.assignment?.id !== context.assignmentId || writable.assignment.type !== 'exam'
    || writable.assignment.mode !== 'online' || writable.assignment.secure_browser_mode !== 'seb_required') return null
  return { access, writable }
}

/** Call only with the trusted result of the existing prepare action, never request-chosen targets. */
export async function signWaitingUploadTarget(
  context: SebExamContextClaims,
  answerId: string,
  prepared: unknown,
): Promise<string | null> {
  try {
    const secret = readSebSessionSecret()
    if (!secret || !record(prepared) || prepared.success !== true) return null
    const authorized = await writableTarget(context, answerId)
    if (!authorized) return null
    const { access, writable } = authorized
    let target: WaitingExamUploadTarget
    if (record(prepared.preview) && typeof prepared.preview.path === 'string') {
      const mimeType = prepared.preview.path.endsWith('/preview.png') ? 'image/png'
        : prepared.preview.path.endsWith('/preview.webp') ? 'image/webp' : ''
      if (writable.assignment?.scratchpad_enabled !== true && writable.assignment?.require_work_image !== true) return null
      target = { submissionId: access.submissionId, answerId, bucket: MATH_WORK_BUCKET,
        path: prepared.preview.path, mimeType, maxBytes: MAX_WORK_PREVIEW_BYTES, exactSize: null }
    } else {
      const kind = prepared.bucket === 'work-images' ? 'work_image' : prepared.bucket === 'submission-files' ? 'submission_file' : null
      if (!kind || typeof prepared.path !== 'string' || typeof prepared.mimeType !== 'string' || typeof prepared.size !== 'number') return null
      if (kind === 'submission_file' && writable.question?.question_type !== 'file_upload') return null
      if (kind === 'work_image' && (writable.question?.question_type !== 'written'
        || (writable.assignment?.require_work_image !== true && writable.assignment?.scratchpad_enabled !== true))) return null
      target = { submissionId: access.submissionId, answerId, bucket: examAttachmentDefinition(kind).bucket,
        path: prepared.path, mimeType: prepared.mimeType, maxBytes: examAttachmentDefinition(kind).maxBytes, exactSize: prepared.size }
    }
    return validWaitingExamUploadTarget(target, access.user.id) ? signWaitingExamUploadReceipt(context, target, secret) : null
  } catch { return null }
}

/** Rechecks live scope/write gates and writes one deterministic key without upsert. */
export async function executeWaitingExamUpload(
  context: SebExamContextClaims,
  token: string,
  supplied: Uint8Array,
  mimeType: string,
): Promise<WaitingExamUploadResult> {
  try {
    const secret = readSebSessionSecret()
    const receipt = secret && verifyWaitingExamUploadReceipt(token, context, secret)
    if (!receipt) return Object.freeze({ ok: false, code: 'SEB_EXAM_UPLOAD_DENIED' })
    if (!(supplied instanceof Uint8Array) || supplied.byteLength < 1 || supplied.byteLength > receipt.maxBytes
      || (receipt.exactSize !== null && supplied.byteLength !== receipt.exactSize)
      || mimeType !== receipt.mimeType || !hasExamAttachmentSignature(supplied, mimeType)) {
      return Object.freeze({ ok: false, code: 'SEB_EXAM_UPLOAD_INVALID' })
    }
    const bytes = Buffer.from(supplied)
    const authorized = await writableTarget(context, receipt.answerId)
    if (!authorized || authorized.access.submissionId !== receipt.submissionId) return Object.freeze({ ok: false, code: 'SEB_EXAM_UPLOAD_DENIED' })
    const { access, writable } = authorized
    if (receipt.bucket !== 'submission-files' && writable.assignment?.scratchpad_enabled !== true
      && writable.assignment?.require_work_image !== true) return Object.freeze({ ok: false, code: 'SEB_EXAM_UPLOAD_DENIED' })
    if ((receipt.bucket === 'submission-files' && writable.question?.question_type !== 'file_upload')
      || (receipt.bucket === 'work-images' && writable.question?.question_type !== 'written')) return Object.freeze({ ok: false, code: 'SEB_EXAM_UPLOAD_DENIED' })
    const bucket = access.admin.storage.from(receipt.bucket)
    const uploaded = await bucket.upload(receipt.path, bytes, { contentType: receipt.mimeType, cacheControl: '0', upsert: false })
    // A successful upload may have lost its response. Reuse only the same
    // bytes at this exact key; never overwrite/delete on a proxy retry.
    const existing = await bucket.download(receipt.path)
    if (existing.error || !existing.data || existing.data.size !== bytes.length) return Object.freeze({ ok: false, code: 'SEB_EXAM_UPLOAD_FAILED' })
    const persisted = Buffer.from(await existing.data.arrayBuffer())
    if (persisted.length !== bytes.length || !hasExamAttachmentSignature(persisted, receipt.mimeType)
      || createHash('sha256').update(persisted).digest('hex') !== createHash('sha256').update(bytes).digest('hex')) {
      return Object.freeze({ ok: false, code: 'SEB_EXAM_UPLOAD_FAILED' })
    }
    if (receipt.bucket !== MATH_WORK_BUCKET) {
      const inspected = await inspectStoredExamAttachment(access.admin, {
        kind: receipt.bucket === 'work-images' ? 'work_image' : 'submission_file',
        path: receipt.path, expectedMimeType: receipt.mimeType, expectedSize: bytes.length,
      })
      if ('error' in inspected) return Object.freeze({ ok: false, code: 'SEB_EXAM_UPLOAD_FAILED' })
    }
    // Existing complete/save actions remain the only authority to attach it.
    return Object.freeze({ ok: true, reused: !!uploaded.error })
  } catch { return Object.freeze({ ok: false, code: 'SEB_EXAM_UPLOAD_FAILED' }) }
}
