/**
 * Blocks from a Word file, turned into draft โจทย์ for the teacher to check.
 *
 * Everything here is a reading of what the document appears to say, not a
 * claim about what it means. The teacher confirms each one on the import
 * screen before anything reaches the คลัง, so the job is to be right often,
 * be obviously wrong when it is wrong, and never to hide a guess: anything
 * uncertain comes back as a warning attached to the โจทย์ it is about.
 *
 * The three readings that do the work:
 *
 *   Where a โจทย์ starts — the outer level of whichever Word list the document
 *   numbers its questions with. Digits are not in the text to split on.
 *
 *   Which choice is correct — the marked one. Teachers write the key in red,
 *   or in highlighter, or in bold. `docx.ts` keeps that formatting precisely
 *   so it can be read back here.
 *
 *   Choices or sub-questions — "1) 2) 3) 4)" under a stem are alternatives;
 *   "ก) ... ข) ..." under a stem are usually two questions. Told apart by how
 *   many there are and whether they sit in a table, and flagged when close.
 */
import type { DocxBlock, DocxDocument, DocxInline, DocxParagraph, NumberingLevel } from './docx'

export type DraftQuestionType = 'mcq' | 'written' | 'essay'

export interface DraftChoice {
  id: string
  /** Plain text, not markup: the app stores `MCQOption.text` as plain text and
   *  edits it in a plain input, so HTML here would be shown to the teacher raw
   *  and would make an imported ตัวเลือก unlike every other one in the คลัง.
   *  Superscripts and subscripts survive as the Unicode characters instead. */
  text: string
  isCorrect: boolean
}

export interface DraftPart {
  id: string
  /** The ก/ข/ค (or 1/2/3) Word prints in front of this sub-question. */
  label: string
  html: string
}

export type DraftWarningCode =
  | 'equation'
  | 'no-correct-choice'
  | 'multiple-correct-choices'
  | 'image-expected'
  | 'image-unreferenced'
  | 'refers-to-previous'
  | 'ambiguous-choices'

export interface DraftWarning {
  code: DraftWarningCode
  message: string
}

export interface DraftQuestion {
  id: string
  /** Position in the document's own numbering, 1-based. */
  number: number
  type: DraftQuestionType
  title: string
  /** Question body as rich text, in the same HTML the editor produces. */
  html: string
  choices: DraftChoice[]
  parts: DraftPart[]
  /** Relationship ids, resolved to uploaded URLs by the caller. */
  imageRelIds: string[]
  /** Whether the โจทย์ talks about a picture ("ดังรูป"). Kept rather than
   *  resolved into a warning here, because the teacher can move pictures
   *  between โจทย์ on the import screen and the warning has to follow. */
  mentionsPicture: boolean
  warnings: DraftWarning[]
}

export interface DraftResult {
  questions: DraftQuestion[]
  /** Headings and instructions found before the first โจทย์. */
  preamble: string[]
  /** Pictures Word anchored to the page rather than to the run order. These
   *  are the ones that land on the wrong โจทย์, so a โจทย์ holding one it never
   *  mentions is worth asking about. */
  floatingImageRelIds: string[]
}

// ─── Text and HTML ───────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Everything a reader would see, with no markup — for matching and titles. */
function plainText(inlines: DocxInline[]): string {
  let out = ''
  for (const inline of inlines) {
    if (inline.kind === 'text') out += inline.text
    // The readable form, not the TeX: this text becomes titles and is what the
    // warnings are matched against, and "15\sqrt{2}" is neither.
    else if (inline.kind === 'math') out += inline.plain
    else if (inline.kind === 'break' || inline.kind === 'tab') out += ' '
  }
  return out
}

function paragraphsText(paragraphs: DocxParagraph[]): string {
  return paragraphs.map(p => plainText(p.inlines)).join(' ').replace(/\s+/g, ' ').trim()
}

/** What a superscript run becomes where markup cannot be carried. */
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷',
  '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  n: 'ⁿ', i: 'ⁱ',
}

const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇',
  '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
}

/** Maps what it can and leaves the rest as written — a superscript letter with
 *  no Unicode twin is better shown level than dropped. */
function toScript(text: string, table: Record<string, string>): string {
  return [...text].map(character => table[character] ?? character).join('')
}

