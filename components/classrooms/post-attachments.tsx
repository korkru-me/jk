'use client'

import { useState } from 'react'
import { Download, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  attachmentKindLabel, formatFileSize, isImageAttachment, shortenFileName,
  type PostAttachment,
} from '@/lib/attachment-display'
import { cn } from '@/lib/utils'

function AnnouncementImage({ image }: { image: PostAttachment }) {
  const [failed, setFailed] = useState(false)

  return (
    <Dialog onOpenChange={open => { if (open) setFailed(false) }}>
      <DialogTrigger
        aria-label={`ขยายรูป ${image.name}`}
        render={<Button type="button" variant="ghost" className="block h-auto w-full cursor-zoom-in p-0" />}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.name}
          loading="lazy"
          className="w-full max-h-56 rounded-xl object-cover border border-border hover:opacity-90 transition-opacity"
        />
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="w-fit max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]"
      >
        <DialogTitle className="sr-only">{image.name}</DialogTitle>
        <DialogDescription className="sr-only">
          รูปประกาศขนาดใหญ่ กดพื้นที่นอกรูป ปุ่มปิด หรือ Esc เพื่อปิด
        </DialogDescription>
        {failed ? (
          <p role="alert" className="max-w-sm px-6 py-12 text-center text-muted-foreground">
            โหลดรูปไม่สำเร็จ กรุณาปิดแล้วลองเปิดอีกครั้ง
          </p>
        ) : (
          // Keep the original URL and aspect ratio; only the thumbnail is cropped.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.name}
            onError={() => setFailed(true)}
            className="block h-auto w-auto max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] object-contain"
          />
        )}
        <DialogClose
          render={
            <Button type="button" variant="outline" size="icon-lg" className="absolute right-2 top-2 size-11" aria-label="ปิดรูปขยาย" />
          }
        >
          <X aria-hidden="true" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}

/** Images open in place; other attachments retain Storage's original filename download. */
export function PostAttachments({ attachments }: { attachments: PostAttachment[] }) {
  if (attachments.length === 0) return null
  const images = attachments.filter(a => isImageAttachment(a.mime))
  const files = attachments.filter(a => !isImageAttachment(a.mime))

  return (
    <div className="mt-2.5 space-y-2">
      {images.length > 0 && (
        <div className={cn('grid gap-2', images.length === 1 ? 'grid-cols-1 max-w-sm' : 'grid-cols-2 max-w-md')}>
          {images.map(image => <AnnouncementImage key={image.url} image={image} />)}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map(file => (
            <a
              key={file.url}
              href={`${file.url}?download=${encodeURIComponent(file.name)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 max-w-64 rounded-xl border border-border bg-muted px-3 py-2 hover:bg-accent transition-colors"
            >
              <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="min-w-0">
                <span className="block text-xs font-medium truncate">{shortenFileName(file.name, 28)}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {attachmentKindLabel(file.mime, file.name)}
                  {file.size > 0 ? ` · ${formatFileSize(file.size)}` : ''}
                </span>
              </span>
              <Download className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
