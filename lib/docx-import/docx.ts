/**
 * `word/document.xml` reduced to the handful of things a โจทย์ is made of:
 * paragraphs, tables, runs with the formatting that carries meaning, pictures,
 * equations, and which list number Word is printing in front of each paragraph.
 *
 * Two of those are easy to overlook and both change the result:
 *
 *   Numbering. "1." "2." "3." are almost never typed. Word stores a list
 *   membership on the paragraph and renders the digits itself, so the text
 *   extracted from a worksheet has no question numbers in it at all. The list
 *   level is what says where one โจทย์ ends and the next begins, and a deeper
 *   level is what says "this is ก) ข) ค) inside the โจทย์ above".
 *
 *   Colour. A teacher marking the correct choice in red is writing the answer
 *   key in formatting rather than in words. Copy the text out and the key is
 *   gone; read `w:color` and the key comes across for free.
 */
import { firstChild, firstDescendant, descendants, parseXml, type XmlNode } from './xml'
import { ommlToTex } from './omml'

export interface RunFormat {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  /** `RRGGBB`, or '' when the run states no colour of its own. */
  color: string
  /** Word's highlight name (`yellow`, `green`, …), or ''. */
  highlight: string
  vertAlign: 'superscript' | 'subscript' | ''
}

export type DocxInline =
  | { kind: 'text'; text: string; format: RunFormat }
  | { kind: 'math'; value: string; plain: string; structured: boolean }
  | { kind: 'image'; relId: string; floating: boolean; width: number; height: number }
  | { kind: 'break' }
  | { kind: 'tab' }

/**
 * A shape drawn on top of the page: a text box, or a line joining one to
 * something.
 *
 * Kept apart from `inlines` rather than folded into them, because a floating
 * shape is not part of the sentence it happens to be anchored to. Folded in, a
 * decorative box beside a ปรนัย ข้อ would arrive inside the question's words on
 * every one of the seven types that already read, none of which asked for it.
 * Only the reader that needs them looks here.
 *
 * This is how a เติมคำในรูป worksheet is written: the blanks the student fills
 * are text boxes standing on the picture, joined to the thing they point at by
 * a line. Word tells the two apart itself — a line is a *connector*, which is a
 * different kind of shape and not a blank.
 */
export interface DocxShape {
  /** What is written in the box. Empty for a line, and for a blank box on a
   *  student's copy of a worksheet — which is a blank with no เฉลย, not a
   *  shape to ignore. */
  inlines: DocxInline[]
  /** Word's own flag for a joining line. Never a blank. */
  connector: boolean
  /** Offset from the left of the text column, in EMU, or null when Word
   *  positioned the shape by alignment instead. Comparable with an inline
   *  picture's width, because a picture in a paragraph of its own starts at
   *  that same left edge. */
  x: number | null
  /** Offset from the top of the paragraph the shape is anchored to, in EMU.
   *  Only comparable between shapes anchored to the *same* paragraph: what
   *  falls between two paragraphs is a matter of how Word lays the page out,
   *  which is not written down anywhere in the file. */
  y: number | null
  /** Size in EMU. */
  width: number
  height: number
}

export interface DocxParagraph {
  kind: 'paragraph'
  inlines: DocxInline[]
  /** Floating shapes anchored to this paragraph, in document order. */
  shapes: DocxShape[]
  /** The `w:numId` of the list this paragraph belongs to, or null. */
  numId: string | null
  /** List depth: 0 is the outer level, 1 the first nested one. */
  ilvl: number
  styleId: string | null
  /** `w:jc` is `center`. A worksheet centres its section headings and almost
   *  nothing else, which is how one is told from a line of a โจทย์. */
  centered: boolean
}

export interface DocxTable {
  kind: 'table'
  /** Rows of cells, each cell a list of paragraphs. */
  rows: DocxParagraph[][][]
}

export type DocxBlock = DocxParagraph | DocxTable

export interface NumberingLevel {
  /** `decimal`, `thaiLetters`, `bullet`, … */
  numFmt: string
  /** The pattern Word prints, e.g. `%1.`. */
  lvlText: string
}

