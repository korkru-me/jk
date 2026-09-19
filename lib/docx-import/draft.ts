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
import type { MatchingAnswerMode, QuestionType } from '@/lib/types'
import type { DocxBlock, DocxDocument, DocxInline, DocxParagraph, NumberingLevel } from './docx'
import { flattenAnswerText, parseAnswerList, readAnswerKey, type DraftAnswer } from './answer-key'

export type DraftQuestionType = 'mcq' | 'written' | 'essay' | 'fill_blank' | 'true_false' | 'ordering' | 'matching'

export type { DraftAnswer } from './answer-key'

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
  /** Read out of the bracket this sub-question ended with, and taken out of
   *  `html` — a โจทย์ that still carries its own เฉลย is one that shows it to
   *  the class. */
  answers: DraftAnswer[]
}

export type DraftWarningCode =
  | 'equation'
  | 'no-correct-choice'
  | 'multiple-correct-choices'
  | 'image-expected'
  | 'image-unreferenced'
  | 'refers-to-previous'
  | 'ambiguous-choices'
  | 'multi-answer'
  | 'unmarked-statement'
  | 'no-correct-order'
  | 'order-item-image'
  | 'unpaired-matching'

export interface DraftWarning {
  code: DraftWarningCode
  message: string
}

/** One statement of a ถูก-ผิด โจทย์, in the order it is written. */
export interface DraftStatement {
  /** The statement itself, with its number, its dotted box and its mark gone. */
  html: string
  /** What the teacher marked: ✓ true, ✗ or x false, null if nothing was marked. */
  isTrue: boolean | null
  /** Points the file gives this statement — "(0.25 คะแนน)" — if it says. */
  score: number | null
}

/** One ช่องว่าง in a เติมคำ โจทย์, in the order it appears. */
export interface DraftBlank {
  /** The word the teacher marked, which the blank was cut out of. */
  answer: string
}

/**
 * One order a paper offers as an answer — the "2-1-4-3" of an exam ข้อ.
 *
 * On paper a เรียงลำดับ โจทย์ is written as a ปรนัย one: the fragments are
 * printed scrambled and the student picks the permutation that puts them
 * right. The web asks for the order itself, so these are read only to find out
 * what the right order *is*, and never reach the student.
 */
export interface DraftOrderChoice {
  /** 1-based positions into `DraftQuestion.orderItems`, in this option's order. */
  order: number[]
  /** Marked in red, highlighter or bold — the same key as everywhere else. */
  isCorrect: boolean
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
  /** The เฉลย written in brackets at the end of the โจทย์ itself, already taken
   *  out of `html`. Sub-questions carry their own. */
  answers: DraftAnswer[]
  /** For a เติมคำ โจทย์: what each `[___n]` in `html` should accept. */
  blanks: DraftBlank[]
  /** For a ถูก-ผิด โจทย์: the statements to judge. `html` is then the lead-in
   *  they are all judged against, which is not itself judged. */
  statements: DraftStatement[]
  /** For a เรียงลำดับ โจทย์: the lines to be put in order, as plain text, in
   *  the order the page prints them — which is the correct order only when
   *  `orderChoices` is empty. `html` is then the คำสั่ง and nothing else. */
  orderItems: string[]
  /** The orders an exam paper offered to choose between. Empty for a worksheet
   *  that simply lists the steps already in order. */
  orderChoices: DraftOrderChoice[]
  /** For a จับคู่ โจทย์: the two columns and whatever pairing the file stated.
   *  `html` is then the คำชี้แจง and nothing else. */
  matching: DraftMatching | null
  /** Relationship ids, resolved to uploaded URLs by the caller. */
  imageRelIds: string[]
  /** Whether the โจทย์ talks about a picture ("ดังรูป"). Kept rather than
   *  resolved into a warning here, because the teacher can move pictures
   *  between โจทย์ on the import screen and the warning has to follow. */
  mentionsPicture: boolean
  warnings: DraftWarning[]
}

/** Where the question numbers came from — see `DraftResult.numbering`. */
export type NumberingSource = 'list' | 'typed' | 'none'

export interface ParseOptions {
  /**
   * The kind of โจทย์ the teacher said this file holds, when they said.
   *
   * Reading a marked word as a ช่องว่าง is only safe once someone has said the
   * file is เติมคำ: on any other worksheet a bolded number in the โจทย์ is
   * emphasis, and cutting it out would replace the number with a blank nobody
   * asked for. เรียงลำดับ needs the same permission for the opposite reason —
   * its "1) 2) 3) 4)" lines are indistinguishable from ตัวเลือก on the page,
   * and only the teacher knows which the file holds. Everything else is read
   * the same either way.
   */
  expect?: QuestionType | null
}

