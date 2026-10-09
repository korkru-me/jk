'use client'

import {
  saveAnswer as ordinarySaveAnswer, saveWorkImage as ordinarySaveWorkImage,
  checkAnswer as ordinaryCheckAnswer, rerollCheckedRandomAnswer as ordinaryRerollCheckedRandomAnswer,
  drawNextStreakQuestion as ordinaryDrawNextStreakQuestion, submitSubmission as ordinarySubmitSubmission,
} from '@/lib/actions/submissions'
import { recordProctorSignal as ordinaryRecordProctorSignal } from '@/lib/actions/exam-proctor'
import {
  prepareStudentWorkArtifactUpload as ordinaryPrepareStudentWorkArtifactUpload,
  saveStudentWorkArtifact as ordinarySaveStudentWorkArtifact,
  getStudentWorkArtifacts as ordinaryGetStudentWorkArtifacts,
  deleteStudentWorkArtifact as ordinaryDeleteStudentWorkArtifact,
} from '@/lib/actions/math-work'
import {
  prepareExamAttachmentUpload as ordinaryPrepareExamAttachmentUpload,
  completeExamAttachmentUpload as ordinaryCompleteExamAttachmentUpload,
  deleteExamAttachment as ordinaryDeleteExamAttachment,
} from '@/lib/actions/exam-attachments'
import { parseSebExamRoute, sebExamBasePath } from '@/lib/seb-exam-transport-policy'
import { renderRichTextHtml } from '@/lib/rich-text-html'

interface WaitingExamTransport { basePath: string; csrf: string }
let configured: WaitingExamTransport | null = null
const TRANSPORT_ERROR = 'คำขอห้องสอบไม่สำเร็จ กรุณาโหลดข้อสอบเดิมใหม่'

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function examNamespace(pathname: string) {
  const matches = (value: string) => /^\/exam(?:$|[\/\\]|%2f|%5c)/i.test(value)
  if (matches(pathname)) return true
  try { return matches(decodeURIComponent(pathname)) } catch { return false }
}

/** Called synchronously by the exam-only client boundary, before child effects. */
export function configureWaitingExamTransport(input: WaitingExamTransport) {
  const route = parseSebExamRoute(`${input.basePath}/take`)
  if (!route || sebExamBasePath(route) !== input.basePath || typeof input.csrf !== 'string'
    || input.csrf.length < 1 || input.csrf.length > 4096 || /[\r\n]/.test(input.csrf)) {
    throw new Error(TRANSPORT_ERROR)
  }
  // This module also renders on the server. Never retain per-request CSRF in
  // a process-global SSR module or let it rewrite another ordinary request.
  if (typeof window !== 'undefined') configured = { basePath: input.basePath, csrf: input.csrf }
}

function transport(): WaitingExamTransport | null {
  if (typeof window === 'undefined') return null
  const pathname = window.location.pathname
  if (!examNamespace(pathname)) return null
  const route = parseSebExamRoute(pathname)
  if (!route || !configured || sebExamBasePath(route) !== configured.basePath) throw new Error(TRANSPORT_ERROR)
  return configured
}

export function isWaitingExamTransport() { return transport() !== null }

function bridged<Args extends unknown[], Result>(operation: string, ordinary: (...args: Args) => Promise<Result>) {
  return async (...args: Args): Promise<Result> => {
    const current = transport()
    if (!current) return ordinary(...args)
    // JSON arrays turn undefined into null. Omit only trailing optional args;
    // never change positions or silently discard an explicit interior value.
    const serializedArgs: unknown[] = [...args]
    while (serializedArgs.length && serializedArgs.at(-1) === undefined) serializedArgs.pop()
    const response = await fetch(`${current.basePath}/api`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-korkru-seb-csrf': current.csrf },
      body: JSON.stringify({ operation, args: serializedArgs }),
    })
    const payload: unknown = await response.json()
    if (record(payload) && Reflect.ownKeys(payload).length === 1) {
      if (response.ok && Object.hasOwn(payload, 'result') && record(payload.result)
        && (payload.result.success === true || (typeof payload.result.error === 'string'
          && payload.result.error.length > 0 && payload.result.error.length <= 1000))) return payload.result as Result
      // Every closed student action has an error result. A server refusal is
      // a received answer, not a lost response to replay automatically.
      if (typeof payload.error === 'string' && payload.error.length > 0 && payload.error.length <= 1000) return { error: payload.error } as Result
    }
    return { error: TRANSPORT_ERROR } as Result
  }
}

