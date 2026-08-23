import { cn } from '@/lib/utils'
import { containsMath, renderMathInHtml } from '@/lib/math/latex'

// Renders text that may be plain or rich-text HTML (from RichTextEditor).
// [&_p]:inline keeps the wrapping <p> from tiptap from breaking inline layout.
// TeX written as \(...\) / \[...\] is rendered through KaTeX first, which also
// means text with no tags but with math still takes the HTML path.
export function RichText({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  if (/<[a-z][\s\S]*>/i.test(text) || containsMath(text)) {
    return (
      <span
        className={cn('[&_p]:inline', className)}
        dangerouslySetInnerHTML={{ __html: renderMathInHtml(text) }}
      />
    )
  }
  return <span className={className}>{text}</span>
}