export interface DraftResult {
  questions: DraftQuestion[]
  /** Headings and instructions found outside any โจทย์: before the first one,
   *  and the section headings that sit between them. */
  preamble: string[]
  /**
   * How the โจทย์ were told apart.
   *
   * `list` is a Word numbered list, which is the only form that survives
   * editing. `typed` means the numbers were characters in the text and the
   * fallback reader was used — it works, but a file like that breaks as soon
   * as a teacher inserts a โจทย์ in the middle, so it is worth saying. `none`
   * means neither was found, which is why nothing came out.
   */
  numbering: NumberingSource
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

/**
 * The words a teacher marked, turned into the ช่องว่าง of a เติมคำ โจทย์.
 *
 * A เติมคำ worksheet is written as the finished sentence with the answers in it
 * — "หน่วยของแรงในระบบเอสไอคือ นิวตัน" with นิวตัน in red — because that is the
 * copy the teacher marks from. So the marked words are both where the blanks go
 * and what they accept, and they have to come out of the sentence on the way in.
 *
 * Which signal counts is decided per โจทย์ by the same rule the ปรนัย key uses:
 * the most deliberate one that covers some of the text but not all of it. A
 * sentence that is bold from end to end is styled, not answered.
 */
const BLANK_SIGNALS: (keyof MarkFlags)[] = ['red', 'highlight', 'colored', 'bold', 'underline']

function signalOf(inline: DocxInline): MarkFlags | null {
  if (inline.kind !== 'text' || !inline.text.trim()) return null
  const { format } = inline
  return {
    red: isRed(format.color),
    colored: isDeliberateColour(format.color),
    highlight: !!format.highlight,
    bold: !!format.bold,
    underline: !!format.underline,
  }
}

/** The signal that singles out part of this โจทย์, or null when none does. */
function blankSignal(paragraphs: DocxParagraph[]): keyof MarkFlags | null {
  const flags = paragraphs
    .flatMap(paragraph => paragraph.inlines.map(signalOf))
    .filter((mark): mark is MarkFlags => mark !== null)
  if (flags.length === 0) return null

  for (const signal of BLANK_SIGNALS) {
    const marked = flags.filter(mark => mark[signal]).length
    if (marked > 0 && marked < flags.length) return signal
  }
  return null
}

interface BlankRead {
  /** The โจทย์ with each marked run replaced by its `[___n]` marker. */
  html: string
  /** The same for a title, with the blanks shown as underscores. */
  plain: string
  blanks: DraftBlank[]
}

/**
 * Replaces every run of marked words with a numbered marker.
 *
 * Runs that sit next to each other are one ช่องว่าง: Word splits a phrase into
 * several runs of its own accord (a spell-check boundary is enough), and three
 * blanks where the teacher wrote one answer would be unanswerable.
 */
/**
 * The gap a worksheet leaves when it does not write the answer down.
 *
 * Underscores are the western habit and rows of dots the Thai one; both mean
 * the same thing on the page, so both are read. What they cannot carry is the
 * answer — the file simply does not say — so those blanks arrive for the
 * teacher to mark, and they can type the answers in afterwards to have the
 * system mark them instead.
 */
const BLANK_PLACEHOLDER = /(?:_{3,}|\.{3,}|\u2026+|·{3,})/g

function readPlaceholderBlanks(paragraphs: DocxParagraph[]): BlankRead | null {
  const blanks: DraftBlank[] = []
  const htmlParts: string[] = []
  const plainParts: string[] = []

  for (const paragraph of paragraphs) {
    const replace = (text: string) => text.replace(BLANK_PLACEHOLDER, () => {
      blanks.push({ answer: '' })
      return `[___${blanks.length}]`
    })
    // Run over the readable text, not the markup: a placeholder never spans
    // two runs in a way that matters, and this keeps tags out of the match.
    htmlParts.push(`<p>${replace(inlinesToHtml(paragraph.inlines, { keepEmphasis: true }))}</p>`)
    plainParts.push(plainText(paragraph.inlines).replace(BLANK_PLACEHOLDER, '____'))
  }

  if (blanks.length === 0) return null
  return {
    html: htmlParts.join(''),
    plain: plainParts.join(' ').replace(/\s+/g, ' ').trim(),
    blanks,
  }
}

function readBlanks(paragraphs: DocxParagraph[]): BlankRead {
  const signal = blankSignal(paragraphs)
  // Marked words first: they say where the blank goes *and* what it accepts.
  // A worksheet that only leaves a gap says the first and not the second.
  if (!signal) {
    return readPlaceholderBlanks(paragraphs)
      ?? { html: paragraphsToHtml(paragraphs, { keepEmphasis: true }), plain: '', blanks: [] }
  }

  const blanks: DraftBlank[] = []
  const htmlParts: string[] = []
  const plainParts: string[] = []

  for (const paragraph of paragraphs) {
    let html = ''
    let plain = ''
    let pending: DocxInline[] = []

    const flush = () => {
      if (pending.length === 0) return
      const answer = plainText(pending).trim()
      if (answer) {
        blanks.push({ answer })
        const marker = `[___${blanks.length}]`
        html += marker
        plain += '____'
      }
      pending = []
    }

    for (const inline of paragraph.inlines) {
      const mark = signalOf(inline)
      if (mark?.[signal]) { pending.push(inline); continue }
      // Whitespace between two marked runs belongs to the answer, not between
      // two blanks.
      if (pending.length > 0 && inline.kind === 'text' && !inline.text.trim()) {
        pending.push(inline)
        continue
      }
      flush()
      html += inlinesToHtml([inline], { keepEmphasis: true })
      plain += plainText([inline])
    }
    flush()

    htmlParts.push(`<p>${html}</p>`)
    plainParts.push(plain)
  }

  return {
    html: htmlParts.join(''),
    plain: plainParts.join(' ').replace(/\s+/g, ' ').trim(),
    blanks,
  }
}

/** What may sit after a marked เฉลย and still leave it at the end of the โจทย์. */
const TRAILING_PUNCTUATION = /^[\s()（）.·]*$/

interface MarkedAnswerRead {
  answers: DraftAnswer[]
  /** The โจทย์ with the marked เฉลย taken out. */
  html: string
  /** The same as readable text, for the title. */
  plain: string
}

/** Brackets a teacher may have marked along with the value inside them. */
function withoutBrackets(text: string): string {
  const trimmed = text.trim()
  return /^[(（].*[)）]$/.test(trimmed) ? trimmed.slice(1, -1).trim() : trimmed
}

/**
 * The เฉลย a teacher marked at the end of a โจทย์.
 *
 * One marking convention for the whole product: the เฉลย of a ปรนัย, of a
 * เติมคำ and of a calculation are all the word written in red, in highlighter,
 * or in bold. A teacher learns it once.
 *
 * Only a mark at the *end* counts. Numbers inside the โจทย์ are the ones it
 * gives you, and a worksheet that emphasises them would otherwise have its
 * givens read as its answers. Brackets around the value are optional and are
 * dropped either way, so the worksheets that wrote "(2.5)" before this
 * convention existed keep working — `readAnswerKey` still reads those.
 */
function readMarkedAnswer(paragraphs: DocxParagraph[]): MarkedAnswerRead | null {
  const signal = blankSignal(paragraphs)
  if (!signal) return null

  const lastIndex = paragraphs.length - 1
  const last = paragraphs[lastIndex]
  if (!last) return null

  const inlines = last.inlines
  let end = inlines.length
  while (end > 0) {
    const inline = inlines[end - 1]
    if (signalOf(inline)?.[signal]) break
    // Only whitespace and brackets may follow the เฉลย; anything else means
    // the mark is inside the โจทย์ rather than at the end of it.
    if (inline.kind === 'text' && TRAILING_PUNCTUATION.test(inline.text)) { end -= 1; continue }
    return null
  }
  if (end === 0) return null

  let start = end
  while (start > 0) {
    const inline = inlines[start - 1]
    if (signalOf(inline)?.[signal]) { start -= 1; continue }
    // Word splits a phrase on its own; the space inside one belongs to it.
    if (start < end && inline.kind === 'text' && !inline.text.trim()) { start -= 1; continue }
    break
  }

  const answers = parseAnswerList(withoutBrackets(flattenAnswerText(plainText(inlines.slice(start, end)))))
  if (!answers) return null

  // Whatever is left of the last line, minus the punctuation the เฉลย sat in —
  // including the opening bracket, which Word usually leaves at the tail of the
  // run before it rather than in one of its own.
  let kept = inlines.slice(0, start)
  while (kept.length > 0) {
    const inline = kept[kept.length - 1]
    if (inline.kind !== 'text') break
    if (TRAILING_PUNCTUATION.test(inline.text)) { kept = kept.slice(0, -1); continue }
    const trimmed = inline.text.replace(/[\s(（]+$/, '')
    if (trimmed !== inline.text) kept = [...kept.slice(0, -1), { ...inline, text: trimmed }]
    break
  }

  const rewritten = paragraphs.map((paragraph, index) =>
    index === lastIndex ? { ...paragraph, inlines: kept } : paragraph)

  return {
    answers,
    html: paragraphsToHtml(rewritten, { keepEmphasis: true }),
    plain: paragraphsText(rewritten),
  }
}

/** A sub-question's เฉลย, marked or bracketed, whichever the file used. */
function readPartAnswer(paragraphs: DocxParagraph[]): { html: string; answers: DraftAnswer[] } {
  const marked = readMarkedAnswer(paragraphs)
  if (marked) return { html: marked.html, answers: marked.answers }
  return readAnswerKey(paragraphsToHtml(paragraphs, { keepEmphasis: true }))
}

/**
 * The statements of a ถูก-ผิด โจทย์, read off an answer key.
 *
 * A Thai paper writes them as "8.1 ……… ✓ …… ข้อความ (0.25 คะแนน)": the number
 * ties the statement to its โจทย์, the dots are the boxes to tick on paper, the
 * ✓ or x is the เฉลย, and the bracket at the end is what the statement is
 * worth. All four are the teacher's marking apparatus and none of them belong
 * in the statement a student reads, so all four come out.
 *
 * ✓ arrives here as a character only because `docx.ts` reads `w:sym`: it is
 * inserted from Word's symbol menu and is not text in the file at all.
 */
const STATEMENT_NUMBER = /^[\s ]*(\d{1,2})\s*\.\s*(\d{1,2})[\s.)]*/
const TICK_TRUE = /[✓✔☑]/
const TICK_FALSE = /[✗✘☒×]|(?:^|[\s…])[xX](?=$|[\s…])/
/** The dotted or underscored box a statement is ticked in. */
const TICK_BOX = /[…._\u2026]{2,}/g
/** "(0.25 คะแนน)" — what the statement is worth, not part of it. */
const SCORE_TAIL = /\s*\(\s*([0-9]+(?:\.[0-9]+)?)\s*คะแนน\s*\)\s*$/

/**
 * The lead-in of a ถูก-ผิด โจทย์, without the apparatus around it.
 *
 * The typed "8." is the โจทย์'s number on paper — the app draws its own — and
 * "(1 คะแนน)" is the total the statements already add up to. Neither is part
 * of the situation a student reads.
 */
function leadInHtml(html: string): string {
  return html
    .replace(/^(<p>(?:<[^>]+>)*)[\s ]*[0-9]{1,2}\s*[.)]\s*/, '$1')
    .replace(/\s*\(\s*[0-9]+(?:\.[0-9]+)?\s*คะแนน\s*\)\s*(?=(?:<\/[a-z]+>\s*)*$)/, '')
}

