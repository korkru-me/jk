import { renderMathInHtml } from '@/lib/math/latex'
import { sanitizeRichTextHtml } from '@/lib/rich-text-sanitize'

/**
 * What a render site hands to `dangerouslySetInnerHTML`: the teacher's HTML cut
 * back to what the editor writes (lib/rich-text-sanitize.ts), then its TeX
 * turned into KaTeX. The order matters — KaTeX's own markup (classes, inline
 * styles, MathML, SVG) is output we trust and would not survive the allow-list.
 */
export function renderRichTextHtml(html: string | null | undefined): string {
  return renderMathInHtml(sanitizeRichTextHtml(html ?? ''))
}