export interface DocxDocument {
  blocks: DocxBlock[]
  /** numId → ilvl → level definition. */
  numbering: Map<string, Map<number, NumberingLevel>>
  /** Relationship id → path inside the package, e.g. `media/image1.png`. */
  rels: Map<string, string>
}

// ─── Run formatting ──────────────────────────────────────────────────────────

const NO_FORMAT: RunFormat = {
  bold: false, italic: false, underline: false, strike: false,
  color: '', highlight: '', vertAlign: '',
}

/** OOXML toggles are on when present unless they say `0`/`false`. */
function isToggleOn(node: XmlNode | null): boolean {
  if (!node) return false
  const value = node.attrs['w:val']
  return value !== '0' && value !== 'false' && value !== 'off'
}

function readRunFormat(rPr: XmlNode | null): RunFormat {
  if (!rPr) return NO_FORMAT

  const underline = firstChild(rPr, 'w:u')
  const color = firstChild(rPr, 'w:color')?.attrs['w:val'] ?? ''
  const highlight = firstChild(rPr, 'w:highlight')?.attrs['w:val'] ?? ''
  const vertAlign = firstChild(rPr, 'w:vertAlign')?.attrs['w:val'] ?? ''

  return {
    bold: isToggleOn(firstChild(rPr, 'w:b')) || isToggleOn(firstChild(rPr, 'w:bCs')),
    italic: isToggleOn(firstChild(rPr, 'w:i')) || isToggleOn(firstChild(rPr, 'w:iCs')),
    underline: !!underline && (underline.attrs['w:val'] ?? 'single') !== 'none',
    strike: isToggleOn(firstChild(rPr, 'w:strike')),
    // `auto` means "whatever the theme says", which is the default colour and
    // therefore not a mark the teacher made.
    color: color && color !== 'auto' ? color.toUpperCase() : '',
    highlight: highlight && highlight !== 'none' ? highlight : '',
    vertAlign: vertAlign === 'superscript' || vertAlign === 'subscript' ? vertAlign : '',
  }
}

// ─── Inline collection ───────────────────────────────────────────────────────

/**
 * Pictures inside a `w:drawing`.
 *
 * `wp:anchor` is a floating picture — one positioned relative to the page
 * rather than sitting in the run order. Word records it on whichever paragraph
 * it happens to be attached to, which is frequently not the paragraph the
 * picture belongs with, so the flag is passed on for the splitter to be
 * suspicious about.
 */
function collectDrawing(drawing: XmlNode, out: DocxInline[]): void {
  const anchor = firstChild(drawing, 'wp:anchor')
  const wrapper = anchor ?? firstChild(drawing, 'wp:inline')
  const extent = wrapper ? firstChild(wrapper, 'wp:extent') : null

  // The size Word prints the picture at, which is what the shapes standing on
  // it were positioned against. Zero when the file does not say, which every
  // caller reads as "no scale to compare with" rather than as a picture of no
  // width.
  const width = emu(extent?.attrs['cx'])
  const height = emu(extent?.attrs['cy'])

  for (const blip of descendants(drawing, 'a:blip')) {
    const relId = blip.attrs['r:embed'] ?? blip.attrs['r:link'] ?? ''
    if (relId) out.push({ kind: 'image', relId, floating: !!anchor, width, height })
  }
}