/** True when this paragraph is statement `m` of โจทย์ `number`. */
function statementOf(paragraph: DocxParagraph, number: number): number | null {
  const match = STATEMENT_NUMBER.exec(plainText(paragraph.inlines))
  if (!match) return null
  if (parseInt(match[1], 10) !== number) return null
  return parseInt(match[2], 10)
}

function readStatement(paragraph: DocxParagraph): DraftStatement {
  const text = plainText(paragraph.inlines)
  const marked = TICK_TRUE.test(text) ? true : TICK_FALSE.test(text) ? false : null

  const scoreMatch = SCORE_TAIL.exec(text.trim())
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : null

  const body = text
    .replace(STATEMENT_NUMBER, '')
    .replace(TICK_BOX, ' ')
    .replace(/[✓✔☑✗✘☒×]/g, ' ')
    // A lone x is the mark; an x inside a word (or a variable) is not.
    .replace(/(^|\s)[xX](?=\s|$)/g, ' ')
    .replace(SCORE_TAIL, '')
    .replace(/\s+/g, ' ')
    .trim()

  return { html: `<p>${escapeHtml(body)}</p>`, isTrue: marked, score }
}

// ─── Splitting the document into questions ───────────────────────────────────

/** `1)` `1.` `(1)` `ก)` `๑.` `a.` — how a choice or a sub-question is
 *  labelled. Thai digits count: a worksheet set in a Thai font numbers its
 *  ข้อ ๑ ๒ ๓ as readily as 1 2 3, and to the reader those were invisible. */
const CHOICE_MARKER = /^[\s ]*\(?\s*([0-9๐-๙]{1,2}|[ก-ฮ]|[a-hA-H])\s*[.)\]]\s*/

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

/**
 * "8." followed by "8.1" "8.2" — a โจทย์ that numbers its own sub-items.
 *
 * The plain typed-number reader only trusts a run that counts from 1, because
 * a stray "3." in a sentence is otherwise enough to split a document. Sub-
 * numbering carries its own proof: the children repeat the parent's number and
 * count up from one under it, which nothing accidental does. That lets a page
 * torn out of the middle of an exam — starting at ข้อ 8, as answer keys handed
 * round between teachers usually are — be read at all.
 */