/**
 * One run of inlines as plain text.
 *
 * Used for the fields the app itself keeps plain — an mcq's ตัวเลือก. "10
 * เมตรต่อวินาที²" has to survive as those characters, because the input the
 * teacher edits it in cannot hold a <sup>.
 */
function inlinesToPlain(inlines: DocxInline[]): string {
  let out = ''
  for (const inline of inlines) {
    if (inline.kind === 'text') {
      if (inline.format.vertAlign === 'superscript') out += toScript(inline.text, SUPERSCRIPT)
      else if (inline.format.vertAlign === 'subscript') out += toScript(inline.text, SUBSCRIPT)
      else out += inline.text
    } else if (inline.kind === 'math') {
      out += inline.plain
    } else if (inline.kind === 'break' || inline.kind === 'tab') {
      out += ' '
    }
  }
  return out
}

function paragraphsToPlain(paragraphs: DocxParagraph[]): string {
  return paragraphs.map(p => inlinesToPlain(p.inlines)).join(' ').replace(/\s+/g, ' ').trim()
}

interface HtmlOptions {
  /** Whether bold/italic/underline survive into the โจทย์.
   *
   *  Off for choices. A teacher who bolds the correct option is writing the
   *  answer key, and carrying that formatting through would print the key on
   *  the student's screen. Superscript and subscript are content either way —
   *  "m/s²" means something the run formatting is the only record of. */
  keepEmphasis: boolean
}

/** Runs that differ only by a property nothing here reads are one run. */
function sameFormatting(a: DocxInline, b: DocxInline): boolean {
  if (a.kind !== 'text' || b.kind !== 'text') return false
  return a.format.bold === b.format.bold
    && a.format.italic === b.format.italic
    && a.format.underline === b.format.underline
    && a.format.vertAlign === b.format.vertAlign
}

function inlinesToHtml(inlines: DocxInline[], { keepEmphasis }: HtmlOptions): string {
  let out = ''

  for (let i = 0; i < inlines.length; i++) {
    const inline = inlines[i]

    if (inline.kind === 'break') { out += '<br>'; continue }
    if (inline.kind === 'tab') { out += ' '; continue }
    if (inline.kind === 'image') continue
    if (inline.kind === 'math') {
      // Escaped like any other text: `renderMathInHtml` decodes entities on
      // its way into KaTeX, so `a &lt; b` inside a formula still reaches it
      // as `a < b`.
      out += inline.structured ? `\\(${escapeHtml(inline.value)}\\)` : escapeHtml(inline.value)
      continue
    }

    let text = inline.text
    while (i + 1 < inlines.length && sameFormatting(inline, inlines[i + 1])) {
      const next = inlines[i + 1]
      if (next.kind !== 'text') break
      text += next.text
      i++
    }
    if (!text) continue

    let piece = escapeHtml(text)
    if (inline.format.vertAlign === 'superscript') piece = `<sup>${piece}</sup>`
    else if (inline.format.vertAlign === 'subscript') piece = `<sub>${piece}</sub>`
    if (keepEmphasis) {
      if (inline.format.bold) piece = `<strong>${piece}</strong>`
      if (inline.format.italic) piece = `<em>${piece}</em>`
      if (inline.format.underline) piece = `<u>${piece}</u>`
    }
    out += piece
  }

  return out
}

function paragraphsToHtml(paragraphs: DocxParagraph[], options: HtmlOptions): string {
  return paragraphs
    // Judged on the words, not the markup: a worksheet is full of paragraphs
    // holding nothing but a line break or a run of spaces used as layout, and
    // `<p><br></p>` is not empty as a string while being empty as a โจทย์.
    .filter(paragraph => plainText(paragraph.inlines).trim() !== '')
    .map(paragraph => inlinesToHtml(paragraph.inlines, options).replace(/^\s+/, '').replace(/\s+$/, ''))
    .filter(html => html !== '')
    .map(html => `<p>${html}</p>`)
    .join('')
}

// ─── Marks: how a teacher writes the answer key ──────────────────────────────

interface MarkFlags {
  red: boolean
  highlight: boolean
  colored: boolean
  bold: boolean
  underline: boolean
}

