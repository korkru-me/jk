import { ExternalLink } from 'lucide-react'
import { normalizeFileAssignmentLink, type FileAssignmentResponse } from '@/lib/file-assignment'

export function FileAssignmentTextAndLink({ response }: { response: Pick<FileAssignmentResponse, 'text' | 'link'> }) {
  const link = normalizeFileAssignmentLink(response.link)
  return <>
    {response.text && <section className="min-w-0 space-y-1">
      <h3 className="text-xs font-medium text-muted-foreground">ข้อความที่ส่ง</h3>
      <p className="whitespace-pre-wrap wrap-anywhere text-sm">{response.text}</p>
    </section>}
    {link && <section className="min-w-0 space-y-1">
      <h3 className="text-xs font-medium text-muted-foreground">ลิงก์ที่แนบ</h3>
      <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full min-h-11 items-center gap-2 text-sm text-primary underline underline-offset-2">
        <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 wrap-anywhere">{link}</span>
      </a>
    </section>}
  </>
}
