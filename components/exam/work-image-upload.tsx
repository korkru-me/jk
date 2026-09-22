'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downscaleImage } from '@/lib/image-downscale'
import { uploadErrorMessage } from '@/lib/upload-error'

// Loaded on demand rather than imported at the top: @supabase/supabase-js is
// ~220 KB, and a student only needs it at the moment they attach a file. The
// exam page's first load stays small enough for a phone to open it.
async function browserSupabase() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

/** The `work-images` bucket's ceiling, set in its creating migration. */
const WORK_IMAGE_MAX_MB = 5

interface WorkImageUploadProps {
  submissionAnswerId?: string
  partIndex?: number
  value: string | null
  onChange: (url: string | null) => void
  required?: boolean
  /**
   * ครูกำลังลองทำโจทย์ของตัวเอง ไม่ใช่นักเรียนกำลังส่งงาน — เลือกไฟล์ได้จริงและ
   * เห็นรูปจริง แต่ไม่แตะ storage เลย ไฟล์ถูกถือไว้เป็น object URL ของแท็บนั้น
   *
   * เหตุผลคือหน้าตัวอย่างไม่มี submission ให้ผูกรูปด้วย รูปที่อัปขึ้นไปจะกลาย
   * เป็นไฟล์กำพร้าตั้งแต่วินาทีแรก และการ "อัปแล้วค่อยตามลบ" ไม่เคยครบ —
   * ปิดแท็บ เน็ตหลุด หรือเบราว์เซอร์ถูกฆ่าระหว่างนั้น ไฟล์ก็ค้างอยู่ดี
   */
  localOnly?: boolean
}

function isLocalUrl(url: string) {
  return url.startsWith('blob:')
}

// Single image per slot (one per answer part) — reuploading replaces the
// existing image rather than appending, unlike the teacher-side
// QuestionImageUpload which keeps an array.
export function WorkImageUpload({
  submissionAnswerId,
  partIndex,
  value,
  onChange,
  required,
  localOnly,
}: WorkImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0]
    if (!original) return

    if (localOnly) {
      if (value && isLocalUrl(value)) URL.revokeObjectURL(value)
      onChange(URL.createObjectURL(original))
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    if (!submissionAnswerId || partIndex === undefined) {
      toast.error('ไม่พบช่องคำตอบสำหรับแนบรูป กรุณาโหลดข้อสอบใหม่')
      return
    }
    setUploading(true)
    // The one upload in the app that is genuinely time-critical: the input
    // above opens the phone camera, so this is a full-resolution photo of a
    // page of working, and it is being pushed up during a timed exam on
    // whatever the school's connection happens to be. Shrinking first turns
    // several megabytes into a few hundred kilobytes, and the handwriting is
    // still readable at 1600px.
    const file = await downscaleImage(original)
    const previous = value
    try {
      const { prepareExamAttachmentUpload, completeExamAttachmentUpload } = await import('@/lib/actions/exam-attachments')
      const prepared = await prepareExamAttachmentUpload({
        submissionAnswerId,
        kind: 'work_image',
        partIndex,
        name: file.name,
        mimeType: file.type,
        size: file.size,
      })
      if (!prepared || 'error' in prepared) throw new Error(prepared?.error ?? 'เตรียมพื้นที่อัปโหลดไม่สำเร็จ')
      const supabase = await browserSupabase()
      const sent = await supabase.storage
        .from(prepared.bucket)
        .uploadToSignedUrl(prepared.path, prepared.token, file, {
          contentType: file.type,
          cacheControl: '300',
        })
      if (sent.error) throw sent.error
      const completed = await completeExamAttachmentUpload({
        submissionAnswerId,
        kind: 'work_image',
        partIndex,
        uploadId: prepared.uploadId,
        name: file.name,
        mimeType: file.type,
        size: file.size,
      })
      if (!completed || 'error' in completed) throw new Error(completed?.error ?? 'ตรวจสอบไฟล์ไม่สำเร็จ')
      onChange(completed.file.url)
      if (previous) await removeStoredImage(previous)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
      toast.error(uploadErrorMessage(message, undefined, WORK_IMAGE_MAX_MB))
    }

    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function removeStoredImage(url: string) {
    if (!submissionAnswerId || partIndex === undefined) return false
    const { deleteExamAttachment } = await import('@/lib/actions/exam-attachments')
    const removed = await deleteExamAttachment({
      submissionAnswerId,
      kind: 'work_image',
      partIndex,
      url,
    })
    if (!removed || 'error' in removed) {
      toast.error(removed?.error ?? 'ลบรูปไม่สำเร็จ กรุณาลองใหม่')
      return false
    }
    return true
  }

  async function handleRemove() {
    if (value) {
      if (isLocalUrl(value)) URL.revokeObjectURL(value)
      else if (!await removeStoredImage(value)) return
    }
    onChange(null)
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      {value ? (
        <div className="relative inline-block group">
          <Button
            type="button"
            variant="ghost"
            aria-label="เปิดรูปวิธีทำขนาดเต็ม"
            onClick={() => window.open(value, '_blank')}
            className="block h-auto w-auto rounded-lg p-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              className="h-28 w-28 cursor-pointer rounded-lg border object-cover"
            />
          </Button>
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            aria-label="นำรูปวิธีทำออก"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
            required
              ? 'border-warning bg-warning/8 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          aria-label="แนบรูปวิธีทำจากกล้องหรือเครื่อง"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          {uploading ? 'กำลังอัปโหลด...' : 'แนบรูปวิธีทำ'}
        </button>
      )}
      {required && !value && !localOnly && (
        <p className="text-[10px] font-medium text-foreground">ต้องแนบรูปวิธีทำก่อนส่งคำตอบ</p>
      )}
      {localOnly && (
        <p className="text-[10px] text-muted-foreground">ตัวอย่าง — ไฟล์อยู่ในเครื่องคุณ ไม่ถูกอัปโหลด</p>
      )}
    </div>
  )
}
