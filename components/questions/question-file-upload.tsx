'use client'

import { useState, useRef, useId, type DragEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FileUp, FileText, X, Loader2 } from 'lucide-react'
import { downscaleImage } from '@/lib/image-downscale'
import { uploadErrorMessage } from '@/lib/upload-error'
import { INSTRUCTION_DOCUMENT_TYPES, QUESTION_FILE_TYPES, instructionFileMime, questionFileSelectionError } from '@/lib/question-file-selection'
import { cn } from '@/lib/utils'

// Loaded on demand rather than imported at the top: @supabase/supabase-js is
// ~220 KB, and it is only needed once the teacher actually picks a file. Every
// question authoring route mounts this widget, so a static import charged all
// of them for an upload most sessions never make.
async function browserSupabase() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

/** The `question-images` bucket's ceiling — this widget shares it with
 *  QuestionImageUpload. */
const QUESTION_FILE_MAX_MB = 10

interface QuestionFileUploadProps {
  value: string[]
  onChange: (urls: string[]) => void
  localOnly?: boolean
  maxFiles?: number
  removeFromStorage?: boolean
  allowDrop?: boolean
  allowDocuments?: boolean
  disabled?: boolean
  onUploadingChange?: (uploading: boolean) => void
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
export function QuestionFileUpload({ value, onChange, localOnly = false, maxFiles, removeFromStorage = true, allowDrop = false, allowDocuments = false, disabled = false, onUploadingChange }: QuestionFileUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadingRef = useRef(false)
  const dragDepth = useRef(0)
  const names = useRef(new Map<string, string>())
  const hintId = useId()

  async function handleFiles(files: File[]) {
    if (disabled || uploadingRef.current || files.length === 0) return
    if (maxFiles && value.length + files.length > maxFiles) {
      toast.error(`แนบเอกสารประกอบได้ไม่เกิน ${maxFiles} ไฟล์`)
      return
    }
    uploadingRef.current = true
    setUploading(true)
    onUploadingChange?.(true)
    const newUrls: string[] = []
    try {
      const prepared = await Promise.all(files.map(file => downscaleImage(file)))
      const selectionError = questionFileSelectionError(prepared, value.length, maxFiles, allowDocuments)
      if (selectionError) { toast.error(selectionError); return }
      if (localOnly) {
        const urls = prepared.map((file, index) => {
          const url = URL.createObjectURL(file) + `#${encodeURIComponent(files[index].name)}`
          names.current.set(url, files[index].name)
          return url
        })
        onChange([...value, ...urls])
        return
      }
      const supabase = await browserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast.error('ไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง'); return }
      for (const [index, file] of prepared.entries()) {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const mime = allowDocuments ? instructionFileMime(file) : file.type
        const bucket = (QUESTION_FILE_TYPES as readonly string[]).includes(mime) ? 'question-images' : 'classroom-post-files'
        const safeName = file.name.replace(/[/\\%?#\u0000-\u001f\u007f]/g, '_').slice(-120) || `document.${ext}`
        const path = bucket === 'question-images' ? `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
          : `${user.id}/file-assignment-instructions/${crypto.randomUUID()}/${safeName}`
        const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: mime })
        if (error) { toast.error(uploadErrorMessage(error.message, files[index].name, QUESTION_FILE_MAX_MB)); continue }
        const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
        names.current.set(publicUrl, files[index].name)
        newUrls.push(publicUrl)
      }
      onChange([...value, ...newUrls])
    } catch {
      if (newUrls.length) onChange([...value, ...newUrls])
      toast.error('แนบไฟล์ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      uploadingRef.current = false
      setUploading(false)
      onUploadingChange?.(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function removeFile(url: string) {
    if (disabled || uploadingRef.current) return
    if (localOnly) { URL.revokeObjectURL(url.split('#')[0]); onChange(value.filter(value => value !== url)); return }
    if (!removeFromStorage) { onChange(value.filter(value => value !== url)); return }
    const supabase = await browserSupabase()
    const match = url.match(/\/object\/public\/question-images\/(.+)/)
    if (match?.[1]) {
      await supabase.storage.from('question-images').remove([decodeURIComponent(match[1])])
    }
    onChange(value.filter((u) => u !== url))
  }

  function fileDrag(event: DragEvent<HTMLDivElement>) {
    return event.dataTransfer.types.includes('Files')
  }

  const controls = <>
        {allowDrop && <p id={hintId} className="text-sm font-medium">{dragging ? 'วางไฟล์เพื่อแนบ' : allowDocuments ? 'ลากไฟล์มาวางที่นี่ หรือกดแนบไฟล์' : 'ลากรูปภาพหรือ PDF มาวางที่นี่'}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={[...QUESTION_FILE_TYPES, ...(allowDocuments ? [...Object.values(INSTRUCTION_DOCUMENT_TYPES), 'application/x-zip-compressed', ...Object.keys(INSTRUCTION_DOCUMENT_TYPES).map(extension => `.${extension}`)] : [])].join(',')}
          multiple
          className="hidden"
          disabled={disabled || uploading}
          onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void handleFiles(files) }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          aria-describedby={allowDrop ? hintId : undefined}
          className="min-h-[44px]"
        >
          {uploading ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <FileUp data-icon="inline-start" />
          )}
          {uploading ? 'กำลังอัปโหลด...' : 'แนบไฟล์'}
        </Button>
        <span className="text-xs text-muted-foreground">{allowDocuments ? 'รูปภาพ, PDF, Word, Excel, PowerPoint, TXT, CSV หรือ ZIP' : 'รูปภาพหรือ PDF'} · ไฟล์ละไม่เกิน 10 MB{maxFiles ? ` · สูงสุด ${maxFiles} ไฟล์` : ''}</span>
  </>

  return (
    <div className="flex flex-col gap-3" aria-busy={uploading}>
      {allowDrop ? <Card edge="dashed" radius="md" padding="sm" role="group" aria-label="แนบเอกสารประกอบคำสั่ง" aria-disabled={disabled || uploading}
        data-file-drop-zone data-dragging={dragging}
        className={cn('flex flex-wrap items-center gap-2 transition-colors', dragging && 'border-primary bg-primary/5', disabled && 'opacity-60')}
        onDragEnter={event => { if (!fileDrag(event)) return; event.preventDefault(); if (!disabled && !uploadingRef.current) { dragDepth.current += 1; setDragging(true) } }}
        onDragOver={event => { if (!fileDrag(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = disabled || uploadingRef.current ? 'none' : 'copy' }}
        onDragLeave={event => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false) }}
        onDrop={event => { event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false); void handleFiles(Array.from(event.dataTransfer.files)) }}
      >{controls}</Card> : <div className="flex flex-wrap items-center gap-2">{controls}</div>}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map((url) => (
            <div key={url} className="relative group">
              {!/\.(png|jpe?g|webp|gif)(?:[?#]|$)/i.test(url) ? (
                <a
                  href={url.startsWith('blob:') || /\.pdf(?:[?#]|$)/i.test(url) ? url : `${url}?download=${encodeURIComponent(names.current.get(url) ?? fileNameFromUrl(url))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-28 h-28 flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted hover:bg-accent transition-colors px-2"
                >
                  <FileText className="w-7 h-7 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground text-center truncate w-full" title={names.current.get(url) ?? fileNameFromUrl(url)}>{names.current.get(url) ?? fileNameFromUrl(url)}</span>
                </a>
              ) : (
                <div className="w-28 h-28 rounded-lg overflow-hidden border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={names.current.get(url) ?? 'ไฟล์แนบโจทย์'} className="w-full h-full object-cover" />
                </div>
              )}
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                disabled={disabled || uploading}
                aria-label={`นำไฟล์ ${names.current.get(url) ?? fileNameFromUrl(url)} ออก`}
                onClick={() => removeFile(url)}
                className="absolute top-1 right-1 min-h-[44px] min-w-[44px]"
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
