import { cn } from '@/lib/utils'

// Renders text that may be plain or rich-text HTML (from RichTextEditor).
// [&_p]:inline keeps the wrapping <p> from tiptap from breaking inline layout.
export function RichText({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return <span className={cn('[&_p]:inline', className)} dangerouslySetInnerHTML={{ __html: text }} />
  }
  return <span className={className}>{text}</span>
}
