'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { IOC_SIGNATURE_MAX_BYTES } from '@/lib/ioc-signature'

/** Wide enough to print cleanly on A4, small enough to stay under the cap. */
const MAX_WIDTH = 900

/**
 * A signature the reviewer already has as a photo or a scan.
 *
 * Whatever they pick is redrawn onto a canvas and handed back as PNG: the
 * bucket accepts PNG only, a phone photo is several megabytes before it is
 * touched, and re-encoding here means the server never has to decide whether a
 * file is what it claims to be.
 */
export function SignatureUpload({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, MAX_WIDTH / bitmap.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no canvas')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close?.()

      const dataUrl = canvas.toDataURL('image/png')
      // Roughly the decoded size: base64 carries three bytes in four characters.
      const bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)
      if (bytes > IOC_SIGNATURE_MAX_BYTES) {
        setError('รูปนี้ใหญ่เกินไปแม้ย่อแล้ว กรุณาใช้รูปที่ครอบเฉพาะลายเซ็น')
        setPreview(null)
        onChange(null)
        return
      }

      setPreview(dataUrl)
      onChange(dataUrl)
    } catch {
      setError('อ่านไฟล์รูปไม่ได้ กรุณาเลือกไฟล์ภาพ เช่น JPG หรือ PNG')
      setPreview(null)
      onChange(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />

      {preview ? (
        <div className="flex items-center justify-center rounded-xl border bg-muted p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="ลายเซ็นที่อัปโหลด" className="max-h-28" />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-muted p-6 text-center text-sm text-muted-foreground">
          เลือกรูปลายเซ็นจากเครื่องของท่าน · ควรเป็นรูปที่ครอบเฉพาะลายเซ็นบนพื้นขาว
        </div>
      )}

      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        {preview ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setPreview(null)
              onChange(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
          >
            เอารูปออก
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'กำลังอ่านรูป…' : preview ? 'เลือกรูปใหม่' : 'เลือกรูปลายเซ็น'}
        </Button>
      </div>
    </div>
  )
}
