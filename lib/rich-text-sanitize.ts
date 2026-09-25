/**
 * Teacher-written HTML, cut back to what the rich-text editor writes itself.
 *
 * โจทย์, เฉลย and choices are stored as HTML and put on the page through
 * `dangerouslySetInnerHTML` — on the exam page, that is every student's
 * browser. The Tiptap editor only ever writes harmless markup, but nothing
 * makes the stored HTML come from the editor: a teacher session can post any
 * string to a server action, or write the row straight through RLS, and an
 * `<img src=x onerror=…>` in it would run for everyone who opens the question.
 * So every render site passes the stored HTML through here first, by way of
 * `renderRichTextHtml` (lib/rich-text-html.ts), which adds KaTeX afterwards.
 * This module imports nothing, so the editor can share its picture rule
 * without pulling KaTeX along.
 *
 * It is an allow-list. An element stays only if the editor makes it, an
 * attribute only if the editor sets it and its value checks out. Anything else
 * is dropped with its text kept — except elements whose content is code or is
 * never shown (script, style, …), which go whole.
 *
 * Hand-written rather than DOMPurify, which needs a DOM: on the server that
 * would mean jsdom, and in the browser it would come out of the exam page's
 * JavaScript budget. It does not have to read HTML exactly as a browser does,
 * because nothing it reads goes back out as written: it writes only what it
 * keeps, with every attribute quoted and every stray `<` escaped. Markup it
 * misreads comes out as text or not at all — never as markup that a browser
 * could read differently.
 */

export interface RichTextHtmlPolicy {
  /** This project's Supabase origin: the one host a picture may load from. */
  storageOrigin: string | null
  /** Whether `blob:` pictures stay — how the local QA labs show an upload that never left the tab. */
  allowBlobImages: boolean
}

/** The elements the editor makes. What each may keep is in `keptAttributes`. */
const ALLOWED = new Set([
  'p', 'br', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub',
  'ul', 'ol', 'li', 'img',
  // Not on the toolbar, but StarterKit's Link and Code are on: a URL typed or
  // pasted becomes a link, and text between backticks becomes <code>.
  'a', 'code',
])

/** Allowed elements that start a line of their own. */
const BLOCKS = new Set(['p', 'ul', 'ol', 'li'])

/** Elements whose content is code or never shown to a reader — dropped together with it. */
const DROPPED_WHOLE = new Set([
  'script', 'style', 'template', 'iframe', 'noscript', 'noembed', 'noframes', 'textarea', 'title', 'xmp',
])

/**
 * Blocks the editor does not make — a Moodle import's divs and tables, a
 * heading pasted from a web page. Their text is kept on a line of its own, so
 * a table that loses its cells still reads row by row instead of running
 * together.
 */
const LINE_BLOCKS = new Set([
  'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'address', 'center',
  'section', 'article', 'header', 'footer', 'aside', 'nav', 'main', 'figure', 'figcaption',
  'table', 'caption', 'tr', 'dl', 'dt', 'dd', 'details', 'summary', 'form', 'fieldset', 'legend', 'hr',
])

/** Table cells: their text is kept apart from the next cell's. */
const CELLS = new Set(['td', 'th'])

/** Where a picture in the text has to live: this project's public `question-images` bucket. */
const IMAGE_PATH = '/storage/v1/object/public/question-images/'

