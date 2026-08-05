import type { FillBlankConfig, FillBlankItem, FillBlankType } from './types'
import { splitHtmlOnPattern } from './text-blank'

// Old questions were saved with a single config-level `grading_mode` and no
// per-item `type`. New saves always set `type` on every blank, so this only
// falls back to `grading_mode` for legacy data.
export function getBlankType(
  config: Pick<FillBlankConfig, 'grading_mode'> | null | undefined,
  blank: Pick<FillBlankItem, 'type'> | null | undefined,
): FillBlankType {
  if (blank?.type) return blank.type
  return config?.grading_mode === 'manual' ? 'text' : 'fixed'
}

// Marker teachers insert (via the "+ แทรกช่องกรอก" button, or by typing it
// directly) to place a blank inline in the question text. Numbered so each
// blank is visibly labeled and lines up with its "ตั้งค่าแต่ละช่องกรอก" card
// below — e.g. [___1], [___2]. The number is optional in the pattern so
// plain old [___] (no digits, from before numbering existed) still matches,
// getting assigned the next position in sequence — keeps older saved
// questions working.
const BLANK_PATTERN = /\[___(?:(\d+))?\]/

export function numberedBlankMarker(n: number): string {
  return `[___${n}]`
}

export function countBlanks(html: string): number {
  if (!html) return 0
  const re = new RegExp(BLANK_PATTERN.source, 'g')
  return (html.match(re) ?? []).length
}

// Splits fill-blank question content (plain text, or rich-text HTML from
// RichTextEditor) on every blank marker, in document order.
export function splitFillBlankHtml(html: string): string[] {
  return splitHtmlOnPattern(html, BLANK_PATTERN).parts
}

// Just the numbers, in document order — bare (unnumbered) markers are
// numbered by their position among all blanks found. Used to label each
// blank so it's clear which one a "correct answer" card belongs to, even if
// a mid-text blank was deleted and left a gap in the numbering.
export function extractBlankNumbers(html: string): number[] {
  if (!html) return []
  const { captures } = splitHtmlOnPattern(html, BLANK_PATTERN)
  return captures.map((c, i) => c ? parseInt(c, 10) : i + 1)
}

// The next number the "+ insert blank" button should use — one past
// whatever's already the highest in the text, so it never collides even if
// a blank was deleted from the middle (leaving a gap).
export function nextBlankNumber(html: string): number {
  const numbers = extractBlankNumbers(html)
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1
}

// Accepted correct value(s) for a blank — prefers the new `answers` array,
// falling back to the legacy single `answer` string for older saved data.
export function acceptedAnswers(item: Pick<FillBlankItem, 'answer' | 'answers'> | null | undefined): string[] {
  if (!item) return []
  if (item.answers?.length) return item.answers
  return item.answer ? [item.answer] : []
}

// Whether a student's answer matches any of the accepted values for a blank.
// Dropdown answers are always compared exactly (the student picked one of
// the exact option strings); 'fixed' answers respect the blank's
// case-sensitivity setting.
export function isBlankCorrect(studentAnswer: string, accepted: string[], type: FillBlankType, caseSensitive: boolean): boolean {
  const sa = (studentAnswer ?? '').trim()
  if (!sa) return false
  const exact = type === 'dropdown' || caseSensitive
  return accepted.some(ca => {
    const c = (ca ?? '').trim()
    return exact ? sa === c : sa.toLowerCase() === c.toLowerCase()
  })
}