function findSubNumberedHeads(blocks: DocxBlock[]): Set<number> {
  const heads = new Set<number>()

  blocks.forEach((block, index) => {
    if (block.kind !== 'paragraph') return
    const match = /^[\s ]*([0-9]{1,2})\s*[.)]\s*\S/.exec(plainText(block.inlines))
    if (!match) return
    // Not a head if it is itself a sub-item: "8.1" reads as "8." to the above.
    if (statementOf(block, parseInt(match[1], 10)) !== null) return

    const number = parseInt(match[1], 10)
    let expected = 1
    for (let at = index + 1; at < blocks.length; at++) {
      const next = blocks[at]
      if (next.kind !== 'paragraph') continue
      const position = statementOf(next, number)
      if (position === null) {
        // Another head ends the run; anything else is just prose in between.
        if (/^[\s ]*([0-9]{1,2})\s*[.)]\s*\S/.test(plainText(next.inlines))) break
        continue
      }
      if (position !== expected) break
      expected++
    }
    if (expected > 2) heads.add(index)
  })

  return heads
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

// ─── เรียงลำดับ: a list to put in order, and the order that is right ─────────
//
// On paper this type is written as a ปรนัย โจทย์, because paper cannot be
// dragged: the fragments are printed scrambled and numbered, and underneath
// them sit four permutations — "2-1-4-3", "2-1-3-4" — for the student to
// choose between. The web asks for the order directly, so the permutations are
// read to find out which order is right and are then thrown away; carrying
// them into the โจทย์ would print "2-1-4-3" under a drag list, where it means
// nothing.
//
// A worksheet that simply lists the steps in the right order and asks the
// student to reorder a shuffled copy is the other shape this reads, and the
// two are told apart by the lines themselves: "2-1-4-3" is not a step anyone
// is asked to put in order.

/** One number of an order, with the separators a paper writes between them. */
const ORDER_NUMBER = '[0-9]{1,2}'
const ORDER_GAP = '[\\s\\u00a0]*[-–—,/>→][\\s\\u00a0]*'
/** `2-1-4-3` — two or more numbers joined by dashes. A separator is required:
 *  without one, a line that reads "123" would be an order of 12 then 3. */
const ORDER_OPTION = new RegExp(`${ORDER_NUMBER}(?:${ORDER_GAP}${ORDER_NUMBER})+`, 'g')
/** The whole line, when it is nothing but orders — "2-1-4-3    2. 2-1-3-4" is
 *  two options laid out in columns, which Word writes as one tabbed line. */
const ORDER_LINE = new RegExp(
  `^[\\s\\u00a0]*${ORDER_NUMBER}(?:${ORDER_GAP}${ORDER_NUMBER})+`
  // Each further column, with or without a "2." of its own in front of it.
  + `(?:[\\s\\u00a0]*(?:\\(?${ORDER_NUMBER}[.)][\\s\\u00a0]*)?${ORDER_NUMBER}(?:${ORDER_GAP}${ORDER_NUMBER})+)*`
  + `[\\s\\u00a0]*$`,
)

interface OrderOption {
  order: number[]
  /** Where it sits in the line, so the mark on *this* option can be read even
   *  when a tab put four of them on one line. */
  start: number
  end: number
}

/** Every order written on this line, or none when the line is a step. */
function readOrderOptions(text: string): OrderOption[] {
  if (!ORDER_LINE.test(text)) return []
  const found: OrderOption[] = []
  for (const match of text.matchAll(ORDER_OPTION)) {
    const order = match[0].split(/[^0-9]+/).filter(Boolean).map(Number)
    found.push({ order, start: match.index, end: match.index + match[0].length })
  }
  return found
}

/** Whether an order actually arranges the items — each one once, none missing. */
function isCompleteOrder(order: number[], count: number): boolean {
  if (count < 2 || order.length !== count) return false
  return new Set(order).size === count && order.every(value => value >= 1 && value <= count)
}

/**
 * The line's text, with the formatting that carries the เฉลย kept per character.
 *
 * Reading marks per paragraph is enough everywhere else, because everywhere
 * else one paragraph is one thing to mark. Four options separated by tabs are
 * four things on one paragraph, and the only record of which one the teacher
 * coloured is where in the line the colour starts.
 */
function markedCharacters(paragraphs: DocxParagraph[]): { text: string; marks: (MarkFlags | null)[] } {
  let text = ''
  const marks: (MarkFlags | null)[] = []
  const push = (value: string, mark: MarkFlags | null) => {
    text += value
    for (let at = 0; at < value.length; at++) marks.push(mark)
  }

  paragraphs.forEach((paragraph, index) => {
    if (index > 0) push(' ', null)
    for (const inline of paragraph.inlines) {
      if (inline.kind === 'text') push(inline.text, signalOf(inline))
      else if (inline.kind === 'math') push(inline.plain, null)
      else if (inline.kind === 'break' || inline.kind === 'tab') push(' ', null)
    }
  })

  return { text, marks }
}

function mergeMarks(marks: (MarkFlags | null)[]): MarkFlags {
  const merged: MarkFlags = { ...NO_MARKS }
  for (const mark of marks) {
    if (!mark) continue
    for (const key of Object.keys(merged) as (keyof MarkFlags)[]) {
      if (mark[key]) merged[key] = true
    }
  }
  return merged
}

interface OrderLine {
  /** Plain text with the `1)` Word or the teacher printed in front taken off. */
  text: string
  /** The same text, with per-character marks, for lines holding several orders. */
  marked: { text: string; marks: (MarkFlags | null)[] }
  paragraphs: DocxParagraph[]
}

export interface OrderingRead {
  items: string[]
  choices: DraftOrderChoice[]
  /** Paragraphs the orders were written on that carry no number of their own,
   *  so the คำสั่ง can drop them. A line reading "2-1-4-3" left in the โจทย์
   *  is the paper's own scaffolding printed under a drag list. */
  consumed: DocxParagraph[]
}