export function sanitizeRichTextHtml(html: string, policy: RichTextHtmlPolicy = buildPolicy()): string {
  if (!html) return ''

  const out: string[] = []
  const open: string[] = []
  // A dropped block still ends its line, and a dropped cell its word. The
  // separator is owed until more text follows, so none is left hanging at the
  // start or end of a line.
  let owed = ''
  let midLine = false

  const owe = (separator: ' ' | '<br>') => {
    if (midLine && owed !== '<br>') owed = separator
  }

  const writeText = (text: string) => {
    if (/\S/.test(text)) {
      out.push(owed)
      owed = ''
      midLine = true
    }
    out.push(escapeText(text))
  }

  const closeThrough = (name: string) => {
    const at = open.lastIndexOf(name)
    if (at === -1) return
    while (open.length > at) {
      const closing = open.pop()!
      out.push(`</${closing}>`)
      if (BLOCKS.has(closing)) {
        owed = ''
        midLine = false
      }
    }
  }

  const startTag = (name: string, attributes: Array<[string, string]>) => {
    if (!ALLOWED.has(name)) {
      if (LINE_BLOCKS.has(name)) owe('<br>')
      return
    }
    const kept = keptAttributes(name, attributes, policy)
    if (kept === null) return
    if (name === 'br') {
      owed = ''
      midLine = false
      out.push('<br>')
      return
    }
    if (name === 'img') {
      out.push(owed, `<img${kept}>`)
      owed = ''
      midLine = true
      return
    }
    // A browser closes these by itself; closing them here too keeps the
    // output nested the way it will be read.
    if (BLOCKS.has(name) && open.includes('p')) closeThrough('p')
    if (name === 'li' && open.lastIndexOf('li') > Math.max(open.lastIndexOf('ul'), open.lastIndexOf('ol'))) {
      closeThrough('li')
    }
    if (name === 'a' && open.includes('a')) closeThrough('a')
    if (BLOCKS.has(name)) {
      owed = ''
      midLine = false
    }
    out.push(`<${name}${kept}>`)
    open.push(name)
  }

  const endTag = (name: string) => {
    if (ALLOWED.has(name)) closeThrough(name)
    else if (LINE_BLOCKS.has(name)) owe('<br>')
    else if (CELLS.has(name)) owe(' ')
  }

  let at = 0
  while (at < html.length) {
    const lt = html.indexOf('<', at)
    if (lt === -1) {
      writeText(html.slice(at))
      break
    }
    if (lt > at) writeText(html.slice(at, lt))
    const next = html.charAt(lt + 1)
    const closing = next === '/'
    if (isLetter(closing ? html.charAt(lt + 2) : next)) {
      const tag = readTag(html, lt + (closing ? 2 : 1))
      // Input that ends inside a tag loses the tag, in a browser too.
      if (!tag) break
      at = tag.end
      if (closing) endTag(tag.name)
      else if (tag.name === 'plaintext') break
      else if (DROPPED_WHOLE.has(tag.name)) at = skipPastEndTag(html, tag.name, at)
      else startTag(tag.name, tag.attributes)
    } else if (html.startsWith('<!--', lt)) {
      at = commentEnd(html, lt + 4)
    } else if (next === '!' || next === '?' || (closing && lt + 2 < html.length)) {
      // <!DOCTYPE …>, <![CDATA[ …, <?xml …?> and </ followed by anything but
      // a letter are read as comments that end at the next `>`.
      const gt = html.indexOf('>', lt + 2)
      at = gt === -1 ? html.length : gt + 1
    } else {
      writeText(closing ? '</' : '<')
      at = lt + (closing ? 2 : 1)
    }
  }

  while (open.length) out.push(`</${open.pop()}>`)
  return out.join('')
}

/**
 * Whether a picture may sit in rich text. One rule for both ends: the editor
 * asks it which pasted pictures to keep, and the sanitiser keeps no other.
 */
export function isRichTextImageSrc(src: string, policy: RichTextHtmlPolicy = buildPolicy()): boolean {
  return imageSource(src, policy) !== null
}

/**
 * The same clean-up for a server action about to store editor HTML — โจทย์ and
 * เฉลย typed into the rich-text editor. The render sites sanitise regardless,
 * since RLS lets a teacher write the row without any server action, so this is
 * housekeeping rather than the boundary: stored rows stay free of markup the
 * page would only drop again, and of `blob:` pictures that are dead once the
 * tab closes.
 *
 * Only for fields the editor fills. A plain-text field reads `x<y` as the
 * teacher typed it, and cleaning it as HTML would throw half of it away.
 * Text without a tag comes back exactly as given, and a value left with no tag
 * at all keeps a paragraph around it: bare `a &lt; b` would otherwise be read
 * as plain text by RichText and shown with the entity spelled out.
 */
export function sanitizeRichTextForStorage(html: string): string {
  if (!/<[A-Za-z!/?]/.test(html)) return html
  const clean = sanitizeRichTextHtml(html, { ...buildPolicy(), allowBlobImages: false })
  return /<[a-z]/.test(clean) || !clean.includes('&') ? clean : `<p>${clean}</p>`
}

