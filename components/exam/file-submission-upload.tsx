'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileUp, FileText, Loader2, X } from 'lucide-react'
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
  value: SubmittedFile[]
  onChange: (files: SubmittedFile[]) => void
}

/** The `submission-files` bucket's own limit, set in its creating migration. */
const SUBMISSION_FILE_MAX_MB = 10

function isImageType(type: string) {
  return type.startsWith('image/')
}

// Student-side multi-file submission uploader for `file_upload` questions —
// mirrors WorkImageUpload's storage-upload pattern but keeps an array (like
// the teacher-side QuestionImageUpload) instead of a single slot, and
// accepts PDFs alongside images.
export function FileSubmissionUpload({ value, onChange }: FileSubmissionUploadProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    setUploading(true)
    const supabase = await browserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const uploaded: SubmittedFile[] = []
    for (const original of files) {
      // Same reason as the work-photo slot: a student attaching their answer is
      // usually attaching a photo of it, from a phone, while a timer runs. PDFs
      // pass through untouched.
      const file = await downscaleImage(original)
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage
        .from('submission-files')
        .upload(path, file, { upsert: false })

      if (error) {
        toast.error(uploadErrorMessage(error.message, original.name, SUBMISSION_FILE_MAX_MB))
        continue
      }
      const { data: { publicUrl } } = supabase.storage
        .from('submission-files')
        .getPublicUrl(path)
      // The teacher's list shows the name the student recognises, not the one
      // re-encoding gave it.
      uploaded.push({ url: publicUrl, name: original.name, type: file.type })
    }

    onChange([...value, ...uploaded])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function removeFile(url: string) {
    const supabase = await browserSupabase()
    const match = url.match(/\/object\/public\/submission-files\/(.+)/)
    if (match?.[1]) {
      await supabase.storage.from('submission-files').remove([decodeURIComponent(match[1])])
    }
    onChange(value.filter(f => f.url !== url))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={inputRef}
          type="file"
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
        <span className="text-[10px] text-muted-foreground">รูปภาพหรือ PDF — สูงสุด 10 MB ต่อไฟล์</span>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map((f) => (
            <div key={f.url} className="relative group">
              {isImageType(f.type) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.url}
                  alt={f.name}
                  className="w-24 h-24 rounded-lg object-cover border cursor-pointer"
                  onClick={() => window.open(f.url, '_blank')}
                />
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
                className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
