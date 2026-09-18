/**
 * The เฉลย a teacher writes in brackets at the end of a โจทย์.
 *
 * Worksheets of calculation questions carry their answers in the file, in the
 * one place that reads naturally on paper: `(2.5)`, `(25 rad/s)`, `(14pi)`,
 * `(200 m/s, 10 m/s²)`. This reads that line, and it does two jobs that have to
 * happen together — take the answer out of the โจทย์ and keep it as the key.
 * Reading it without removing it would publish every answer to the students
 * sitting the paper, which is worse than not reading it at all.
 *
 * What counts as an answer is deliberately narrow. The bracket must sit at the
 * very end, hold no nested brackets, and start with something a calculator
 * could evaluate. "(ดังรูป)" is not an answer and neither is "(2 คะแนน)" — a
 * number followed by a word that means a score rather than a quantity.
 *
 * The formula is left as text for the app's own evaluator (mathjs) rather than
 * computed here: `25/pi` is a more faithful record of what the teacher wrote
 * than `7.9577…`, it is what the อัตนัย form shows in its own field, and a
 * โจทย์ whose answer is a formula is what the rest of the คลัง already stores.
 */

export interface DraftAnswer {
  /** Evaluated by the app's own evaluator: `2.5`, `14*pi`, `-2*pi/3`, `25/pi`. */
  formula: string
  /** Shown beside the input: `rad/s`, `เมตร`, `รอบ`. Never graded on. */
  unit: string
}

export interface AnswerKeyRead {
  /** In the order they were written; more than one when separated by commas. */
  answers: DraftAnswer[]
  /** The โจทย์ with the bracket taken out. */
  html: string
}

/**
 * A bracket at the very end, allowing only the inline markup a unit carries.
 *
 * Letting `<` through unrestricted would let the match run from a bracket in
 * one paragraph to one in another, and swallow everything between.
 */
const TRAILING_BRACKET =
  /\s*\(((?:[^()<]|<\/?(?:sup|sub|strong|em|u)>)*)\)\s*(?=(?:<\/(?:p|strong|em|u|sup|sub)>\s*)*$)/

/** Digits that Word wrote as a superscript, kept as characters for the unit. */
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
}

/** Words that make a bracketed number something other than an answer. */
const NOT_UNITS = new Set(['คะแนน', 'คะเเนน', 'ข้อ', 'marks', 'mark', 'points', 'point'])

/** Longest a bracket can be and still be an answer rather than an aside. */
const MAX_LENGTH = 80

function flatten(inner: string): string {
  return inner
    .replace(/<sup>([0-9]+)<\/sup>/g, (_, digits: string) =>
      [...digits].map(digit => SUPERSCRIPT[digit] ?? digit).join(''))
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Characters that can be part of a value on their own. */
const MATH_CHARACTER = /[0-9.\s+\-*/^()]/

/**
 * Splits `200 m/s` into the value and the unit.
 *
 * Scans from the left for as long as what it sees could be arithmetic — digits,
 * operators, brackets, and the word `pi`, which is how these worksheets write π.
 * The first character that cannot be (`m` here, or Thai) ends the value and
 * begins the unit. That is what stops `m/s` from being read as a division.
 */
function splitValueAndUnit(piece: string): { value: string; unit: string } | null {
  let at = 0
  let sawNumber = false

  while (at < piece.length) {
    const character = piece[at]
    if (MATH_CHARACTER.test(character)) {
      if (/[0-9]/.test(character)) sawNumber = true
      at += 1
      continue
    }
    if (piece.slice(at, at + 2).toLowerCase() === 'pi') { sawNumber = true; at += 2; continue }
    if (character === 'π') { sawNumber = true; at += 1; continue }
    break
  }

  const value = piece.slice(0, at).trim()
  const unit = piece.slice(at).trim()
  if (!sawNumber || !value) return null
  return { value, unit }
}

/** `14pi` is how a teacher writes it and `14*pi` is what an evaluator reads. */
function toFormula(value: string): string | null {
  const formula = value
    .replace(/π/g, 'pi')
    .replace(/PI/gi, 'pi')
    .replace(/(\d)\s*pi/g, '$1*pi')
    .replace(/pi\s*(\d)/g, 'pi*$1')
    .replace(/\s+/g, '')

  // Anything that is not plainly arithmetic is not written down as an answer:
  // a formula the evaluator chokes on would be frozen into every attempt as
  // its error text, and mark every student wrong without saying so.
  if (!/^[-+]?(?:\d|pi|[.+\-*/^()])+$/.test(formula)) return null
  if (/[+\-*/^.]$/.test(formula)) return null

  let depth = 0
  for (const character of formula) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (depth < 0) return null
  }
  if (depth !== 0) return null

  return formula
}

function parsePiece(piece: string): DraftAnswer | null {
  const split = splitValueAndUnit(piece.trim())
  if (!split) return null
  if (NOT_UNITS.has(split.unit.toLowerCase())) return null

  const formula = toFormula(split.value)
  if (!formula) return null

  return { formula, unit: split.unit }
}

/**
 * Reads the เฉลย out of one โจทย์ or sub-question.
 *
 * Returns the โจทย์ unchanged, with no answers, whenever the bracket is not one
 * — which is the common case for everything that is not a calculation.
 */
export function readAnswerKey(html: string): AnswerKeyRead {
  const match = TRAILING_BRACKET.exec(html)
  if (!match) return { answers: [], html }

  // An unclosed bracket in front of this one means the writing is not the
  // shape this reads, and taking the inner half would leave a stray "(" in
  // the โจทย์.
  if (html.slice(0, match.index).trimEnd().endsWith('(')) return { answers: [], html }

  const inner = flatten(match[1])
  if (!inner || inner.length > MAX_LENGTH) return { answers: [], html }

  const pieces = inner.split(/[,;]/).map(piece => piece.trim()).filter(Boolean)
  if (pieces.length === 0) return { answers: [], html }

  const answers: DraftAnswer[] = []
  for (const piece of pieces) {
    const answer = parsePiece(piece)
    // All or nothing: half a key read out of "(4 rad/s², ดูวิธีทำท้ายเล่ม)"
    // would leave the โจทย์ with an answer it does not have.
    if (!answer) return { answers: [], html }
    answers.push(answer)
  }

  return { answers, html: html.slice(0, match.index) + html.slice(match.index + match[0].length) }
}