const NO_MARKS: MarkFlags = { red: false, highlight: false, colored: false, bold: false, underline: false }

function parseHex(hex: string): [number, number, number] | null {
  if (!/^[0-9A-F]{6}$/.test(hex)) return null
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}

function isRed(hex: string): boolean {
  const rgb = parseHex(hex)
  if (!rgb) return false
  const [r, g, b] = rgb
  return r >= 120 && r >= g * 1.6 && r >= b * 1.6
}

/** Any colour a teacher chose, as opposed to the default near-black. */
function isDeliberateColour(hex: string): boolean {
  const rgb = parseHex(hex)
  if (!rgb) return false
  const [r, g, b] = rgb
  return r > 60 || g > 60 || b > 60
}

function readMarks(paragraphs: DocxParagraph[]): MarkFlags {
  const marks: MarkFlags = { ...NO_MARKS }
  for (const paragraph of paragraphs) {
    for (const inline of paragraph.inlines) {
      // Formatting on a space says nothing; formatting on a word is the mark.
      if (inline.kind !== 'text' || !inline.text.trim()) continue
      const { format } = inline
      if (isRed(format.color)) marks.red = true
      if (isDeliberateColour(format.color)) marks.colored = true
      if (format.highlight) marks.highlight = true
      if (format.bold) marks.bold = true
      if (format.underline) marks.underline = true
    }
  }
  return marks
}

/**
 * Picks the signal that actually singles a choice out.
 *
 * Tried in order of how deliberate each one is, and a signal every choice
 * carries is no signal at all — a worksheet whose options are all bold is
 * styled that way, not four correct answers.
 */
function correctByMarks(marks: MarkFlags[]): boolean[] {
  const signals: (keyof MarkFlags)[] = ['red', 'highlight', 'colored', 'bold', 'underline']
  for (const signal of signals) {
    const hits = marks.map(mark => mark[signal])
    const count = hits.filter(Boolean).length
    if (count > 0 && count < marks.length) return hits
  }
  return marks.map(() => false)
}

// ─── Splitting the document into questions ───────────────────────────────────

/** `1)` `1.` `(1)` `ก)` `a.` — the way a choice or a sub-question is labelled. */
const CHOICE_MARKER = /^[\s ]*\(?\s*([0-9]{1,2}|[ก-ฮ]|[a-hA-H])\s*[.)\]]\s*/

function matchMarker(text: string): { marker: string; rest: string } | null {
  const match = CHOICE_MARKER.exec(text)
  if (!match) return null
  const rest = text.slice(match[0].length)
  // A marker with nothing after it is a stray bracket, not a choice.
  if (!rest.trim()) return null
  return { marker: match[1], rest }
}

/** Formats that number things, as opposed to bulleting them. */
function numbersThings(numFmt: string): boolean {
  return numFmt !== '' && numFmt !== 'bullet' && numFmt !== 'none'
}

interface QuestionList {
  numId: string
  ilvl: number
}

/**
 * Which Word list the document numbers its โจทย์ with.
 *
 * A worksheet usually holds several: the questions, and whatever lists live
 * inside them. The questions are the list with the most items at its own
 * outermost level.
 */
function findQuestionList(document: DocxDocument): QuestionList | null {
  const counts = new Map<string, Map<number, number>>()

  for (const block of document.blocks) {
    if (block.kind !== 'paragraph' || !block.numId) continue
    const levels = counts.get(block.numId) ?? new Map<number, number>()
    levels.set(block.ilvl, (levels.get(block.ilvl) ?? 0) + 1)
    counts.set(block.numId, levels)
  }

  let best: QuestionList | null = null
  let bestCount = 0

  for (const [numId, levels] of counts) {
    const outermost = Math.min(...levels.keys())
    const count = levels.get(outermost) ?? 0
    const definition = document.numbering.get(numId)?.get(outermost)
    // No numbering part to check against is not a reason to refuse the list —
    // a missing definition is treated as "numbered", which is what a list of
    // questions almost always is.
    if (definition && !numbersThings(definition.numFmt)) continue
    if (count > bestCount) {
      best = { numId, ilvl: outermost }
      bestCount = count
    }
  }

  // One item is enough. A paragraph Word has put in a numbered list is a list
  // item whatever else is true, and a worksheet holding a single โจทย์ should
  // import as readily as one holding forty. The typed-digit fallback below is
  // the guess that needs a corroborating second item.
  return best
}

