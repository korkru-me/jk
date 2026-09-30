import { cn } from '@/lib/utils'
import { containsMath } from '@/lib/math/latex'
import { renderRichTextHtml } from '@/lib/rich-text-html'

// Renders text that may be plain or rich-text HTML (from RichTextEditor).
// [&_p]:inline keeps the wrapping <p> from tiptap from breaking inline layout.
// HTML is cut back to what the editor writes before it reaches the page —
// nothing guarantees the stored text came from the editor — and TeX written
// as \(...\) / \[...\] is then rendered through KaTeX, which also means text
// with no tags but with math still takes the HTML path.
//
// `blocks` is for text read as a page rather than inside a sentence — a
// เฉลย: its paragraphs keep their own lines, and a picture placed in the text
// stands on its own line at the width it was given, never wider than the page.
export function RichText({ text, className, blocks = false }: { text: string; className?: string; blocks?: boolean }) {
  if (!text) return null
  if (/<[a-z][\s\S]*>/i.test(text) || containsMath(text)) {
    const html = { __html: renderRichTextHtml(text) }
    if (blocks) {
      return (
        <div
          className={cn('[&_p]:my-1 [&_img]:my-2 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md', className)}
          dangerouslySetInnerHTML={html}
        />
      )
    }
    return <span className={cn('[&_p]:inline [&_img]:inline-block [&_img]:h-auto [&_img]:max-w-full', className)} dangerouslySetInnerHTML={html} />
  }
  return blocks ? <div className={className}>{text}</div> : <span className={className}>{text}</span>
}