/**
 * Reads the labelled lines of one ข้อ as a list to put in order.
 *
 * Returns null when there is nothing to order, so the โจทย์ falls back to
 * whatever it would otherwise have been read as — a file the teacher filed
 * under เรียงลำดับ can still hold a บรรยาย ข้อ, and inventing an empty list for
 * it helps nobody.
 */
function readOrdering(chunks: ChunkItem[]): OrderingRead | null {
  const lines: OrderLine[] = chunks.flatMap(chunk => {
    const paragraphs = chunk.kind === 'marker' ? chunk.item.paragraphs
      : chunk.kind === 'sub' ? [chunk.paragraph]
        : null
    if (!paragraphs) return []

    const marked = markedCharacters(paragraphs)
    const marker = CHOICE_MARKER.exec(marked.text)
    // The label belongs to the list, not to the step: "1) ตั้งปัญหา" is the
    // step ตั้งปัญหา, and Word prints its own number for a ก) ข) sub-list.
    const offset = chunk.kind === 'marker' && marker ? marker[0].length : 0
    return [{
      text: chunk.kind === 'marker'
        ? stripMarker(paragraphsToPlain(paragraphs))
        : paragraphsToPlain(paragraphs),
      marked: { text: marked.text.slice(offset), marks: marked.marks.slice(offset) },
      paragraphs,
    }]
  })

  if (lines.length < 2) return null

  // A paper that sets its orders in two columns often leaves the second one
  // without a number of its own, and then the line carries no marker at all
  // and would otherwise have joined the คำสั่ง. Pure digits and dashes is not
  // something a คำสั่ง says, so such a line is read here and taken out below.
  const loose: OrderLine[] = chunks.flatMap(chunk => {
    if (chunk.kind !== 'stem') return []
    const marked = markedCharacters([chunk.paragraph])
    if (readOrderOptions(marked.text).length === 0) return []
    return [{ text: paragraphsToPlain([chunk.paragraph]), marked, paragraphs: [chunk.paragraph] }]
  })

  // Classified off the same text the marks are indexed against, so a line can
  // never be an option by one reading and a step by the other.
  const read = [...lines, ...loose].map(line => ({ line, options: readOrderOptions(line.marked.text) }))
  const steps = read.filter(({ options }) => options.length === 0).map(({ line }) => line)
  const offered = read.flatMap(({ line, options }) => options.map(option => ({ line, option })))

  // Both halves have to be there before a line of digits is read as a เฉลย
  // rather than as a step. One "1-2" inside a list of five steps is part of a
  // step; four of them under four fragments is the ปรนัย an exam paper writes.
  const isExamPaper = offered.length >= 2 && steps.length >= 2
    && offered.every(({ option }) => isCompleteOrder(option.order, steps.length))

  if (!isExamPaper) {
    // Nothing offered an order, so the list is already in the one that is
    // right — which is what a worksheet means by writing the steps down. An
    // unnumbered line stays in the คำสั่ง it came from.
    return { items: lines.map(line => line.text), choices: [], consumed: [] }
  }

  const correct = correctByMarks(offered.map(({ line, option }) =>
    mergeMarks(line.marked.marks.slice(option.start, option.end))))

  return {
    items: steps.map(line => line.text),
    choices: offered.map(({ option }, index) => ({ order: option.order, isCorrect: correct[index] })),
    consumed: loose.flatMap(line => line.paragraphs),
  }
}

// ─── จับคู่: two columns, and which line joins which ─────────────────────────
//
// A worksheet writes this as a two-column table: the ข้อ down the left with a
// row of dots in front of each, and the choices down the right labelled ก ข ค.
// The เฉลย is the letter written into the dots — in red, the same mark every
// other type uses — and it points at the choice carrying that letter.
//
// Two things about real files decide the shape of everything here.
//
//   The rows are not the answer. Left and right are deliberately out of step,
//   so a ข้อ read as "row 1 pairs with row 1" would be an answer key that is
//   wrong on nearly every line. The only pairing the file states is the one
//   written in the dots.
//
//   The second column is longer. Ten ข้อ against twelve choices is normal: the
//   two spare ones are there so the last ข้อ cannot be had by elimination.
//   Those become `distractors`, which the โจทย์ type now carries.

/** A single letter or number standing in a blank — what a เฉลย looks like here. */
const MATCH_KEY = /^[\s\u00a0]*\(?[\s\u00a0]*([0-9\u0e50-\u0e59]{1,2}|[ก-ฮ]|[a-zA-Z])[\s\u00a0]*[.)\]]?[\s\u00a0]*$/
/** The dots or underscores a worksheet leaves for the answer to be written in. */
const MATCH_BLANK = /^[\s\u00a0.…_·\u2026\-]+/
/** A ข้อ that asks for lines to be drawn rather than letters to be written. */
const DRAWS_LINES = /โยงเส้น|ลากเส้น|โยงเข้าหากัน/

export interface DraftMatchPair {
  leftText: string
  rightText: string
  leftRelId?: string
  rightRelId?: string
  /** True when the file said this pairing. False means the two were left over
   *  once the stated pairings were taken, and lined up in the order printed —
   *  a placeholder the teacher has to settle, never an answer. */
  keyed: boolean
}

export interface DraftMatchDistractor {
  text: string
  relId?: string
}

export interface DraftMatching {
  pairs: DraftMatchPair[]
  distractors: DraftMatchDistractor[]
  /** Read from the ข้อ's own wording: "จงโยงเส้น" asks for lines. */
  answerMode: MatchingAnswerMode
  /** How many of `pairs` the file actually stated. Anything short of all of
   *  them means the โจทย์ cannot be imported until the teacher pairs the rest. */
  keyedCount: number
}

interface MatchCell {
  /** Marker-stripped text — the ข้อ or the choice, without its ๑. or ก. */
  text: string
  /** The ๑ / ก the page prints in front, which is what a เฉลย points at. */
  marker: string
  /** The letter written into this cell's blank, when it has one. */
  key: string
  relId?: string
  empty: boolean
}

