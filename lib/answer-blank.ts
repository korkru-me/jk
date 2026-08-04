import { splitHtmlOnMarker, splitHtmlOnPattern } from './text-blank'

// Marker teachers type (or insert via a "+ [คำตอบ]" button) to place the
// student's answer input inline within a single field of text (a
// sub-question's own phrasing) — exactly one per field, no number needed.
export const ANSWER_BLANK = '[คำตอบ]'

// Splits text (plain, or rich-text HTML) at the single ANSWER_BLANK marker it
// contains. Returns null if the marker isn't present exactly once — callers
// fall back to non-inline rendering in that case.
export function splitAnswerBlankHtml(html: string): [string, string] | null {
  if (!html) return null
  const parts = splitHtmlOnMarker(html, ANSWER_BLANK)
  return parts.length === 2 ? [parts[0], parts[1]] : null
}

// Numbered variant — for a single block of text (the main question stem)
// that can hold *multiple* answer blanks, each visibly labeled so it's clear
// which blank pairs with which "correct answer" field below it. The number
// is optional in the pattern so plain old [คำตอบ] (no digits) still matches,
// getting assigned the next position in sequence — keeps older saved
// questions (written before numbering existed) working.
const NUMBERED_ANSWER_BLANK_PATTERN = /\[คำตอบ(?:\s+(\d+))?\]/

export function numberedAnswerBlank(n: number): string {
  return `[คำตอบ ${n}]`
}

export function countAnswerBlanks(html: string): number {
  if (!html) return 0
  const re = new RegExp(NUMBERED_ANSWER_BLANK_PATTERN.source, 'g')
  return (html.match(re) ?? []).length
}

// Splits the main question text on every (numbered or bare) answer-blank
// marker, in document order. Returns the text fragments between/around each
// blank alongside the blank's number (bare markers are numbered by their
// position among all blanks found). parts.length === numbers.length + 1.
export function splitNumberedAnswerBlanks(html: string): { parts: string[]; numbers: number[] } {
  const { parts, captures } = splitHtmlOnPattern(html, NUMBERED_ANSWER_BLANK_PATTERN)
  const numbers = captures.map((c, i) => c ? parseInt(c, 10) : i + 1)
  return { parts, numbers }
}

// Just the numbers, in document order — e.g. for labeling each "correct
// answer" field to match the blank it belongs to.
export function extractAnswerBlankNumbers(html: string): number[] {
  return splitNumberedAnswerBlanks(html).numbers
}

// The next number the "+ insert answer" button should use — one past
// whatever's already the highest in the text, so it never collides even if a
// blank was deleted from the middle (leaving a gap).
export function nextAnswerBlankNumber(html: string): number {
  const numbers = extractAnswerBlankNumbers(html)
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1
}
