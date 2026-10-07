'use client'

import { useRef, useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { cn } from '@/lib/utils'
import { downscaleImage } from '@/lib/image-downscale'
import {
  CLASSROOM_COVER_BUCKET,
  checkClassroomCoverFile,
  classroomCoverUploadPath,
} from '@/lib/classroom-cover'
import { uploadErrorMessage } from '@/lib/upload-error'

export type ClassroomCoverUploadHandler = (file: File) => Promise<{ url: string } | { error: string }>

async function defaultUpload(file: File): Promise<{ url: string } | { error: string }> {
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบอีกครั้งก่อนอัปโหลดรูป' }

  const shrunk = await downscaleImage(file)
  const checked = checkClassroomCoverFile(shrunk)
  if (!checked.ok) return { error: checked.message }
  const path = classroomCoverUploadPath(user.id, checked.extension)
  const { error } = await supabase.storage.from(CLASSROOM_COVER_BUCKET).upload(path, shrunk, { upsert: false })
  if (error) return { error: uploadErrorMessage(error.message, file.name, 5) }
  return { url: supabase.storage.from(CLASSROOM_COVER_BUCKET).getPublicUrl(path).data.publicUrl }
}

export function ClassroomCoverUpload({
  value,
  onChange,
  disabled = false,
  uploadFile = defaultUpload,
}: {
  value: string
  onChange: (url: string) => void
  disabled?: boolean
  uploadFile?: ClassroomCoverUploadHandler
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    const checked = checkClassroomCoverFile(file)
    if (!checked.ok) { toast.error(checked.message); return }

    setIsUploading(true)
    try {
      const result = await uploadFile(file)
      if ('error' in result) toast.error(result.error)
      else onChange(result.url)
    } catch (error) {
      toast.error(`อัปโหลดรูปหน้าปกไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (value) {
    return (
      <div className="group relative h-16 overflow-hidden rounded-lg border border-border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="ภาพหน้าปกที่เลือก" className="size-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-overlay/0 transition-colors group-hover:bg-overlay/20" />
        <IconButton
          type="button"
          size="sm"
          onClick={() => onChange('')}
          disabled={disabled || isUploading}
          label="นำรูปภาพหน้าปกออก"
          className="absolute right-2 top-2 bg-overlay text-surface-inverse-foreground hover:bg-overlay/80 hover:text-surface-inverse-foreground"
        >
          <X />
        </IconButton>
      </div>
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || isUploading}
        onDragOver={event => { event.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={event => {
          event.preventDefault()
          setIsDragging(false)
          const file = event.dataTransfer.files[0]
          if (file) void handleFile(file)
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'h-auto min-h-16 w-full justify-start gap-3 px-3 py-2.5 text-left whitespace-normal',
          isDragging && 'border-primary bg-primary/10',
        )}
      >
        {isUploading
          ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
          : <Upload className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <span className="min-w-0">
          <span className="block text-sm text-foreground">
            {isUploading ? 'กำลังอัปโหลด...' : <>ลากวาง หรือ <span className="font-medium text-primary">เลือกไฟล์</span></>}
          </span>
          <span className="block text-xs text-muted-foreground">PNG, JPG, WebP · สูงสุด 5MB</span>
        </span>
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        disabled={disabled || isUploading}
        onChange={event => {
          const file = event.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
    </>
  )
}
