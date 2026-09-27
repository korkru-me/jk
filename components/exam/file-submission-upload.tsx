'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileUp, FileText, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  mergeSubmittedFiles,
  uploadSubmissionCandidate,
  type SubmissionUploadCandidate,
} from '@/lib/exam-submission-upload'
import { downscaleImage } from '@/lib/image-downscale'
import { uploadErrorMessage } from '@/lib/upload-error'
import type { SubmittedFile } from '@/lib/types'

// Loaded on demand rather than imported at the top: @supabase/supabase-js is
// ~220 KB, and a student only needs it at the moment they attach a file. The
// exam page's first load stays small enough for a phone to open it.
async function browserSupabase() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

interface FileSubmissionUploadProps {
  submissionAnswerId?: string
  value: SubmittedFile[]
  onChange: (files: SubmittedFile[]) => void
  /**
   * ครูกำลังลองทำโจทย์ของตัวเอง — เลือกไฟล์ได้จริงและเห็นไฟล์จริง แต่ไม่แตะ
   * storage เลย เหตุผลเดียวกับ WorkImageUpload: ตัวอย่างไม่มี submission ให้ผูก
   * ไฟล์ด้วย สิ่งที่อัปขึ้นไปจึงเป็นไฟล์กำพร้าตั้งแต่วินาทีแรก
   */
  localOnly?: boolean
}

function isLocalUrl(url: string) {
  return url.startsWith('blob:')
}

/** The `submission-files` bucket's own limit, set in its creating migration. */
const SUBMISSION_FILE_MAX_MB = 10

function isImageType(type: string) {
  return type.startsWith('image/')
}

interface FailedSubmissionUpload extends SubmissionUploadCandidate<File> {
  error: string
}

