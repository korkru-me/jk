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
  | { kind: 'image'; relId: string; floating: boolean }
  | { kind: 'break' }
  | { kind: 'tab' }

export interface DocxParagraph {
  kind: 'paragraph'
  inlines: DocxInline[]
  /** The `w:numId` of the list this paragraph belongs to, or null. */
  numId: string | null
  /** List depth: 0 is the outer level, 1 the first nested one. */
  ilvl: number
  styleId: string | null
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
  const floating = !!firstChild(drawing, 'wp:anchor')
  for (const blip of descendants(drawing, 'a:blip')) {
    const relId = blip.attrs['r:embed'] ?? blip.attrs['r:link'] ?? ''
    if (relId) out.push({ kind: 'image', relId, floating })
  }
}

/** Pictures in the older VML form, which is what `w:pict` and `w:object` hold. */
function collectPict(pict: XmlNode, out: DocxInline[]): void {
  for (const data of descendants(pict, 'v:imagedata')) {
    const relId = data.attrs['r:id'] ?? ''
    if (relId) out.push({ kind: 'image', relId, floating: false })
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
    numId: (numPr ? firstChild(numPr, 'w:numId')?.attrs['w:val'] : null) ?? null,
    ilvl: Number.isFinite(parsedIlvl) ? parsedIlvl : 0,
    styleId: (pPr ? firstChild(pPr, 'w:pStyle')?.attrs['w:val'] : null) ?? null,
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