/**
 * Reads one cell of the table: its label, its text, and any เฉลย written in.
 *
 * The เฉลย is a single letter sitting inside the row of dots. Preferably it is
 * marked in red, highlighter or bold like every other answer key in this
 * importer; failing that, a lone letter between the dots is taken as one
 * anyway, because its position says what the colour would have said and a
 * teacher who typed the key in black should not have to redo the file.
 */
function readMatchCell(paragraphs: DocxParagraph[]): MatchCell {
  const marked = markedCharacters(paragraphs)
  const markerMatch = CHOICE_MARKER.exec(marked.text)
  const marker = markerMatch ? markerMatch[1] : ''
  const offset = markerMatch ? markerMatch[0].length : 0

  const body = marked.text.slice(offset)
  const marks = marked.marks.slice(offset)

  // The most deliberate signal that covers part of this cell and not all of
  // it — the same rule the ปรนัย key and the เติมคำ blanks are read with.
  const signal = blankSignal(paragraphs)
  let key = ''
  let keyStart = -1
  let keyEnd = -1

  if (signal) {
    let at = 0
    while (at < body.length && keyStart === -1) {
      if (marks[at]?.[signal] && body[at].trim()) {
        let end = at
        while (end < body.length && (marks[end]?.[signal] || !body[end].trim())) end++
        const text = body.slice(at, end)
        if (MATCH_KEY.test(text)) {
          key = MATCH_KEY.exec(text)![1]
          keyStart = at
          keyEnd = end
        }
        at = end
      } else {
        at++
      }
    }
  }

  if (!key) {
    // Nothing marked: a lone letter with dots on both sides of it is still a
    // เฉลย, because nothing else is ever written there.
    const inBlank = /[.…_·\u2026]{2,}[\s\u00a0]*([0-9\u0e50-\u0e59]{1,2}|[ก-ฮ]|[a-zA-Z])[\s\u00a0]*[.…_·\u2026]{2,}/.exec(body)
    if (inBlank) {
      key = inBlank[1]
      keyStart = inBlank.index + inBlank[0].indexOf(key)
      keyEnd = keyStart + key.length
    }
  }

  const withoutKey = keyStart === -1 ? body : body.slice(0, keyStart) + body.slice(keyEnd)
  const text = withoutKey.replace(MATCH_BLANK, '').replace(/\s+/g, ' ').trim()
  const relId = collectImages(paragraphs).relIds[0]

  return { text, marker, key, relId, empty: !text && !relId }
}

/** Every two-column table in the ข้อ, read as rows of left and right cells. */
function readMatchRows(blocks: DocxBlock[]): { rows: Array<[MatchCell, MatchCell]>; consumed: Set<DocxBlock> } {
  const rows: Array<[MatchCell, MatchCell]> = []
  const consumed = new Set<DocxBlock>()

  for (const block of blocks) {
    if (block.kind !== 'table') continue
    if (!block.rows.some(row => row.length >= 2)) continue
    consumed.add(block)
    for (const row of block.rows) {
      if (row.length < 2) continue
      rows.push([readMatchCell(row[0]), readMatchCell(row[1])])
    }
  }

  return { rows, consumed }
}

/**
 * Turns those rows into pairs, distractors, and an honest count of how much of
 * it the file actually stated.
 *
 * A ข้อ whose เฉลย is written gets the choice carrying that letter. A ข้อ with
 * nothing written gets whatever choice is left, in printed order — not because
 * that is likely to be right, but because `MatchingPair` has no way to hold a
 * prompt with no partner, and the ข้อ is held back from the คลัง until the
 * teacher has settled it. Whatever is left over at the end is a choice that
 * belongs to no ข้อ, which is exactly what a distractor is.
 */
function pairUp(rows: Array<[MatchCell, MatchCell]>, answerMode: MatchingAnswerMode): DraftMatching | null {
  const prompts = rows.map(row => row[0]).filter(cell => !cell.empty)
  const choices = rows.map(row => row[1]).filter(cell => !cell.empty)
  if (prompts.length < 2 || choices.length < 2) return null

  const takenChoice = new Set<number>()
  const answerFor = prompts.map(prompt => {
    if (!prompt.key) return -1
    const at = choices.findIndex((choice, index) =>
      !takenChoice.has(index) && choice.marker === prompt.key)
    if (at === -1) return -1
    takenChoice.add(at)
    return at
  })

  const spare = choices.map((_, index) => index).filter(index => !takenChoice.has(index))
  let nextSpare = 0

  const pairs: DraftMatchPair[] = prompts.map((prompt, index) => {
    const keyed = answerFor[index] !== -1
    const choice = keyed ? choices[answerFor[index]] : choices[spare[nextSpare++]]
    return {
      leftText: prompt.text,
      rightText: choice?.text ?? '',
      ...(prompt.relId ? { leftRelId: prompt.relId } : {}),
      ...(choice?.relId ? { rightRelId: choice.relId } : {}),
      keyed,
    }
  })

  const distractors: DraftMatchDistractor[] = spare.slice(nextSpare).map(index => ({
    text: choices[index].text,
    ...(choices[index].relId ? { relId: choices[index].relId } : {}),
  }))

  return { pairs, distractors, answerMode, keyedCount: pairs.filter(pair => pair.keyed).length }
}

/** Reads the จับคู่ table of one ข้อ, or null when it holds none. */
function readMatching(head: DocxParagraph, blocks: DocxBlock[]): { result: DraftMatching; consumed: Set<DocxBlock> } | null {
  const { rows, consumed } = readMatchRows(blocks)
  if (rows.length === 0) return null

  // The ข้อ says how it wants to be answered, in the words a teacher already
  // writes: "จงโยงเส้นจับคู่" is the line-drawing layout, anything else is the
  // one where a letter is written into the blank.
  const wording = paragraphsText([head, ...blocks.flatMap(block =>
    block.kind === 'paragraph' ? [block] : [])])
  const result = pairUp(rows, DRAWS_LINES.test(wording) ? 'lines' : 'slots')
  return result ? { result, consumed } : null
}

