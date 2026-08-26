'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { FileUp, FileText, X, Loader2 } from 'lucide-react'

// Loaded on demand rather than imported at the top: @supabase/supabase-js is
// ~220 KB, and it is only needed once the teacher actually picks a file. Every
// question authoring route mounts this widget, so a static import charged all
// of them for an upload most sessions never make.
async function browserSupabase() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

interface QuestionFileUploadProps {
  value: string[]
  onChange: (urls: string[]) => void
}

function isPdfUrl(url: string) {
  return /\.pdf(\?|$)/i.test(url)
}

function fileNameFromUrl(url: string) {
  try {
    const last = decodeURIComponent(url.split('/').pop() ?? '')
    return last || 'ไฟล์แนบ'
  } catch {
    return 'ไฟล์แนบ'
  }
}

// Teacher-side reference-material uploader for `file_upload` questions —
// modeled on QuestionImageUpload, but accepts images AND PDFs (reusing the
// same `question-images` bucket) and renders a PDF-aware preview instead of
// always treating the attachment as an <img>.
export function QuestionFileUpload({ value, onChange }: QuestionFileUploadProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    setUploading(true)
    const supabase = await browserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const newUrls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage
        .from('question-images')
        .upload(path, file, { upsert: false })

      if (!error) {
        const { data: { publicUrl } } = supabase.storage
          .from('question-images')
          .getPublicUrl(path)
        newUrls.push(publicUrl)
      }
    }

    onChange([...value, ...newUrls])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function removeFile(url: string) {
    const supabase = await browserSupabase()
    const match = url.match(/\/object\/public\/question-images\/(.+)/)
    if (match?.[1]) {
      await supabase.storage.from('question-images').remove([decodeURIComponent(match[1])])
    }
    onChange(value.filter((u) => u !== url))
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FileUp className="w-4 h-4 mr-2" />
          )}
          {uploading ? 'กำลังอัปโหลด...' : 'แนบไฟล์'}
        </Button>
        <span className="text-xs text-muted-foreground">รูปภาพหรือ PDF — สูงสุด 10 MB</span>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map((url) => (
            <div key={url} className="relative group">
              {isPdfUrl(url) ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-28 h-28 flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted hover:bg-accent transition-colors px-2"
                >
                  <FileText className="w-7 h-7 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground text-center truncate w-full">{fileNameFromUrl(url)}</span>
                </a>
              ) : (
                <div className="w-28 h-28 rounded-lg overflow-hidden border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="ไฟล์แนบโจทย์" className="w-full h-full object-cover" />
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(url)}
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
