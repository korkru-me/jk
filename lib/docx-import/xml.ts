/**
 * A small XML reader for OOXML parts.
 *
 * `DOMParser` would do this in the browser, but the parsing here is the part
 * worth having tests around, and vitest runs on `environment: 'node'` with no
 * DOM in it (see vitest.config.mts). Rather than pull in a DOM implementation
 * for one module, this reads the subset OOXML actually uses: elements,
 * attributes, text, comments, CDATA and the XML declaration. No DTDs, no
 * entity definitions, no namespace resolution — tag names are kept exactly as
 * written (`w:p`, `a:blip`), which is how every caller here looks them up.
 */

export interface XmlNode {
  /** Qualified name as written in the document, e.g. `w:p`. */
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  /** Text directly inside this element, with entities decoded. */
  text: string
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeEntities(value: string): string {
  if (!value.includes('&')) return value
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      // Lone surrogates and out-of-range code points would throw; an entity we
      // cannot make sense of is better left as the author wrote it.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole
      try { return String.fromCodePoint(code) } catch { return whole }
    }
    const named = NAMED_ENTITIES[body]
    return named === undefined ? whole : named
  })
}

/** True for the characters XML allows to separate a tag name from attributes. */
function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

export class XmlError extends Error {}

/**
 * Parses one XML document and returns its root element.
 *
 * Malformed markup throws rather than guessing: every input here comes out of
 * a .docx that Word itself wrote, so a parse failure means the file is damaged
 * and the teacher needs to be told that, not handed half a document.
 */
export function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' }
  const stack: XmlNode[] = [root]
  let i = 0

  const readName = (): string => {
    const start = i
    while (i < source.length && !isSpace(source[i]) && source[i] !== '>' && source[i] !== '/') i++
    return source.slice(start, i)
  }

  const skipSpace = () => { while (i < source.length && isSpace(source[i])) i++ }

  while (i < source.length) {
    const lt = source.indexOf('<', i)

    if (lt === -1) break
    if (lt > i) {
      const raw = source.slice(i, lt)
      // Text belongs to whatever element is open. Between two elements it is
      // usually just the indentation Word writes, but `w:t` content arrives
      // here too and must be kept exactly, spaces included.
      stack[stack.length - 1].text += decodeEntities(raw)
    }
    i = lt

    if (source.startsWith('<?', i)) {
      const end = source.indexOf('?>', i)
      if (end === -1) throw new XmlError('XML declaration ไม่สมบูรณ์')
      i = end + 2
      continue
    }

    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i)
      if (end === -1) throw new XmlError('comment ใน XML ไม่สมบูรณ์')
      i = end + 3
      continue
    }

    if (source.startsWith('<![CDATA[', i)) {
      const end = source.indexOf(']]>', i)
      if (end === -1) throw new XmlError('CDATA ใน XML ไม่สมบูรณ์')
      stack[stack.length - 1].text += source.slice(i + 9, end)
      i = end + 3
      continue
    }

    // Any other `<!...>` — a DOCTYPE, most likely. Skipped whole.
    if (source.startsWith('<!', i)) {
      const end = source.indexOf('>', i)
      if (end === -1) throw new XmlError('declaration ใน XML ไม่สมบูรณ์')
      i = end + 1
      continue
    }

    if (source.startsWith('</', i)) {
      i += 2
      const name = readName()
      const end = source.indexOf('>', i)
      if (end === -1) throw new XmlError('closing tag ไม่สมบูรณ์')
      i = end + 1
      // A stray closing tag would otherwise pop the root and corrupt every
      // element after it.
      if (stack.length < 2 || stack[stack.length - 1].name !== name) {
        throw new XmlError(`closing tag ไม่ตรงกับ opening tag (${name})`)
      }
      stack.pop()
      continue
    }

    i++ // past '<'
    const name = readName()
    if (!name) throw new XmlError('พบ tag ที่ไม่มีชื่อ')
    const node: XmlNode = { name, attrs: {}, children: [], text: '' }

    for (;;) {
      skipSpace()
      if (i >= source.length) throw new XmlError(`tag <${name}> ไม่สมบูรณ์`)
      if (source[i] === '>' || source.startsWith('/>', i)) break

      const attrName = (() => {
        const start = i
        while (i < source.length && !isSpace(source[i]) && source[i] !== '=' && source[i] !== '>' && source[i] !== '/') i++
        return source.slice(start, i)
      })()
      skipSpace()
      if (source[i] !== '=') {
        // Valueless attributes are not legal XML, but refusing to parse the
        // whole document over one is worse than ignoring it.
        if (attrName) continue
        throw new XmlError(`attribute ใน <${name}> ไม่สมบูรณ์`)
      }
      i++
      skipSpace()
      const quote = source[i]
      if (quote !== '"' && quote !== "'") throw new XmlError(`ค่า attribute ใน <${name}> ไม่มีเครื่องหมายคำพูด`)
      i++
      const valueEnd = source.indexOf(quote, i)
      if (valueEnd === -1) throw new XmlError(`ค่า attribute ใน <${name}> ไม่สมบูรณ์`)
      node.attrs[attrName] = decodeEntities(source.slice(i, valueEnd))
      i = valueEnd + 1
    }

    stack[stack.length - 1].children.push(node)

    if (source.startsWith('/>', i)) {
      i += 2
    } else {
      i++ // past '>'
      stack.push(node)
    }
  }

  const element = root.children[0]
  if (!element) throw new XmlError('ไม่พบเนื้อหาใน XML')
  return element
}

// ─── Lookup helpers ──────────────────────────────────────────────────────────

export function firstChild(node: XmlNode, name: string): XmlNode | null {
  for (const child of node.children) if (child.name === name) return child
  return null
}

export function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter(child => child.name === name)
}

/**
 * The first descendant with this name, in document order.
 *
 * Depth-first and pre-order, so `firstDescendant(drawing, 'a:blip')` finds the
 * picture a `w:drawing` wraps however many layers of DrawingML sit in between.
 */
export function firstDescendant(node: XmlNode, name: string): XmlNode | null {
  for (const child of node.children) {
    if (child.name === name) return child
    const found = firstDescendant(child, name)
    if (found) return found
  }
  return null
}

/** Every descendant with this name, in document order. */
export function descendants(node: XmlNode, name: string): XmlNode[] {
  const found: XmlNode[] = []
  const visit = (current: XmlNode) => {
    for (const child of current.children) {
      if (child.name === name) found.push(child)
      visit(child)
    }
  }
  visit(node)
  return found
}

/**
 * Every bit of text under this element, concatenated.
 *
 * An element's own text comes before its children's, so genuinely mixed
 * content (`<a>one<b>two</b>three</a>`) would come back reordered as
 * "onethree" + "two". WordprocessingML has no mixed content — text lives in
 * leaf `w:t`/`m:t` elements and nowhere else — so this never arises on the
 * documents this module reads.
 */
export function textContent(node: XmlNode): string {
  let out = node.text
  for (const child of node.children) out += textContent(child)
  return out
}