/**
 * The fallback for documents that type their question numbers by hand.
 *
 * Only accepted when the digits actually count up from 1 — otherwise every
 * "2." inside a sentence starts a new โจทย์.
 */
function findTypedNumbering(blocks: DocxBlock[]): Set<number> {
  const candidates: { index: number; value: number }[] = []

  blocks.forEach((block, index) => {
    if (block.kind !== 'paragraph') return
    const match = /^[\s ]*([0-9]{1,2})\s*[.)]\s+/.exec(plainText(block.inlines))
    if (match) candidates.push({ index, value: parseInt(match[1], 10) })
  })

  const accepted = new Set<number>()
  let expected = 1
  for (const candidate of candidates) {
    if (candidate.value !== expected) continue
    accepted.add(candidate.index)
    expected++
  }
  return accepted.size >= 2 ? accepted : new Set<number>()
}

// ─── Chunk analysis ──────────────────────────────────────────────────────────

interface MarkerItem {
  marker: string
  paragraphs: DocxParagraph[]
  fromTable: boolean
}

type ChunkItem =
  | { kind: 'stem'; paragraph: DocxParagraph }
  | { kind: 'marker'; item: MarkerItem }
  | { kind: 'sub'; paragraph: DocxParagraph }

/**
 * Reads one table as either a set of choices or as prose.
 *
 * Two columns of "1) … 2) …" is how a worksheet lays four options out on two
 * lines; the cells are read left to right, top to bottom, which is the order
 * they are meant to be read in. A table whose cells carry no markers is a
 * table of data, and its text joins the question instead.
 */
function readTableItems(rows: DocxParagraph[][][]): { markers: MarkerItem[]; prose: DocxParagraph[] } {
  const markers: MarkerItem[] = []
  const prose: DocxParagraph[] = []

  for (const row of rows) {
    for (const cell of row) {
      const text = paragraphsText(cell)
      if (!text) continue
      const matched = matchMarker(text)
      if (matched) markers.push({ marker: matched.marker, paragraphs: cell, fromTable: true })
      else prose.push(...cell)
    }
  }

  // Not a set of choices after all: every cell is prose, including the one or
  // two that happened to start with something marker-shaped.
  if (markers.length < 2) return { markers: [], prose: rows.flat(2) }
  return { markers, prose }
}

/**
 * Whether a run of labelled items is a set of choices or a set of
 * sub-questions.
 *
 * A table settles it. Otherwise: four or more labelled items is a multiple
 * choice question in any labelling scheme, and three digits is one too —
 * "ก) ... ข) ..." under a stem is the shape of a two-part question, and that
 * is exactly what it usually is.
 */
function looksLikeChoices(markers: MarkerItem[]): boolean {
  if (markers.length < 2) return false
  if (markers.some(marker => marker.fromTable)) return true
  if (markers.length >= 4) return true
  return markers.length >= 3 && markers.every(marker => /^[0-9]+$/.test(marker.marker))
}

function collectImages(paragraphs: DocxParagraph[]): { relIds: string[] } {
  const relIds: string[] = []
  for (const paragraph of paragraphs) {
    for (const inline of paragraph.inlines) {
      if (inline.kind === 'image') relIds.push(inline.relId)
    }
  }
  return { relIds }
}

function hasStructuredMath(paragraphs: DocxParagraph[]): boolean {
  return paragraphs.some(p => p.inlines.some(inline => inline.kind === 'math' && inline.structured))
}

const MENTIONS_PICTURE = /(ดัง|จาก|ตาม)?\s*(รูป|ภาพ|แผนภาพ)/
const REFERS_TO_PREVIOUS = /(จากข้อ(ที่)?\s*(ผ่านมา|แล้ว|ก่อนหน้า|ข้างต้น)|ข้อที่ผ่านมา|ข้อก่อนหน้า|จากโจทย์ข้อ)/

/** The consonants Word runs through for a `thaiLetters` list. */
const THAI_LIST_LETTERS = 'กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ'
const LATIN_LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']