// Student-side multi-file submission uploader for `file_upload` questions —
// mirrors WorkImageUpload's storage-upload pattern but keeps an array (like
// the teacher-side QuestionImageUpload) instead of a single slot, and
// accepts PDFs alongside images.
export function FileSubmissionUpload({ submissionAnswerId, value, onChange, localOnly }: FileSubmissionUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null)
  const [failedUploads, setFailedUploads] = useState<FailedSubmissionUpload[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadCandidate(candidate: SubmissionUploadCandidate<File>, retry: boolean) {
    if (!submissionAnswerId) throw new Error('ไม่พบคำตอบสำหรับแนบไฟล์ กรุณาโหลดข้อสอบใหม่')
    const { prepareExamAttachmentUpload, completeExamAttachmentUpload } = await import('@/lib/actions/exam-attachments')
    return uploadSubmissionCandidate({ submissionAnswerId, candidate, retry }, {
      prepare: prepareExamAttachmentUpload,
      upload: async (target, file, mimeType) => {
        const supabase = await browserSupabase()
        return supabase.storage
          .from(target.bucket)
          .uploadToSignedUrl(target.path, target.token, file, {
            contentType: mimeType,
            cacheControl: '300',
          })
      },
      complete: completeExamAttachmentUpload,
    })
  }

  function rememberFailure(candidate: SubmissionUploadCandidate<File>, error: string) {
    setFailedUploads(current => {
      const previous = current.find(item => item.uploadId === candidate.uploadId)
      if (!previous) return [...current, { ...candidate, error }]
      return current.map(item => item.uploadId === candidate.uploadId ? { ...item, error } : item)
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    if (localOnly) {
      onChange([
        ...value,
        ...files.map(f => ({ url: URL.createObjectURL(f), name: f.name, type: f.type })),
      ])
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    if (!submissionAnswerId) {
      toast.error('ไม่พบคำตอบสำหรับแนบไฟล์ กรุณาโหลดข้อสอบใหม่')
      return
    }
    setUploading(true)
    const uploaded: SubmittedFile[] = []
    try {
      for (const original of files) {
        // Same reason as the work-photo slot: a student attaching their answer is
        // usually attaching a photo of it, from a phone, while a timer runs. PDFs
        // pass through untouched.
        const file = await downscaleImage(original)
        const candidate: SubmissionUploadCandidate<File> = {
          uploadId: crypto.randomUUID(),
          file,
          name: original.name,
          mimeType: file.type,
          size: file.size,
        }
        setActiveUploadId(candidate.uploadId)
        try {
          uploaded.push(await uploadCandidate(candidate, false))
        } catch (error) {
          const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
          const displayError = uploadErrorMessage(message, original.name, SUBMISSION_FILE_MAX_MB)
          rememberFailure(candidate, displayError)
          toast.error(displayError)
        }
      }
      if (uploaded.length > 0) onChange(mergeSubmittedFiles(value, uploaded))
    } finally {
      setActiveUploadId(null)
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function retryUpload(uploadId: string) {
    const candidate = failedUploads.find(item => item.uploadId === uploadId)
    if (!candidate || !submissionAnswerId || uploading) return

    setUploading(true)
    setActiveUploadId(uploadId)
    try {
      const file = await uploadCandidate(candidate, true)
      setFailedUploads(current => current.filter(item => item.uploadId !== uploadId))
      onChange(mergeSubmittedFiles(value, [file]))
      toast.success(`อัปโหลด “${candidate.name}” สำเร็จแล้ว`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
      const displayError = uploadErrorMessage(message, candidate.name, SUBMISSION_FILE_MAX_MB)
      rememberFailure(candidate, displayError)
      toast.error(displayError)
    } finally {
      setActiveUploadId(null)
      setUploading(false)
    }
  }

  async function removeFile(url: string) {
    if (isLocalUrl(url)) {
      URL.revokeObjectURL(url)
    } else {
      if (!submissionAnswerId) {
        toast.error('ไม่พบคำตอบสำหรับลบไฟล์ กรุณาโหลดข้อสอบใหม่')
        return
      }
      const { deleteExamAttachment } = await import('@/lib/actions/exam-attachments')
      const removed = await deleteExamAttachment({
        submissionAnswerId,
        kind: 'submission_file',
        url,
      })
      if (!removed || 'error' in removed) {
        toast.error(removed?.error ?? 'ลบไฟล์ไม่สำเร็จ กรุณาลองใหม่')
        return
      }
    }
    onChange(value.filter(f => f.url !== url))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={inputRef}
          type="file"
          aria-label="เลือกไฟล์คำตอบ"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
          {uploading ? 'กำลังอัปโหลด...' : 'แนบไฟล์'}
        </button>
        <span className="text-[10px] text-muted-foreground">
          {localOnly
            ? 'รูปภาพหรือ PDF · ตัวอย่าง — ไฟล์อยู่ในเครื่องคุณ ไม่ถูกอัปโหลด'
            : 'รูปภาพหรือ PDF — สูงสุด 10 MB ต่อไฟล์'}
        </span>
      </div>

      {failedUploads.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          {failedUploads.map(item => {
            const retrying = activeUploadId === item.uploadId
            return (
              <div
                key={item.uploadId}
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{item.name}</p>
                  <p className="text-[11px] text-destructive">{item.error}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  aria-label={`ลองอัปโหลดไฟล์ ${item.name} อีกครั้ง`}
                  onClick={() => retryUpload(item.uploadId)}
                >
                  {retrying && <Loader2 className="animate-spin" />}
                  {retrying ? 'กำลังลองอีกครั้ง...' : 'ลองอีกครั้ง'}
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map((f) => (
            <div key={f.url} className="relative group">
              {isImageType(f.type) ? (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`เปิดไฟล์ ${f.name}`}
                  onClick={() => window.open(f.url, '_blank')}
                  className="block h-auto w-auto rounded-lg p-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.url}
                    alt=""
                    className="h-24 w-24 cursor-pointer rounded-lg border object-cover"
                  />
                </Button>
              ) : (
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-24 h-24 flex flex-col items-center justify-center gap-1 rounded-lg border bg-muted/40 hover:bg-muted transition-colors px-1.5"
                >
                  <FileText className="w-6 h-6 text-muted-foreground" />
                  <span className="text-[9px] text-center text-muted-foreground truncate w-full">{f.name}</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => removeFile(f.url)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                aria-label={`นำไฟล์ ${f.name} ออก`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
