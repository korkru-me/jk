/**
 * The rich text of a question, flattened into something Word can hold.
 *
 * Prompts and choices come out of the question bank as the HTML the editor
 * produced. The printed A4 document hands that straight to the browser, which
 * knows what to do with it; a .docx file has no such luxury — it is a zip of
 * XML with its own vocabulary, so the markup has to be turned into paragraphs
 * and runs before `docx` can lay it out.
 *
 * The tag set here is the one the editor actually emits, not all of HTML.
 * Anything else is dropped rather than guessed at: a stray `<span>` that
 * silently swallowed its own text would be worse than a stray `<span>` that
 * simply contributes nothing to the styling.
 */

export interface DocxRunStyle {
  bold?: boolean
  italics?: boolean
  underline?: boolean
  superScript?: boolean
  subScript?: boolean
}

export interface DocxRun extends DocxRunStyle {
  text: string
}

export interface DocxParagraph {
  runs: DocxRun[]
  /** List items keep their marker; everything else is a plain paragraph. */
  bullet: boolean
}

/** Inline tags map onto a run property; everything else only affects flow. */
const INLINE_STYLES: Record<string, keyof DocxRunStyle> = {
  b: 'bold',
  strong: 'bold',
  i: 'italics',
  em: 'italics',
  u: 'underline',
  ins: 'underline',
  sup: 'superScript',
  sub: 'subScript',
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'tr', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre',
])

/**
 * An image cannot travel into the document this way: it lives in Supabase
 * Storage behind a URL, and a Word file has to carry its own bytes. Saying so
 * in the cell is the honest option — a silently missing figure turns an exam
 * item into a question nobody can answer.
 */
export const IOC_DOCX_IMAGE_PLACEHOLDER = '[รูปภาพในโจทย์ — ดูจากไฟล์ PDF หรือในเว็บ]'

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  times: '×',
  divide: '÷',
  minus: '−',
  deg: '°',
}

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body.startsWith('#x') || body.startsWith('#X')
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10)
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) return String.fromCodePoint(code)
      return whole
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

/**
 * Collapse runs of whitespace the way HTML does, but keep the non-breaking
 * space: the source documents use it to indent the "0" of the +1 / 0 / −1
 * scale, and turning it into an ordinary space would lose that alignment.
 */
function normalizeText(text: string): string {
  return decodeHtmlEntities(text).replace(/[ \t\r\n]+/g, ' ')
}

export function htmlToDocxParagraphs(html: string | null | undefined): DocxParagraph[] {
  if (!html) return []

  const paragraphs: DocxParagraph[] = []
  let runs: DocxRun[] = []
  let bullet = false
  const styleStack: (keyof DocxRunStyle)[] = []

  const currentStyle = (): DocxRunStyle => {
    const style: DocxRunStyle = {}
    for (const key of styleStack) style[key] = true
    return style
  }

  const blank = (text: string): boolean => /^[ \t\r\n]*$/.test(text)

  const flush = () => {
    // Trim the paragraph's own edges without touching the spaces between runs.
    // A non-breaking space is content, not padding, so `blank` leaves it alone.
    while (runs.length > 0 && blank(runs[0].text)) runs.shift()
    while (runs.length > 0 && blank(runs[runs.length - 1].text)) runs.pop()
    if (runs.length > 0) paragraphs.push({ runs, bullet })
    runs = []
    bullet = false
  }

  const pushText = (raw: string) => {
    const text = normalizeText(raw)
    if (text === '') return
    // Leading whitespace at the very start of a paragraph is layout, not content.
    if (runs.length === 0 && blank(text)) return
    runs.push({ text, ...currentStyle() })
  }

  const TOKEN = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|<!--[\s\S]*?-->/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = TOKEN.exec(html)) !== null) {
    if (match.index > cursor) pushText(html.slice(cursor, match.index))
    cursor = match.index + match[0].length

    const tag = match[1]?.toLowerCase()
    if (!tag) continue
    const closing = match[0].startsWith('</')

    if (tag === 'br') {
      flush()
      continue
    }
    if (tag === 'img') {
      pushText(IOC_DOCX_IMAGE_PLACEHOLDER)
      continue
    }

    const style = INLINE_STYLES[tag]
    if (style) {
      if (closing) {
        const at = styleStack.lastIndexOf(style)
        if (at >= 0) styleStack.splice(at, 1)
      } else if (!match[0].endsWith('/>')) {
        styleStack.push(style)
      }
      continue
    }

    if (BLOCK_TAGS.has(tag)) {
      flush()
      if (!closing && tag === 'li') bullet = true
      continue
    }
    // Table cells sit side by side on screen; in a Word cell they read better
    // as a single line, so they are separated rather than stacked.
    if ((tag === 'td' || tag === 'th') && !closing && runs.length > 0) {
      pushText(' ')
    }
  }

  if (cursor < html.length) pushText(html.slice(cursor))
  flush()

  return paragraphs
}

/** The same content as one line of plain text, for cells that cannot wrap. */
export function htmlToPlainText(html: string | null | undefined): string {
  return htmlToDocxParagraphs(html)
    .map(paragraph => paragraph.runs.map(run => run.text).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