/** Puts the items in the order an option claims, or leaves them as they are. */
export function applyOrder<T>(items: T[], order: number[]): T[] {
  if (!isCompleteOrder(order, items.length)) return items
  return order.map(position => items[position - 1])
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
  options: ParseOptions = {},
): DraftQuestion {
  // Statements are taken out first, so nothing downstream mistakes "8.1" for
  // a ตัวเลือก or a sub-question — which is exactly what it looks like to the
  // marker reader that runs below.
  const statements: DraftStatement[] = []
  if (options.expect === 'true_false') {
    // Matched against the number the file writes, not the โจทย์'s position:
    // an answer key torn out of a longer exam starts at ข้อ 8 and its
    // statements are 8.1, 8.2 — not 1.1.
    const typed = /^[\s ]*([0-9]{1,2})\s*[.)]/.exec(plainText(head.inlines))
    const parent = typed ? parseInt(typed[1], 10) : number

    body = body.filter(block => {
      if (block.kind !== 'paragraph') return true
      // Either numbered by hand as "8.1", or by Word as a deeper level of the
      // list the โจทย์ itself is numbered with. Worksheets use both.
      const typedStatement = statementOf(block, parent) !== null
      const listStatement = !!head.numId && block.numId === head.numId && block.ilvl > head.ilvl
      if (!typedStatement && !listStatement) return true
      statements.push(readStatement(block))
      return false
    })
  }

  // Read before the body is flattened: a จับคู่ lives entirely inside one
  // table, and which cell sits beside which is the whole โจทย์. The generic
  // table reader below throws that away, cell by cell, in reading order.
  let matching: DraftMatching | null = null
  if (options.expect === 'matching') {
    const read = readMatching(head, body)
    if (read) {
      matching = read.result
      body = body.filter(block => !read.consumed.has(block))
    }
  }

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
  // Only when the teacher said so — see `ParseOptions`. A เรียงลำดับ ข้อ and a
  // ปรนัย one are the same four numbered lines on the page.
  const ordering = options.expect === 'ordering' ? readOrdering(items) : null
  const treatAsChoices = !ordering && !matching && looksLikeChoices(markerItems)

  const orderLines = new Set(ordering?.consumed ?? [])
  const stemParagraphs = [head, ...items.flatMap(item =>
    item.kind === 'stem' && !orderLines.has(item.paragraph) ? [item.paragraph] : [])]
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
  // Those same lines are the list to put in order; reading them twice would
  // print every step under the คำสั่ง as well (`withPartsInBody`).
  for (const item of ordering ? [] : items) {
    if (item.kind === 'sub') {
      const ordinal = (ordinals.get(item.paragraph.ilvl) ?? 0) + 1
      ordinals.set(item.paragraph.ilvl, ordinal)
      const read = readPartAnswer([item.paragraph])
      parts.push({
        id: `part-${number}-${partIndex++}`,
        label: levelLabel(levels?.get(item.paragraph.ilvl), ordinal),
        html: read.html,
        answers: read.answers,
      })
    } else if (item.kind === 'marker' && !treatAsChoices) {
      const read = readPartAnswer(item.item.paragraphs)
      parts.push({
        id: `part-${number}-${partIndex++}`,
        // The ก) the app draws as a label of its own is not part of the text.
        html: stripMarkerFromHtml(read.html),
        label: item.item.marker,
        answers: read.answers,
      })
    }
  }

  const allParagraphs = [
    ...stemParagraphs,
    ...markerItems.flatMap(item => item.paragraphs),
    ...items.flatMap(item => item.kind === 'sub' ? [item.paragraph] : []),
  ]
  const { relIds } = collectImages(allParagraphs)
  const fullText = paragraphsText(allParagraphs)

  // Only read when the teacher said the file is เติมคำ — see `ParseOptions`.
  const blanked = options.expect === 'fill_blank' && !treatAsChoices ? readBlanks(stemParagraphs) : null
  const useBlanks = (blanked?.blanks.length ?? 0) > 0

  // A โจทย์ with ตัวเลือก is graded on the marked one; a bracket at the end of
  // it is part of an option, not a เฉลย of its own. A เติมคำ โจทย์ is graded on
  // its own ช่องว่าง, so it is not read for one either.
  // A เรียงลำดับ โจทย์ is graded on the order of its list, so its คำสั่ง is not
  // read for a เฉลย either — and the one number a paper marks there is an
  // option, which `readOrdering` has already taken.
  const isTrueFalse = statements.length > 0
  const gradedElsewhere = treatAsChoices || useBlanks || isTrueFalse || !!ordering || !!matching
  const markedStem = gradedElsewhere ? null : readMarkedAnswer(stemParagraphs)
  const stem = gradedElsewhere
    ? {
      answers: [],
      html: isTrueFalse
        ? leadInHtml(paragraphsToHtml(stemParagraphs, { keepEmphasis: true }))
        : blanked?.html ?? paragraphsToHtml(stemParagraphs, { keepEmphasis: true }),
    }
    : markedStem ?? readAnswerKey(paragraphsToHtml(stemParagraphs, { keepEmphasis: true }))

  const answerCounts = [stem.answers.length, ...parts.map(part => part.answers.length)]
  const hasAnswers = answerCounts.some(count => count > 0)
  // Titled by the โจทย์ as it now reads, so an imported ข้อ is not named after
  // its own answer. Taken off the readable text rather than off the HTML,
  // because a formula reads as "15√2" there and as TeX in the markup.
  const stemPlain = useBlanks
    ? (blanked?.plain ?? '')
    : isTrueFalse
      // Titled by the lead-in as the โจทย์ now reads it: without the number the
      // app draws itself, and without the total the statements add up to.
      ? paragraphsText(stemParagraphs)
        .replace(/^[\s ]*[0-9]{1,2}\s*[.)]\s*/, '')
        .replace(/\s*\(\s*[0-9]+(?:\.[0-9]+)?\s*คะแนน\s*\)\s*$/, '')
        .trim()
      : markedStem?.plain ?? paragraphsText(stemParagraphs)
  const stemText = !markedStem && stem.answers.length > 0
    ? stemPlain.replace(/\s*\([^()]*\)\s*$/, '').trim()
    : stemPlain

  const warnings: DraftWarning[] = []

  const unmarked = statements
    .map((statement, index) => ({ statement, position: index + 1 }))
    .filter(({ statement }) => statement.isTrue === null)
  if (unmarked.length > 0) {
    // Unmarked becomes ผิด, which is the convention of the paper it came from
    // — but a statement the teacher merely forgot would mark every student
    // wrong on it, so it is said out loud rather than assumed.
    warnings.push({
      code: 'unmarked-statement',
      message: `ข้อความที่ ${unmarked.map(item => item.position).join(', ')} ไม่พบเครื่องหมาย ✓ หรือ x — ระบบจะถือว่าผิด ตรวจก่อนนำเข้า`,
    })
  }

  if (answerCounts.some(count => count > 1)) {
    warnings.push({
      code: 'multi-answer',
      message: 'ข้อนี้มีเฉลยหลายค่า ระบบแยกเป็นช่องกรอกให้แล้ว — ตรวจว่าเรียงตรงกับที่โจทย์ถาม',
    })
  }

  if (hasStructuredMath(allParagraphs)) {
    warnings.push({
      code: 'equation',
      message: 'ข้อนี้มีสูตรที่พิมพ์ด้วยเครื่องมือสมการของ Word — ตรวจตัวเลขและสูตรอีกครั้ง',
    })
  }

  // A picture sitting on one of the lines to order cannot be told apart, in
  // the file, from a picture sitting under the คำสั่ง — Word anchors both to a
  // paragraph and the โจทย์ owns the paragraphs either way. It arrives as a
  // picture of the whole ข้อ, and the teacher moves it onto the item itself in
  // the form, which is said here rather than left to be discovered.
  if (ordering && collectImages(markerItems.flatMap(item => item.paragraphs)
    .concat(items.flatMap(item => item.kind === 'sub' ? [item.paragraph] : []))).relIds.length > 0) {
    warnings.push({
      code: 'order-item-image',
      message: 'มีรูปอยู่ในรายการที่ต้องเรียง — รูปเข้ามาเป็นรูปของทั้งข้อ ถ้าต้องการให้อยู่ในรายการใดรายการหนึ่ง ใส่เองในฟอร์ม',
    })
  }

  // Two or three ก) ข) lines could be ตัวเลือก or sub-questions — unless each
  // one ends in its own เฉลย, which a ตัวเลือก never does.
  const partsAnswered = parts.some(part => part.answers.length > 0)
  if (!ordering && !matching && markerItems.length > 0 && markerItems.length <= 3 && !partsAnswered) {
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
    // Without ตัวเลือก and without a เฉลย there is nothing to grade against, so
    // the โจทย์ comes in as one the teacher marks by hand. Switching it to
    // อัตนัย and typing the answer is one control on the import screen.
    type: statements.length > 0
      ? 'true_false'
      : matching ? 'matching'
        : ordering ? 'ordering'
          : treatAsChoices ? 'mcq' : useBlanks ? 'fill_blank' : hasAnswers ? 'written' : 'essay',
    title: buildTitle(stemText, number),
    html: stem.html,
    choices,
    parts,
    answers: stem.answers,
    blanks: blanked?.blanks ?? [],
    statements,
    orderItems: ordering?.items ?? [],
    orderChoices: ordering?.choices ?? [],
    matching,
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

/** Longest a line can be and still read as a heading rather than as content. */
const SECTION_HEADING_MAX = 80

/**
 * A paragraph that heads a section of the paper rather than belonging to a โจทย์.
 *
 * "ตอนที่ 2 แสดงวิธีทำ" sits between two โจทย์, so without this it lands at the
 * end of the one above it — in its body *and* in its title. An exam split into
 * ตอนที่ 1 / ตอนที่ 2 is the ordinary shape of a Thai paper and the whole reason
 * the automatic reader exists, so this is the common case, not an edge one.
 *
 * Only ever asked of the last paragraphs of a โจทย์'s body, because that is the
 * only place a heading for what comes *next* can be. What it matches is narrow
 * for the same reason: a short line that is either styled as a Word heading, or
 * centred and entirely bold. A line inside a โจทย์ is left-aligned, and nothing
 * that matches is thrown away — it is reported as skipped, next to the ones
 * found before the first โจทย์.
 */
function isSectionHeading(block: DocxBlock): block is DocxParagraph {
  if (block.kind !== 'paragraph') return false
  // A numbered paragraph is a โจทย์ or one of its ก) ข) parts.
  if (block.numId) return false
  if (block.inlines.some(inline => inline.kind === 'image')) return false

  const text = plainText(block.inlines).trim()
  if (!text || text.length > SECTION_HEADING_MAX) return false
  // "1) วัตต์" is a ตัวเลือก, however it is styled.
  if (matchMarker(text)) return false

  if (/^heading/i.test(block.styleId ?? '')) return true

  const words = block.inlines.filter(inline => inline.kind === 'text' && inline.text.trim())
  return block.centered && words.length > 0 && words.every(inline => inline.kind === 'text' && inline.format.bold)
}

export function buildDrafts(document: DocxDocument, options: ParseOptions = {}): DraftResult {
  const list = findQuestionList(document)
  const typed = list
    ? new Set<number>()
    : (() => {
      const counted = findTypedNumbering(document.blocks)
      return counted.size > 0 ? counted : findSubNumberedHeads(document.blocks)
    })()

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

    // Anything heading the *next* section is sitting at the end of this โจทย์.
    // Taken off the body and reported with the document's other headings, so a
    // line this reads wrongly is one the teacher can see was set aside.
    let bodyEnd = body.length
    while (bodyEnd > 0 && isSectionHeading(body[bodyEnd - 1])) bodyEnd--
    for (const skipped of body.slice(bodyEnd)) {
      const text = plainText((skipped as DocxParagraph).inlines).trim()
      if (text) preamble.push(text)
    }

    return buildQuestion(head, body.slice(0, bodyEnd), position + 1, list ? document.numbering.get(list.numId) : undefined, options)
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

  const numbering: NumberingSource = list ? 'list' : typed.size > 0 ? 'typed' : 'none'

  return { questions, preamble, numbering, floatingImageRelIds: [...floating] }
}
