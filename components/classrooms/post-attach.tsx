'use client'

import {
  useCallback, useEffect, useRef, useState, type ReactNode, type RefObject,
} from 'react'
import { toast } from 'sonner'
import { Loader2, Paperclip, UploadCloud, X } from 'lucide-react'
import { downscaleImage } from '@/lib/image-downscale'
import { uploadErrorMessage } from '@/lib/upload-error'
import {
  attachmentKindLabel, formatFileSize, isImageAttachment, shortenFileName,
  MAX_POST_ATTACHMENTS, type PostAttachment,
} from '@/lib/attachment-display'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'

// Loaded on demand rather than imported at the top, for the same reason as
// WorkImageUpload: @supabase/supabase-js is ~220 KB and the classroom page
// only needs it if someone actually attaches something.
async function browserSupabase() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

const BUCKET = 'classroom-post-files'
/** The bucket's ceiling, set in its creating migration. */
const MAX_MB = 10

/** Mirrors the bucket's `allowed_mime_types`, so the picker offers what the bucket takes. */
const ACCEPT = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  'text/plain', 'text/csv', '.zip',
].join(',')

interface Props {
  attachments: PostAttachment[]
  onChange: (attachments: PostAttachment[]) => void
  disabled?: boolean
  /** An adjacent composer action, such as attaching a web link. */
  action?: ReactNode
  /** The whole composer surface that accepts files dropped from the desktop. */
  dropZoneRef?: RefObject<HTMLElement | null>
}

/**
 * The attachment half of the announcement composer: pictures, and the files a
 * teacher hands out — ใบงาน PDF, a Word form, a spreadsheet.
 *
 * Files go up as soon as they are picked, so posting is instant and the
 * teacher sees what they attached before anyone else does. Removing something
 * this session uploaded also removes the file; removing one that came back
 * from the database only drops the reference, because the post being edited
 * may still be cancelled and a deleted file cannot be brought back.
 */
export function PostAttach({ attachments, onChange, disabled, action, dropZoneRef }: Props) {
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadedHere = useRef(new Set<string>())
  const dragDepth = useRef(0)
  const uploadingRef = useRef(false)

  const remaining = MAX_POST_ATTACHMENTS - attachments.length

  const uploadFiles = useCallback(async (files: File[]) => {
    if (disabled || uploadingRef.current) return
    if (remaining <= 0) {
      toast.error(`แนบได้สูงสุด ${MAX_POST_ATTACHMENTS} ไฟล์`)
      return
    }

    const picked = files.slice(0, remaining)
    if (picked.length === 0) return
    if (files.length > remaining) {
      toast.info(`แนบ ${picked.length} ไฟล์แรก — ประกาศหนึ่งแนบได้สูงสุด ${MAX_POST_ATTACHMENTS} ไฟล์`)
    }

    uploadingRef.current = true
    setUploading(true)
    try {
      const supabase = await browserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const added: PostAttachment[] = []
      for (const original of picked) {
        // Only pictures are shrunk. downscaleImage returns anything else
        // untouched, and a PDF has to arrive byte-for-byte anyway.
        const file = await downscaleImage(original)
        const ext = original.name.split('.').pop() ?? 'bin'
        const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
        if (error) {
          toast.error(uploadErrorMessage(error.message, original.name, MAX_MB))
          continue
        }
        const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
        uploadedHere.current.add(publicUrl)
        added.push({
          url: publicUrl,
          name: original.name,
          mime: original.type || file.type,
          size: file.size,
        })
      }
      if (added.length > 0) onChange([...attachments, ...added])
    } catch {
      toast.error('แนบไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally {
      uploadingRef.current = false
      setUploading(false)
    }
  }, [attachments, disabled, onChange, remaining])

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    await uploadFiles(Array.from(e.target.files ?? []))
    if (inputRef.current) inputRef.current.value = ''
  }

  useEffect(() => {
    const zone = dropZoneRef?.current
    if (!zone) return

    const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (disabled || uploading || remaining <= 0) return
      dragDepth.current += 1
      setIsDragging(true)
    }
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = disabled || uploading || remaining <= 0 ? 'none' : 'copy'
      }
    }
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setIsDragging(false)
    }
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setIsDragging(false)
      void uploadFiles(Array.from(event.dataTransfer?.files ?? []))
    }

    zone.addEventListener('dragenter', enter)
    zone.addEventListener('dragover', over)
    zone.addEventListener('dragleave', leave)
    zone.addEventListener('drop', drop)
    return () => {
      zone.removeEventListener('dragenter', enter)
      zone.removeEventListener('dragover', over)
      zone.removeEventListener('dragleave', leave)
      zone.removeEventListener('drop', drop)
    }
  }, [disabled, dropZoneRef, remaining, uploadFiles, uploading])

  async function remove(url: string) {
    onChange(attachments.filter(a => a.url !== url))
    if (!uploadedHere.current.has(url)) return
    uploadedHere.current.delete(url)
    const supabase = await browserSupabase()
    const path = url.split(`/object/public/${BUCKET}/`)[1]
    if (path) await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)])
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {isDragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/95 shadow-sm"
        >
          <div className="flex flex-col items-center gap-1.5 text-center">
            <UploadCloud className="size-7 text-primary" />
            <p className="font-semibold text-primary">วางไฟล์เพื่อแนบกับประกาศ</p>
            <p className="text-xs text-muted-foreground">รูป เอกสาร หรืองานของนักเรียน · สูงสุด {MAX_POST_ATTACHMENTS} ไฟล์</p>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={handleFiles}
      />

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map(attachment => (
            <div key={attachment.url} className="relative">
              {isImageAttachment(attachment.mime) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="w-16 h-16 rounded-lg object-cover border border-border"
                />
              ) : (
                <div className="flex items-center gap-2 h-16 max-w-52 rounded-lg border border-border bg-muted px-3">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{shortenFileName(attachment.name, 24)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {attachmentKindLabel(attachment.mime, attachment.name)} · {formatFileSize(attachment.size)}
                    </p>
                  </div>
                </div>
              )}
              <IconButton
                onClick={() => remove(attachment.url)}
                label={`เอา ${attachment.name} ออก`}
                size="sm"
                className="absolute -top-2 -right-2 bg-card border border-border"
              >
                <X />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={disabled || uploading || remaining <= 0}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
          {uploading ? 'กำลังอัปโหลด...' : remaining <= 0 ? `แนบได้สูงสุด ${MAX_POST_ATTACHMENTS} ไฟล์` : 'แนบไฟล์/รูป'}
        </Button>
        {action}
        {dropZoneRef && remaining > 0 && !uploading && (
          <span className="inline-flex items-center gap-1 self-center text-xs text-muted-foreground">
            <UploadCloud className="size-3.5" /> หรือลากไฟล์มาวาง
          </span>
        )}
      </div>
    </div>
  )
}