function emu(value: string | undefined): number {
  const parsed = parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * The floating shapes anchored to one paragraph.
 *
 * Read from the paragraph's own XML rather than threaded out of the run
 * walker, because a shape is not one of the paragraph's inlines and nothing
 * that reads inlines should have to step around it.
 *
 * `wp:anchor` is the modern form. The `mc:Fallback` beside it says the same
 * thing again in the older VML markup for readers that cannot manage the
 * first, and is deliberately not read: counting both would double every blank
 * on the page.
 */
function readShapes(node: XmlNode): DocxShape[] {
  const shapes: DocxShape[] = []

  for (const anchor of descendants(node, 'wp:anchor')) {
    // A floating *picture* is already an inline of this paragraph. It is not a
    // blank, and reading it as one would put an empty answer box on the page
    // for every illustration a worksheet floats beside its text.
    if (firstDescendant(anchor, 'pic:pic') || firstDescendant(anchor, 'a:blip')) continue

    const inlines: DocxInline[] = []
    const content = firstDescendant(anchor, 'w:txbxContent')
    if (content) walkInlines(content, inlines)

    const offsetOf = (name: string): number | null => {
      const position = firstChild(anchor, name)
      const offset = position ? firstChild(position, 'wp:posOffset') : null
      if (!offset?.text) return null
      const parsed = parseInt(offset.text, 10)
      return Number.isFinite(parsed) ? parsed : null
    }

    const extent = firstChild(anchor, 'wp:extent')
    shapes.push({
      inlines,
      connector: !!firstDescendant(anchor, 'wps:cNvCnPr'),
      // Only an offset from the text column can be compared with a picture
      // sitting in that column. One measured from the page or its margins is
      // in different units of the same page and would need the section's own
      // geometry to make sense of, which is a different job than reading a
      // โจทย์.
      x: firstChild(anchor, 'wp:positionH')?.attrs['relativeFrom'] === 'column' ? offsetOf('wp:positionH') : null,
      y: offsetOf('wp:positionV'),
      width: emu(extent?.attrs['cx']),
      height: emu(extent?.attrs['cy']),
    })
  }

  return shapes
}

/** Pictures in the older VML form, which is what `w:pict` and `w:object` hold. */
function collectPict(pict: XmlNode, out: DocxInline[]): void {
  for (const data of descendants(pict, 'v:imagedata')) {
    const relId = data.attrs['r:id'] ?? ''
    // VML keeps its size in a CSS-like `style` string rather than in EMU.
    // Nothing needs a VML picture's size, so it is left unmeasured instead of
    // parsed on the chance that one day something might.
    if (relId) out.push({ kind: 'image', relId, floating: false, width: 0, height: 0 })
  }
}

/**
 * `mc:AlternateContent` holds the same content twice — once for readers that
 * understand the newer markup (`mc:Choice`) and once for those that do not
 * (`mc:Fallback`). Reading both counts every picture in it twice.
 */
function collectAlternateContent(node: XmlNode, out: DocxInline[]): void {
  const preferred = firstChild(node, 'mc:Choice') ?? firstChild(node, 'mc:Fallback')
  if (preferred) walkInlines(preferred, out)
}

/**
 * A character Word stores as a symbol rather than as text.
 *
 * A ✓ typed from the Insert Symbol menu is not in `w:t` at all: it is a
 * `w:sym` naming a font and a code point in that font's private-use range.
 * Ignoring it loses the one mark that matters most on an answer key — a
 * ถูก-ผิด worksheet whose ticks vanish reads as a worksheet with no answers.
 *
 * Only the marks an exam actually uses are mapped. Anything else falls back to
 * the character the code point would be in Unicode, which is usually a shape
 * near enough to read, and never nothing.
 */
const WINGDINGS: Record<string, string> = {
  F0FC: '✓', F0FD: '☑', F0FB: '✗', F0FE: '☒', F0A8: '☐',
  F0A3: '✗', F0B7: '•', F0A7: '■',
}

/** Wingdings 2 and Webdings share the same habit with different code points. */
const WINGDINGS_2: Record<string, string> = {
  F050: '✓', F052: '✗', F054: '☑', F056: '☒',
}

function symbolCharacter(font: string | undefined, char: string | undefined): string | null {
  if (!char) return null
  const code = char.toUpperCase()
  const table = /wingdings\s*2/i.test(font ?? '') ? WINGDINGS_2 : WINGDINGS
  if (table[code]) return table[code]

  // The private-use block maps back to Latin-1 for every symbol font, which is
  // where "ü" for ✓ comes from. Better an approximate character than none.
  const value = parseInt(code, 16)
  if (Number.isFinite(value) && value >= 0xf000 && value <= 0xf0ff) {
    return String.fromCharCode(value - 0xf000)
  }
  return Number.isFinite(value) ? String.fromCharCode(value) : null
}

function collectRun(run: XmlNode, out: DocxInline[]): void {
  const format = readRunFormat(firstChild(run, 'w:rPr'))

  for (const child of run.children) {
    switch (child.name) {
      case 'w:rPr':
        break
      case 'w:t':
        if (child.text) out.push({ kind: 'text', text: child.text, format })
        break
      // Text that tracked changes has removed. It is not in the document the
      // teacher sees, so it is not in the โจทย์ either.
      case 'w:delText':
        break
      case 'w:br':
      case 'w:cr':
        out.push({ kind: 'break' })
        break
      case 'w:tab':
        out.push({ kind: 'tab' })
        break
      case 'w:noBreakHyphen':
        out.push({ kind: 'text', text: '-', format })
        break
      case 'w:sym': {
        const symbol = symbolCharacter(child.attrs['w:font'], child.attrs['w:char'])
        if (symbol) out.push({ kind: 'text', text: symbol, format })
        break
      }
      case 'w:drawing':
        collectDrawing(child, out)
        break
      case 'w:pict':
      case 'w:object':
        collectPict(child, out)
        break
      case 'mc:AlternateContent':
        collectAlternateContent(child, out)
        break
      default:
        walkInlines(child, out)
    }
  }
}

function walkInlines(node: XmlNode, out: DocxInline[]): void {
  for (const child of node.children) {
    switch (child.name) {
      // Properties, not content.
      case 'w:pPr':
      case 'w:rPr':
      case 'w:tblPr':
      case 'w:trPr':
      case 'w:tcPr':
      case 'w:sectPr':
      case 'w:bookmarkStart':
      case 'w:bookmarkEnd':
      case 'w:proofErr':
        break
      // A tracked deletion, and the comment/footnote apparatus around the text.
      case 'w:del':
      case 'w:commentRangeStart':
      case 'w:commentRangeEnd':
      case 'w:commentReference':
        break
      case 'w:r':
        collectRun(child, out)
        break
      case 'm:oMath':
      case 'm:oMathPara': {
        const { value, plain, structured } = ommlToTex(child)
        if (value) out.push({ kind: 'math', value, plain, structured })
        break
      }
      case 'mc:AlternateContent':
        collectAlternateContent(child, out)
        break
      case 'w:drawing':
        collectDrawing(child, out)
        break
      case 'w:pict':
      case 'w:object':
        collectPict(child, out)
        break
      default:
        // `w:hyperlink`, `w:ins`, `w:smartTag`, `w:fldSimple`, `w:sdt` — all
        // wrappers whose runs count as ordinary text.
        walkInlines(child, out)
    }
  }
}

function readParagraph(node: XmlNode): DocxParagraph {
  const pPr = firstChild(node, 'w:pPr')
  const numPr = pPr ? firstChild(pPr, 'w:numPr') : null
  const ilvlValue = numPr ? firstChild(numPr, 'w:ilvl')?.attrs['w:val'] : undefined
  const parsedIlvl = ilvlValue === undefined ? 0 : parseInt(ilvlValue, 10)

  const inlines: DocxInline[] = []
  walkInlines(node, inlines)

  return {
    kind: 'paragraph',
    inlines,
    shapes: readShapes(node),
    numId: (numPr ? firstChild(numPr, 'w:numId')?.attrs['w:val'] : null) ?? null,
    ilvl: Number.isFinite(parsedIlvl) ? parsedIlvl : 0,
    styleId: (pPr ? firstChild(pPr, 'w:pStyle')?.attrs['w:val'] : null) ?? null,
    centered: (pPr ? firstChild(pPr, 'w:jc')?.attrs['w:val'] : null) === 'center',
  }
}

/**
 * One table's cells.
 *
 * A cell holding a nested table contributes that table's paragraphs as its
 * own. Nesting is a layout device in these documents, never a second list of
 * choices, so flattening loses nothing a reader would notice.
 */
function readTable(node: XmlNode): DocxTable {
  const rows: DocxParagraph[][][] = []
  // Direct children only: a nested table's rows are reached through the cell
  // that holds them, and picking them up here as well would list them twice.
  for (const tr of node.children.filter(child => child.name === 'w:tr')) {
    const cells: DocxParagraph[][] = []
    for (const tc of tr.children.filter(child => child.name === 'w:tc')) {
      cells.push(descendants(tc, 'w:p').map(readParagraph))
    }
    if (cells.length > 0) rows.push(cells)
  }
  return { kind: 'table', rows }
}

function readBlocks(container: XmlNode, out: DocxBlock[]): void {
  for (const child of container.children) {
    if (child.name === 'w:p') out.push(readParagraph(child))
    else if (child.name === 'w:tbl') out.push(readTable(child))
    else if (child.name === 'w:sdt') {
      const content = firstChild(child, 'w:sdtContent')
      if (content) readBlocks(content, out)
    }
  }
}

// ─── Numbering and relationships ─────────────────────────────────────────────

function readNumbering(xml: string | null): Map<string, Map<number, NumberingLevel>> {
  const byNumId = new Map<string, Map<number, NumberingLevel>>()
  if (!xml) return byNumId

  let root: XmlNode
  // A worksheet with no lists has no numbering part, and a damaged one should
  // not cost the teacher the whole import — it only costs the numbering, and
  // the splitter has a text-based fallback for that.
  try { root = parseXml(xml) } catch { return byNumId }

  const byAbstractId = new Map<string, Map<number, NumberingLevel>>()
  for (const abstract of descendants(root, 'w:abstractNum')) {
    const id = abstract.attrs['w:abstractNumId']
    if (!id) continue
    const levels = new Map<number, NumberingLevel>()
    for (const lvl of descendants(abstract, 'w:lvl')) {
      const ilvl = parseInt(lvl.attrs['w:ilvl'] ?? '', 10)
      if (!Number.isFinite(ilvl)) continue
      levels.set(ilvl, {
        numFmt: firstChild(lvl, 'w:numFmt')?.attrs['w:val'] ?? '',
        lvlText: firstChild(lvl, 'w:lvlText')?.attrs['w:val'] ?? '',
      })
    }
    byAbstractId.set(id, levels)
  }

  for (const num of descendants(root, 'w:num')) {
    const numId = num.attrs['w:numId']
    const abstractId = firstChild(num, 'w:abstractNumId')?.attrs['w:val']
    if (!numId || !abstractId) continue
    const levels = byAbstractId.get(abstractId)
    if (levels) byNumId.set(numId, levels)
  }

  return byNumId
}

function readRels(xml: string | null): Map<string, string> {
  const rels = new Map<string, string>()
  if (!xml) return rels

  let root: XmlNode
  try { root = parseXml(xml) } catch { return rels }

  for (const rel of descendants(root, 'Relationship')) {
    const id = rel.attrs['Id']
    const target = rel.attrs['Target']
    // An external picture lives on someone's web server, not in this file.
    if (!id || !target || rel.attrs['TargetMode'] === 'External') continue
    rels.set(id, target.replace(/^\/?word\//, '').replace(/^\.\//, ''))
  }

  return rels
}

export class DocxError extends Error {}

export interface DocxParts {
  document: string
  numbering: string | null
  rels: string | null
}

/** Reads the already-unzipped XML parts into blocks. */
export function readDocument(parts: DocxParts): DocxDocument {
  let root: XmlNode
  try {
    root = parseXml(parts.document)
  } catch {
    throw new DocxError('อ่านเนื้อหาในไฟล์ Word ไม่ได้ ไฟล์อาจเสียหาย')
  }

  const body = root.name === 'w:body' ? root : firstDescendant(root, 'w:body')
  if (!body) throw new DocxError('ไม่พบเนื้อหาในไฟล์ Word')

  const blocks: DocxBlock[] = []
  readBlocks(body, blocks)

  return {
    blocks,
    numbering: readNumbering(parts.numbering),
    rels: readRels(parts.rels),
  }
}