/**
 * The label Word prints in front of a sub-question.
 *
 * Same reason the question numbers are missing: Word draws ก) ข) ค) from the
 * list definition, so a sub-question extracted as text arrives unlabelled and
 * "ก" has to be worked out from the format and the position.
 */
function levelLabel(level: NumberingLevel | undefined, ordinal: number): string {
  const index = ordinal - 1
  switch (level?.numFmt) {
    case 'thaiLetters':
      return THAI_LIST_LETTERS[index] ?? String(ordinal)
    case 'lowerLetter':
      return LATIN_LETTERS[index] ?? String(ordinal)
    case 'upperLetter':
      return (LATIN_LETTERS[index] ?? String(ordinal)).toUpperCase()
    case 'lowerRoman':
      return ROMAN[index] ?? String(ordinal)
    case 'upperRoman':
      return (ROMAN[index] ?? String(ordinal)).toUpperCase()
    case 'thaiNumbers':
      return String(ordinal).replace(/[0-9]/g, digit => '๐๑๒๓๔๕๖๗๘๙'[Number(digit)])
    default:
      return String(ordinal)
  }
}

function buildTitle(text: string, number: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return `ข้อ ${number}`
  return clean.length <= 60 ? clean : `${clean.slice(0, 60).trim()}…`
}

// ─── Assembly ────────────────────────────────────────────────────────────────

function buildQuestion(
  head: DocxParagraph,
  body: DocxBlock[],
  number: number,
  levels: Map<number, NumberingLevel> | undefined,
): DraftQuestion {
  const items: ChunkItem[] = []

  for (const block of body) {
    if (block.kind === 'table') {
      const { markers, prose } = readTableItems(block.rows)
      for (const paragraph of prose) items.push({ kind: 'stem', paragraph })
      for (const item of markers) items.push({ kind: 'marker', item })
      continue
    }

    // A deeper level of the same list Word numbers the questions with: ก) ข)
    // printed by Word rather than typed.
    if (block.numId === head.numId && block.ilvl > head.ilvl) {
      items.push({ kind: 'sub', paragraph: block })
      continue
    }

    const matched = matchMarker(plainText(block.inlines))
    if (matched) {
      items.push({ kind: 'marker', item: { marker: matched.marker, paragraphs: [block], fromTable: false } })
      continue
    }

    items.push({ kind: 'stem', paragraph: block })
  }

  const markerItems = items.flatMap(item => item.kind === 'marker' ? [item.item] : [])
  const treatAsChoices = looksLikeChoices(markerItems)

  const stemParagraphs = [head, ...items.flatMap(item => item.kind === 'stem' ? [item.paragraph] : [])]
  const choices: DraftChoice[] = []
  const parts: DraftPart[] = []

  if (treatAsChoices) {
    markerItems.forEach((item, index) => {
      choices.push({
        id: `choice-${number}-${index}`,
        // The marker itself is the label the app draws, not part of the text.
        text: stripMarker(paragraphsToPlain(item.paragraphs)),
        isCorrect: false,
      })
    })
    const correct = correctByMarks(markerItems.map(item => readMarks(item.paragraphs)))
    correct.forEach((isCorrect, index) => { choices[index].isCorrect = isCorrect })
  }

  let partIndex = 0
  // Ordinals are counted per list level, which is how Word numbers them: a
  // second level restarts at ก inside every question.
  const ordinals = new Map<number, number>()
  for (const item of items) {
    if (item.kind === 'sub') {
      const ordinal = (ordinals.get(item.paragraph.ilvl) ?? 0) + 1
      ordinals.set(item.paragraph.ilvl, ordinal)
      parts.push({
        id: `part-${number}-${partIndex++}`,
        label: levelLabel(levels?.get(item.paragraph.ilvl), ordinal),
        html: paragraphsToHtml([item.paragraph], { keepEmphasis: true }),
      })
    } else if (item.kind === 'marker' && !treatAsChoices) {
      parts.push({
        id: `part-${number}-${partIndex++}`,
        label: item.item.marker,
        html: stripMarkerFromHtml(paragraphsToHtml(item.item.paragraphs, { keepEmphasis: true })),
      })
    }
  }

  const allParagraphs = [
    ...stemParagraphs,
    ...markerItems.flatMap(item => item.paragraphs),
    ...items.flatMap(item => item.kind === 'sub' ? [item.paragraph] : []),
  ]
  const { relIds } = collectImages(allParagraphs)
  const stemText = paragraphsText(stemParagraphs)
  const fullText = paragraphsText(allParagraphs)

  const warnings: DraftWarning[] = []

  if (hasStructuredMath(allParagraphs)) {
    warnings.push({
      code: 'equation',
      message: 'ข้อนี้มีสูตรที่พิมพ์ด้วยเครื่องมือสมการของ Word — ตรวจตัวเลขและสูตรอีกครั้ง',
    })
  }

  if (markerItems.length > 0 && markerItems.length <= 3) {
    warnings.push({
      code: 'ambiguous-choices',
      message: treatAsChoices
        ? `อ่านเป็นตัวเลือก ${markerItems.length} ข้อ — ถ้าเป็นข้อย่อยให้เปลี่ยนชนิดโจทย์`
        : `อ่านเป็นข้อย่อย ${markerItems.length} ข้อ — ถ้าเป็นตัวเลือกให้เปลี่ยนเป็นปรนัย`,
    })
  }

  if (REFERS_TO_PREVIOUS.test(fullText)) {
    warnings.push({
      code: 'refers-to-previous',
      message: 'ข้อนี้อ้างถึงข้อก่อนหน้า — ในคลังโจทย์แต่ละข้อยืนเดี่ยว ควรเติมบริบทให้ครบ',
    })
  }

  return {
    id: `q-${number}`,
    number,
    // Without choices there is no key to grade against, so the โจทย์ comes in
    // as one the teacher marks by hand. Switching it to อัตนัย and typing the
    // answer is one control on the import screen.
    type: treatAsChoices ? 'mcq' : 'essay',
    title: buildTitle(stemText, number),
    html: paragraphsToHtml(stemParagraphs, { keepEmphasis: true }),
    choices,
    parts,
    imageRelIds: relIds,
    mentionsPicture: MENTIONS_PICTURE.test(fullText),
    warnings,
  }
}

