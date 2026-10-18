'use client'

import { useEffect, useState } from 'react'
import { FileText, LoaderCircle } from 'lucide-react'
import { examAttachmentDefinition } from '@/lib/exam-attachment'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { gradingAssetUrl } from './grading-asset-url'

const MAX_FILE_UPLOAD_BYTES = examAttachmentDefinition('submission_file').maxBytes

/** Open automatically, but only validated PDF bytes ever enter the iframe. */
export function GradingPdfPreview({ url, name }: { url: string; name: string }) {
  const safe = gradingAssetUrl(url)
  const [pdf, setPdf] = useState<{ source: string; objectUrl: string } | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!safe) return
    const abort = new AbortController()
    let objectUrl: string | null = null
    setPdf(null); setError(false)
    void (async () => {
      try {
        const response = await fetch(safe, { signal: abort.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' })
        const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
        const contentLength = response.headers.get('content-length')
        if (!response.ok || !['application/pdf', 'application/octet-stream'].includes(mime ?? '') || (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_FILE_UPLOAD_BYTES)) || !response.body) throw new Error('invalid PDF')
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let total = 0
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            total += value.byteLength
            if (total > MAX_FILE_UPLOAD_BYTES) { await reader.cancel(); throw new Error('oversized PDF') }
            chunks.push(value)
          }
        } finally { reader.releaseLock() }
        const bytes = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('invalid PDF')
        if (abort.signal.aborted) return
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        setPdf({ source: safe, objectUrl })
      } catch { if (!abort.signal.aborted) setError(true) }
    })()
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [safe, retry])

  if (!safe) return <p className="text-xs text-muted-foreground">ไม่สามารถแสดงไฟล์ {name} ได้</p>
  const currentPdf = pdf?.source === safe ? pdf.objectUrl : null
  return <figure className="flex min-w-0 flex-col gap-1">
    <Card radius="sm" className="@container/pdf-preview overflow-hidden">
      {/* Chrome's native PDF viewer is blocked inside a sandboxed iframe. Only the validated, typed PDF Blob reaches this viewer. */}
      {currentPdf ? <iframe src={`${currentPdf}#toolbar=0&navpanes=0`} title={`ไฟล์คำตอบ ${name}`} referrerPolicy="no-referrer" className="h-[min(32rem,60dvh,142cqw)] w-full border-0" /> : error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"><p>เปิด PDF ไม่สำเร็จ ไฟล์ต้องเป็น PDF ขนาดไม่เกิน {MAX_FILE_UPLOAD_BYTES / 1024 / 1024} MB</p><Button type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={() => setRetry(value => value + 1)}>ลองอีกครั้ง</Button></div> : <p role="status" className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />กำลังเปิด PDF…</p>}
    </Card>
    <figcaption className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><FileText className="size-3.5" aria-hidden="true" />{name}{currentPdf && <a href={currentPdf} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">เปิดไฟล์เต็ม</a>}</figcaption>
  </figure>
}
