'use client'

import { Paperclip } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { QuestionPdfAttachment } from '@/components/classrooms/post-pdf-preview'
import { isPdfAttachmentUrl } from '@/lib/post-pdf-preview'
import { instructionAttachmentName } from '@/lib/question-file-selection'
import { cn } from '@/lib/utils'

export function InstructionAttachment({ url, localOnly = false }: { url: string; localOnly?: boolean }) {
  if (isPdfAttachmentUrl(url)) return <QuestionPdfAttachment url={url} localOnly={localOnly} />
  const name = instructionAttachmentName(url)
  if (!/^https?:\/\//i.test(url) && !(localOnly && url.startsWith('blob:'))) return <span className="text-sm text-destructive">ไฟล์แนบไม่ถูกต้อง</span>
  if (/\.(png|jpe?g|webp|gif)(?:[?#]|$)/i.test(url)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="max-h-32 max-w-full rounded-lg border border-border object-contain" />
  }
  const href = url.startsWith('blob:') ? url : `${url}?download=${encodeURIComponent(name)}`
  return <a href={href} download={name} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'secondary' }), 'h-auto min-h-[44px] max-w-full py-2')}>
    <Paperclip data-icon="inline-start" /><span className="min-w-0 truncate" title={name}>{name}</span>
  </a>
}
