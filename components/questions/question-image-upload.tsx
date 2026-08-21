'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ImagePlus, X, Loader2 } from 'lucide-react'

interface QuestionImageUploadProps {
  value: string[]
  onChange: (urls: string[]) => void
}

export function QuestionImageUpload({ value, onChange }: QuestionImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    setUploading(true)
    const supabase = createClient()
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

  async function removeImage(url: string) {
    const supabase = createClient()
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
          accept="image/*"
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
            <ImagePlus className="w-4 h-4 mr-2" />
          )}
          {uploading ? 'กำลังอัปโหลด...' : 'แทรกรูปภาพ'}
        </Button>
        <span className="text-xs text-muted-foreground">JPG, PNG, GIF — สูงสุด 5 MB</span>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map((url) => (
            <div key={url} className="relative group">
              <div className="w-28 h-28 rounded-lg overflow-hidden border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="รูปภาพโจทย์"
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => removeImage(url)}
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