/**
 * `NEXT_PUBLIC_…` and `NODE_ENV` are inlined into the browser bundle, so the
 * server render and the browser agree on every picture and hydration matches.
 * `blob:` pictures stay only in a development build: that is where the QA labs
 * keep uploads in the tab's memory, and a stored `blob:` URL is dead anywhere
 * else.
 */
function buildPolicy(): RichTextHtmlPolicy {
  let storageOrigin: string | null = null
  try {
    storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin
  } catch {
    // Not configured: no picture can be vouched for, so none is kept.
  }
  return { storageOrigin, allowBlobImages: process.env.NODE_ENV !== 'production' }
}

/**
 * The attributes an allowed element keeps, written out ready to follow its
 * name — or null when the element has to go: a link or a picture that points
 * somewhere it may not. A link's text stays; a picture has none.
 */
function keptAttributes(
  name: string,
  attributes: Array<[string, string]>,
  policy: RichTextHtmlPolicy,
): string | null {
  // A repeated attribute counts once, the first time, as it does in a browser.
  const value = (key: string) => attributes.find(([attribute]) => attribute === key)?.[1]

  if (name === 'a') {
    const href = linkHref(value('href'))
    // The same target/rel Tiptap writes on every link, whatever came in.
    return href === null ? null : ` target="_blank" rel="noopener noreferrer nofollow" href="${escapeUrl(href)}"`
  }

  if (name === 'img') {
    const src = imageSource(value('src'), policy)
    if (src === null) return null
    let kept = ` src="${escapeUrl(src)}"`
    const alt = value('alt')
    if (alt !== undefined) kept += ` alt="${escapeAttribute(alt)}"`
    // The size the teacher dragged the picture to, in plain CSS pixels.
    for (const size of ['width', 'height']) {
      const pixels = value(size)
      if (pixels !== undefined && /^\d{1,5}$/.test(pixels)) kept += ` ${size}="${pixels}"`
    }
    return kept
  }

  if (name === 'ol') {
    // A list the teacher started at "3." keeps its numbering.
    const start = value('start')
    const type = value('type')
    return (start !== undefined && /^\d{1,6}$/.test(start) ? ` start="${start}"` : '')
      + (type !== undefined && /^[1aAiI]$/.test(type) ? ` type="${type}"` : '')
  }

  return ''
}

/** A link's target: web pages and e-mail only, never `javascript:` or `data:`. */
function linkHref(raw: string | undefined): string | null {
  const url = parseUrl(raw)
  if (!url) return null
  if (url.protocol === 'mailto:') return url.href
  const web = url.protocol === 'https:' || url.protocol === 'http:'
  // user:password@ in a link is a way to make one host read as another.
  return web && !url.username && !url.password ? url.href : null
}

/** A picture's source: a file in this project's question-images bucket, or a lab's `blob:`. */
function imageSource(raw: string | undefined, policy: RichTextHtmlPolicy): string | null {
  const url = parseUrl(raw)
  if (!url) return null
  if (url.protocol === 'blob:') return policy.allowBlobImages ? url.href : null
  // Host as well as path: https://evil.example/storage/v1/object/public/…
  // carries the same path (docs/SECURITY.md, uploads).
  if (url.protocol !== 'https:' || url.origin !== policy.storageOrigin) return null
  if (url.username || url.password || url.search || url.hash || !url.pathname.startsWith(IMAGE_PATH)) return null
  const key = url.pathname.slice(IMAGE_PATH.length)
  // Storage decodes the key, so an encoded slash could still reach another bucket.
  if (/%2f|%5c/i.test(key) || key.split('/').some(part => !part || part === '.' || part === '..')) return null
  return url.href
}

/** An absolute URL from an attribute value, once its character references are decoded. */
function parseUrl(raw: string | undefined): URL | null {
  if (raw === undefined) return null
  try {
    return new URL(decodeReferences(raw))
  } catch {
    return null
  }
}

const NAMED_REFERENCES = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"], ['nbsp', ' '],
])

