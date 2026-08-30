'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Paperclip, X } from 'lucide-react'
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
export function PostAttach({ attachments, onChange, disabled }: Props) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadedHere = useRef(new Set<string>())

  const remaining = MAX_POST_ATTACHMENTS - attachments.length

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).slice(0, remaining)
    if (picked.length === 0) return

    setUploading(true)
    const supabase = await browserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

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
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function remove(url: string) {
    onChange(attachments.filter(a => a.url !== url))
    if (!uploadedHere.current.has(url)) return
    uploadedHere.current.delete(url)
    const supabase = await browserSupabase()
    const path = url.split(`/object/public/${BUCKET}/`)[1]
    if (path) await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)])
  }

  return (
    <div className="space-y-2">
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
    </div>
  )
}
