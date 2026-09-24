import type { SubmittedFile } from '@/lib/types'

export interface SubmissionUploadCandidate<TFile> {
  uploadId: string
  file: TFile
  name: string
  mimeType: string
  size: number
}

interface PreparedSubmissionUpload {
  success: true
  reused: false
  uploadId: string
  path: string
  token: string
  bucket: string
}

interface ReusedSubmissionUpload {
  success: true
  reused: true
  uploadId: string
  file: SubmittedFile
}

type SubmissionUploadError = { error: string }

interface SubmissionUploadDependencies<TFile> {
  prepare: (input: {
    submissionAnswerId: string
    kind: 'submission_file'
    uploadId: string
    retry: boolean
    name: string
    mimeType: string
    size: number
  }) => Promise<PreparedSubmissionUpload | ReusedSubmissionUpload | SubmissionUploadError>
  upload: (
    target: Pick<PreparedSubmissionUpload, 'bucket' | 'path' | 'token'>,
    file: TFile,
    mimeType: string,
  ) => Promise<{ error: unknown | null }>
  complete: (input: {
    submissionAnswerId: string
    kind: 'submission_file'
    uploadId: string
    name: string
    mimeType: string
    size: number
  }) => Promise<{ success: true; file: SubmittedFile } | SubmissionUploadError>
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

/**
 * One logical file keeps one upload ID across every retry. On a retry the
 * server first reconciles that exact object path, so an upload whose response
 * was lost is referenced instead of copied to a second path.
 */
export async function uploadSubmissionCandidate<TFile>(
  input: {
    submissionAnswerId: string
    candidate: SubmissionUploadCandidate<TFile>
    retry: boolean
  },
  dependencies: SubmissionUploadDependencies<TFile>,
): Promise<SubmittedFile> {
  const common = {
    submissionAnswerId: input.submissionAnswerId,
    kind: 'submission_file' as const,
    uploadId: input.candidate.uploadId,
    name: input.candidate.name,
    mimeType: input.candidate.mimeType,
    size: input.candidate.size,
  }
  const prepared = await dependencies.prepare({ ...common, retry: input.retry })
  if ('error' in prepared) throw new Error(prepared.error)
  if (prepared.reused) return prepared.file

  const sent = await dependencies.upload(prepared, input.candidate.file, input.candidate.mimeType)
  if (sent.error) {
    throw new Error(errorMessage(sent.error, 'อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่'))
  }

  const completed = await dependencies.complete(common)
  if ('error' in completed) throw new Error(completed.error)
  return completed.file
}

/** Keep one answer reference for one immutable Storage object path. */
export function mergeSubmittedFiles(
  current: SubmittedFile[],
  added: SubmittedFile[],
): SubmittedFile[] {
  const byUrl = new Map<string, SubmittedFile>()
  for (const file of [...current, ...added]) {
    if (!byUrl.has(file.url)) byUrl.set(file.url, file)
  }
  return [...byUrl.values()]
}