/**
 * Character references in an attribute value, decoded far enough to judge a
 * URL: `&#106;avascript:` must be seen as `javascript:`. Named ones outside
 * the handful a URL has any use for are left as written, which leaves the URL
 * broken rather than decoded into something that was not checked — what gets
 * written back is the URL as checked here, not the original spelling.
 */
function decodeReferences(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));?/g,
    (reference: string, decimal?: string, hex?: string, name?: string) => {
      if (name) return (reference.endsWith(';') && NAMED_REFERENCES.get(name)) || reference
      const code = decimal ? parseInt(decimal, 10) : parseInt(hex ?? '', 16)
      const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
      return valid ? String.fromCodePoint(code) : '�'
    },
  )
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\u0000': '' }

function escapeChar(char: string): string {
  return ESCAPES[char]
}

/**
 * Text as it is written back: `<` and `>` escaped, and `&` too unless it
 * already starts a character reference. A reference can only ever decode to
 * text, so `&deg;` and `&lt;` pass through as the author wrote them.
 */
function escapeText(text: string): string {
  return text.replace(/&(?!(?:[A-Za-z][A-Za-z0-9]*|#\d+|#[xX][0-9a-fA-F]+);)|[<>\u0000]/g, escapeChar)
}

/** A free-text attribute value (alt), written back between double quotes. */
function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

/** A URL that was decoded and checked: every `&` in it is a real one by now. */
function escapeUrl(url: string): string {
  return url.replace(/[&<>"]/g, escapeChar)
}

interface Tag {
  name: string
  attributes: Array<[string, string]>
  /** Index just past the tag's closing `>`. */
  end: number
}

/**
 * One tag, read from just after its `<` or `</` the way a browser's tokenizer
 * would: names lower-cased, `/` between attributes ignored, a `>` inside a
 * quoted value not ending the tag. Null when the input ends inside it.
 */
function readTag(html: string, from: number): Tag | null {
  let at = from
  while (at < html.length && !endsName(html.charAt(at))) at++
  const name = html.slice(from, at).toLowerCase()
  const attributes: Array<[string, string]> = []

  for (;;) {
    while (at < html.length && (isSpace(html.charAt(at)) || html.charAt(at) === '/')) at++
    if (at >= html.length) return null
    if (html.charAt(at) === '>') return { name, attributes, end: at + 1 }

    // A leading `=` is part of the name, as it is in a browser.
    const nameStart = at++
    while (at < html.length && !endsName(html.charAt(at)) && html.charAt(at) !== '=') at++
    const attribute = html.slice(nameStart, at).toLowerCase()
    while (at < html.length && isSpace(html.charAt(at))) at++

    let value = ''
    if (html.charAt(at) === '=') {
      at++
      while (at < html.length && isSpace(html.charAt(at))) at++
      const quote = html.charAt(at)
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, at + 1)
        if (close === -1) return null
        value = html.slice(at + 1, close)
        at = close + 1
      } else {
        const valueStart = at
        while (at < html.length && !isSpace(html.charAt(at)) && html.charAt(at) !== '>') at++
        value = html.slice(valueStart, at)
      }
    }
    attributes.push([attribute, value])
  }
}

/** Just past `</name…>` from `from` on: a raw-text element's content is never markup, so it is skipped unread. */
function skipPastEndTag(html: string, name: string, from: number): number {
  const endTag = new RegExp(`</${name}[\\t\\n\\f\\r />]`, 'gi')
  endTag.lastIndex = from
  const match = endTag.exec(html)
  if (!match) return html.length
  const gt = html.indexOf('>', match.index)
  return gt === -1 ? html.length : gt + 1
}

/** Where a comment opened just before `from` ends. `<!-->` and `<!--->` close at once, as in a browser. */
function commentEnd(html: string, from: number): number {
  if (html.charAt(from) === '>') return from + 1
  if (html.startsWith('->', from)) return from + 2
  const end = /--!?>/g
  end.lastIndex = from
  const match = end.exec(html)
  return match ? match.index + match[0].length : html.length
}

function isSpace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\t' || char === '\r' || char === '\f'
}

function isLetter(char: string): boolean {
  return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
}

/** What ends a tag or attribute name. */
function endsName(char: string): boolean {
  return isSpace(char) || char === '/' || char === '>'
}