export const saveAnswer = bridged('saveAnswer', ordinarySaveAnswer)
export const saveWorkImage = bridged('saveWorkImage', ordinarySaveWorkImage)
export const checkAnswer = bridged('checkAnswer', ordinaryCheckAnswer)
export const rerollCheckedRandomAnswer = bridged('rerollCheckedRandomAnswer', ordinaryRerollCheckedRandomAnswer)
export const drawNextStreakQuestion = bridged('drawNextStreakQuestion', ordinaryDrawNextStreakQuestion)
export const submitSubmission = bridged('submitSubmission', ordinarySubmitSubmission)
export const recordProctorSignal = bridged('recordProctorSignal', ordinaryRecordProctorSignal)
export const prepareStudentWorkArtifactUpload = bridged('prepareStudentWorkArtifactUpload', ordinaryPrepareStudentWorkArtifactUpload)
export const saveStudentWorkArtifact = bridged('saveStudentWorkArtifact', ordinarySaveStudentWorkArtifact)
export const getStudentWorkArtifacts = bridged('getStudentWorkArtifacts', ordinaryGetStudentWorkArtifacts)
export const deleteStudentWorkArtifact = bridged('deleteStudentWorkArtifact', ordinaryDeleteStudentWorkArtifact)
export const prepareExamAttachmentUpload = bridged('prepareExamAttachmentUpload', ordinaryPrepareExamAttachmentUpload)
export const completeExamAttachmentUpload = bridged('completeExamAttachmentUpload', ordinaryCompleteExamAttachmentUpload)
export const deleteExamAttachment = bridged('deleteExamAttachment', ordinaryDeleteExamAttachment)

/** Render/fetch-only rewrite. Keep the original model URL for save/delete checks. */
export function waitingExamResourceUrl(url: string): string {
  const current = transport()
  if (!current || !url || /^(?:blob:|data:)/i.test(url)) return url
  if (url.startsWith(`${current.basePath}/resource?src=`)) return url
  return `${current.basePath}/resource?src=${encodeURIComponent(url)}`
}

/** Sanitize first, then replace only canonical quoted URLs in retained tags.
 * Replacing encoded URL values cannot introduce attributes or HTML markup. */
export function waitingExamRichTextHtml(text: string): string {
  const html = renderRichTextHtml(text)
  if (!transport()) return html
  return html.replace(/(<(?:img|a)\b[^>]*\b(?:src|href)=")([^"]*)(")/g, (_match, prefix: string, src: string, suffix: string) => {
    const decoded = src.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    const url = waitingExamResourceUrl(decoded).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `${prefix}${url}${suffix}`
  })
}

/** Receipts use the canonical submitted page, with no submission-id query. */
export function waitingExamSubmittedHref(fallback: string) {
  const current = transport()
  return current ? `${current.basePath}/submitted` : fallback
}

/** A signed target authorizes bytes only; no direct Storage SDK in /exam. */
export async function uploadWaitingExamFile(preparedTarget: unknown, blob: Blob, mimeType: string): Promise<{ error: Error | null }> {
  const current = transport()
  if (!current) throw new Error(TRANSPORT_ERROR)
  const receipt = record(preparedTarget)
    ? typeof preparedTarget.examUploadReceipt === 'string' ? preparedTarget.examUploadReceipt
      : record(preparedTarget.preview) ? preparedTarget.preview.examUploadReceipt : null
    : null
  if (typeof receipt !== 'string' || !receipt || receipt.length > 8192 || /[\r\n]/.test(receipt)
    || !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(mimeType)
    || (blob.type && blob.type !== mimeType)) return { error: new Error(TRANSPORT_ERROR) }
  const response = await fetch(`${current.basePath}/resource/upload`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { 'content-type': mimeType, 'x-korkru-seb-csrf': current.csrf, 'x-korkru-seb-upload-receipt': receipt },
    body: blob,
  })
  const payload: unknown = await response.json()
  if (response.ok && record(payload) && Reflect.ownKeys(payload).length === 1 && payload.success === true) return { error: null }
  return { error: new Error(record(payload) && typeof payload.error === 'string' && payload.error.length <= 1000 ? payload.error : TRANSPORT_ERROR) }
}
