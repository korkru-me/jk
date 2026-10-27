'use client'

import { useEffect, useState } from 'react'
import { Download, Eye, FileText, LoaderCircle, Maximize2, Minimize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { formatFileSize, shortenFileName, type PostAttachment } from '@/lib/attachment-display'
import { postPdfSource, readPostPdf } from '@/lib/post-pdf-preview'
import { cn } from '@/lib/utils'

function PdfDocument({ source, name }: { source: string | null; name: string }) {
  const [pdf, setPdf] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [unsupported, setUnsupported] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!source) return
    if (navigator.pdfViewerEnabled === false) { setUnsupported(true); return }
    const abort = new AbortController()
    let objectUrl: string | null = null
    setPdf(null)
    setError(false)
    void (async () => {
      try {
        // The protected Staging fixture needs its same-origin hosting session;
        // Storage requests never include browser credentials.
        const response = await fetch(source, { signal: abort.signal, credentials: source.startsWith('/') ? 'same-origin' : 'omit', cache: 'no-store', redirect: 'error' })
        const blob = await readPostPdf(response)
        if (abort.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setPdf(objectUrl)
      } catch { if (!abort.signal.aborted) setError(true) }
    })()
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [source, retry])

  if (unsupported) return <p role="status" className="p-4 text-sm text-muted-foreground">เบราว์เซอร์นี้ไม่รองรับตัวอย่าง PDF กดปุ่มดาวน์โหลดเพื่อเปิดไฟล์ได้</p>
  if (!source || error) return <div role="alert" className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
    <p>เปิดตัวอย่าง PDF ไม่สำเร็จ กรุณาลองใหม่หรือกดดาวน์โหลดไฟล์</p>
    {source && <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setRetry(value => value + 1)}>ลองอีกครั้ง</Button>}
  </div>
  // Native PDF readers need an unsandboxed iframe. Stored URLs/HTML never enter it;
  // only a MIME/signature-validated, size-limited local PDF Blob is embedded.
  if (pdf) return <iframe src={`${pdf}#toolbar=0&navpanes=0&view=FitH`} title={`ตัวอย่าง PDF ${name}`} referrerPolicy="no-referrer" className="min-h-0 w-full flex-1 border-0" />
  return <p role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />กำลังเปิด PDF…</p>
}

export function PostPdfAttachment({ file }: { file: PostAttachment }) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const source = postPdfSource(file.url)
  const downloadHref = source ? `${source}${source.includes('?') ? '&' : '?'}download=${encodeURIComponent(file.name)}` : undefined

  return <Dialog open={open} onOpenChange={nextOpen => {
    setOpen(nextOpen)
    if (!nextOpen) setExpanded(false)
  }}>
    <DialogTrigger aria-label={`ดูตัวอย่าง PDF ${file.name}`} render={<Button type="button" variant="secondary" className="h-auto min-h-[44px] max-w-64 justify-start gap-2 px-3 py-2 text-left" />}>
      <FileText aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{shortenFileName(file.name, 28)}</span>
        <span className="block text-[10px] text-muted-foreground">PDF{file.size > 0 ? ` · ${formatFileSize(file.size)}` : ''}</span>
      </span>
      <Eye aria-hidden="true" />
    </DialogTrigger>
    <DialogContent showCloseButton={false} forceRenderOverlay className={cn(
      'flex flex-col gap-0 overflow-hidden p-0',
      expanded
        ? 'h-dvh max-h-dvh w-screen max-w-none rounded-none sm:max-w-none'
        : 'h-[min(48rem,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-5xl sm:max-w-5xl',
    )} data-post-pdf-preview data-expanded={expanded}>
      <header className="flex min-w-0 items-center gap-2 border-b border-border p-3">
        <DialogTitle className="min-w-0 flex-1 truncate text-sm" title={file.name}>{file.name}</DialogTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] shrink-0"
          aria-label={expanded ? 'ย่อกลับ' : 'ขยายเต็มหน้าจอ'}
          aria-pressed={expanded}
          title={expanded ? 'ย่อกลับ' : 'ขยายเต็มหน้าจอ'}
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? <Minimize2 aria-hidden="true" data-icon="inline-start" /> : <Maximize2 aria-hidden="true" data-icon="inline-start" />}
          <span className="hidden sm:inline">{expanded ? 'ย่อกลับ' : 'ขยายเต็มหน้าจอ'}</span>
        </Button>
        <Button variant="outline" size="sm" className="min-h-[44px] min-w-[44px]" disabled={!downloadHref} aria-label={`ดาวน์โหลด ${file.name}`} render={downloadHref ? <a href={downloadHref} download={file.name} target="_blank" rel="noopener noreferrer" /> : undefined}>
          <Download aria-hidden="true" data-icon="inline-start" /><span className="hidden sm:inline">ดาวน์โหลด</span>
        </Button>
        <DialogClose aria-label="ปิดตัวอย่าง PDF" render={<Button type="button" variant="ghost" size="icon" className="size-[44px]" />}><X aria-hidden="true" /></DialogClose>
      </header>
      <DialogDescription className="sr-only">ตัวอย่างไฟล์ PDF คลิกด้านนอก กดปุ่มปิด หรือ Escape เพื่อปิด กดขยายเต็มหน้าจอหรือย่อกลับได้จากปุ่มบนหัวกรอบ ดาวน์โหลดไฟล์ได้จากปุ่มดาวน์โหลด</DialogDescription>
      <div className="flex min-h-0 flex-1 flex-col bg-muted/30">{open && <PdfDocument key={source} source={source} name={file.name} />}</div>
    </DialogContent>
  </Dialog>
}
