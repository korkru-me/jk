'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Camera, Loader2, X } from 'lucide-react'

interface WorkImageUploadProps {
  value: string | null
  onChange: (url: string | null) => void
  required?: boolean
}

// Single image per slot (one per answer part) — reuploading replaces the
// existing image rather than appending, unlike the teacher-side
// QuestionImageUpload which keeps an array.
export function WorkImageUpload({ value, onChange, required }: WorkImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const previous = value
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage
      .from('work-images')
      .upload(path, file, { upsert: false })

    if (!error) {
      const { data: { publicUrl } } = supabase.storage
        .from('work-images')
        .getPublicUrl(path)
      onChange(publicUrl)
      if (previous) await removeStoredImage(previous)
    }

    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function removeStoredImage(url: string) {
    const supabase = createClient()
    const match = url.match(/\/object\/public\/work-images\/(.+)/)
    if (match?.[1]) {
      await supabase.storage.from('work-images').remove([decodeURIComponent(match[1])])
    }
  }

  async function handleRemove() {
    if (value) await removeStoredImage(value)
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="รูปวิธีทำ"
            className="w-28 h-28 rounded-lg object-cover border cursor-pointer"
            onClick={() => window.open(value, '_blank')}
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
              ? 'border-warning text-warning bg-warning/8'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          {uploading ? 'กำลังอัปโหลด...' : 'แนบรูปวิธีทำ'}
        </button>
      )}
      {required && !value && (
        <p className="text-[10px] text-warning">ต้องแนบรูปวิธีทำก่อนส่งคำตอบ</p>
      )}
    </div>
  )
}
