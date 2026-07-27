'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileUp, FileText, Loader2, X } from 'lucide-react'
import type { SubmittedFile } from '@/lib/types'

interface FileSubmissionUploadProps {
  value: SubmittedFile[]
  onChange: (files: SubmittedFile[]) => void
}

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
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const uploaded: SubmittedFile[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage
        .from('submission-files')
        .upload(path, file, { upsert: false })

      if (!error) {
        const { data: { publicUrl } } = supabase.storage
          .from('submission-files')
          .getPublicUrl(path)
        uploaded.push({ url: publicUrl, name: file.name, type: file.type })
      }
    }

    onChange([...value, ...uploaded])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function removeFile(url: string) {
    const supabase = createClient()
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
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
