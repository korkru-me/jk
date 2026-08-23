import katex from 'katex'

/**
 * Renders TeX written inside rich-text HTML.
 *
 * Question text is stored as HTML (tiptap) and rendered through
 * `dangerouslySetInnerHTML` in a handful of places. Teachers coming from
 * Moodle/MathJax write formulas as `\(v = u + at\)` inline or `\[...\]`
 * display, which used to show up verbatim as backslashes and braces. This
 * turns those spans into KaTeX markup before the HTML reaches the DOM, so
 * every existing render site keeps working unchanged — it stays a plain
 * string → string transform.
 *
 * Only the two backslash delimiters are recognised. `$...$` is deliberately
 * left alone: a lone dollar sign is ordinary text in a physics question
 * ("ราคา $5") and treating it as math would corrupt more than it fixes.
 */

// `[\s\S]` rather than `.` so display math may span lines. Non-greedy so two
// formulas in one paragraph don't get swallowed into a single span. Numbered
// groups rather than named ones — the project's tsconfig target predates them.
const MATH_PATTERN = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g

/** Entities survive inside the stored HTML; KaTeX needs the raw characters. */
function decodeEntities(tex: string): string {
  return tex
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

export function containsMath(html: string): boolean {
  return html.includes('\\(') || html.includes('\\[')
}

export function renderMathInHtml(html: string | null | undefined): string {
  if (!html || !containsMath(html)) return html ?? ''

  return html.replace(MATH_PATTERN, (whole: string, inline?: string, display?: string) => {
    const tex = inline ?? display ?? ''
    if (!tex.trim()) return whole
    try {
      return katex.renderToString(decodeEntities(tex), {
        displayMode: display !== undefined,
        throwOnError: false,
        // Malformed TeX renders in KaTeX's error colour instead of throwing,
        // so one bad formula can't blank out a whole question.
        errorColor: 'currentColor',
        // Default 'htmlAndMathml', not 'html': the visual layer is marked
        // aria-hidden, so dropping the MathML twin leaves the formula missing
        // from the accessibility tree entirely rather than merely unstyled.
        strict: false,
      })
    } catch {
      // Anything KaTeX still refuses stays as the author typed it.
      return whole
    }
  })
}