/** Removes the `1)` / `ก.` from plain text. */
function stripMarker(text: string): string {
  const matched = matchMarker(text)
  return matched ? matched.rest.trim() : text
}

/** Removes the `1)` / `ก.` that the app renders as a label of its own. */
function stripMarkerFromHtml(html: string): string {
  return html.replace(/^(<p>(?:<[^>]+>)*)[\s ]*\(?\s*(?:[0-9]{1,2}|[ก-ฮ]|[a-hA-H])\s*[.)\]]\s*/, '$1')
}

export function buildDrafts(document: DocxDocument): DraftResult {
  const list = findQuestionList(document)
  const typed = list ? new Set<number>() : findTypedNumbering(document.blocks)

  const isHead = (block: DocxBlock, index: number): block is DocxParagraph => {
    if (block.kind !== 'paragraph') return false
    if (list) return block.numId === list.numId && block.ilvl === list.ilvl
    return typed.has(index)
  }

  const heads: number[] = []
  document.blocks.forEach((block, index) => { if (isHead(block, index)) heads.push(index) })

  const preamble = document.blocks
    .slice(0, heads[0] ?? document.blocks.length)
    .flatMap(block => block.kind === 'paragraph' ? [plainText(block.inlines).trim()] : [])
    .filter(Boolean)

  const questions = heads.map((headIndex, position) => {
    const head = document.blocks[headIndex] as DocxParagraph
    const end = heads[position + 1] ?? document.blocks.length
    const body = document.blocks.slice(headIndex + 1, end)
    return buildQuestion(head, body, position + 1, list ? document.numbering.get(list.numId) : undefined)
  })

  const floating = new Set<string>()
  const noteFloating = (paragraphs: DocxParagraph[]) => {
    for (const paragraph of paragraphs) {
      for (const inline of paragraph.inlines) {
        if (inline.kind === 'image' && inline.floating) floating.add(inline.relId)
      }
    }
  }
  for (const block of document.blocks) {
    if (block.kind === 'paragraph') noteFloating([block])
    else for (const row of block.rows) for (const cell of row) noteFloating(cell)
  }

  return { questions, preamble, floatingImageRelIds: [...floating] }
}
