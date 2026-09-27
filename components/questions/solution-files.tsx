import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { splitSolutionAttachments } from '@/lib/solution-attachments'

/**
 * A เฉลย's files as a reader meets them: pictures — board pictures among
 * them — inline, and PDFs as links that open in a new tab.
 *
 * Every page that shows a เฉลย renders this, so a PDF never reaches an
 * `<img>` and shows up as a broken picture.
 */
export function SolutionFiles({ urls, imageClassName, alt = 'รูปเฉลย' }: {
  urls: readonly string[] | null | undefined
  /** Sizes the pictures for the page they sit on. */
  imageClassName: string
  alt?: string
}) {
  const { images, pdfs } = splitSolutionAttachments(urls ?? [])
  if (images.length === 0 && pdfs.length === 0) return null

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map(url => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt={alt} loading="lazy" decoding="async" className={imageClassName} />
          ))}
        </div>
      )}
      {pdfs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pdfs.map((url, index) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium',
                'transition-colors hover:bg-muted',
              )}
            >
              <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
              เปิดเฉลย PDF{pdfs.length > 1 ? ` ${index + 1}` : ''}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
