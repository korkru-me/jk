/**
 * เติมคำในรูป (`image_label`) — one diagram, and answer boxes that point at
 * places on it.
 *
 * The worksheet this comes from gives a student a drawing of the respiratory
 * tract, seven boxes with leader lines running to seven organs, and a bank of
 * nine words underneath — two more words than there are boxes, because the
 * extras are the question. What no existing type could express is the one
 * thing the worksheet is built on: *this box points at this place on the
 * picture*. `fill_blank` places its blanks with a `[___1]` marker inside the
 * text, `matching` keeps two columns in `mcq_options`, `composite` stacks its
 * parts vertically. None of them has anywhere to put a coordinate.
 *
 * Everything downstream — the frozen `IMGL:` answer key, the structural point
 * value, the ข้อย่อย badge in the คลัง — is derived here rather than read out of
 * `extra_data` at each call site, because those three numbers have to agree.
 * They disagreed once before for composite เติมคำ: `naturalMaxScore` counted a
 * sub-question the renderer gave no input for, and the student lost a point for
 * a blank the teacher never handed them. The counting rule below is written so
 * that a point is worth a mark **only if** it is a point that can be answered
 * and graded.
 */

import { isBlankCorrect } from './fill-blank'
import type { ImageLabelAnswerMode, ImageLabelConfig, ImageLabelMarker } from './types'

/**
 * Tells a stored image-label key apart from every other type's, the same way
 * `TF:`, `FILL:`, `ORDER:`, `MATCH:`, `COMP:`, `MCQ:` and `CLS:` do.
 */
export const IMAGE_LABEL_PREFIX = 'IMGL:'

/**
 * One point, as the answer key freezes it.
 *
 * Unlike the `FILL:` branch — which reads `case_sensitive` and its divisor back
 * out of the live `extra_data` every time it grades — everything grading needs
 * is in here. A teacher who edits the question after students have answered
 * would otherwise change, retroactively, the rule their answers were judged by.
 * This follows `COMP:`, which freezes `{ type, correct, blankType,
 * caseSensitive, score }` per part for the same reason.
 */
export interface ImageLabelKeyedMarker {
  /**
   * Accepted correct value(s). **Empty means the teacher left this point
   * unkeyed** — it still renders and the student can still answer it, it is
   * simply not graded and not worth a mark. The same signal an empty array
   * carries in a `FILL:` key.
   */
  answers: string[]
  /**
   * Compare the student's text exactly rather than case-folded. Derived once,
   * at freeze time, from the question's mode and the point's `case_sensitive`:
   * a picked option or a dragged chip is always compared exactly, because the
   * student did not type it.
   */
  exact: boolean
}

function asConfig(extraData: unknown): ImageLabelConfig | null {
  const config = extraData as ImageLabelConfig | null | undefined
  if (!config || !Array.isArray(config.markers)) return null
  return config
}

/**
 * Anything unrecognised reads as 'typed', the mode that filters nothing out.
 *
 * Exported because the exam sanitiser has to reach the same verdict: it decides
 * what a point offers the student, while this file decides what the point is
 * keyed to. A question the two disagree about is one where the student is given
 * a list the grader is not marking against.
 */
export function normalizeImageLabelMode(value: unknown): ImageLabelAnswerMode {
  return value === 'dropdown' || value === 'drag' ? value : 'typed'
}

function readMode(config: ImageLabelConfig): ImageLabelAnswerMode {
  return normalizeImageLabelMode(config.answer_mode)
}

const cleanList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [])
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)

/**
 * The choices this point actually offers, for the modes that offer any.
 *
 * A `dropdown` point may carry its own `options`; without them it offers the
 * question's `bank`. An empty `options` array counts as not having any rather
 * than as offering nothing — a point whose list a teacher emptied should fall
 * back to the bank, not quietly stop being worth a mark.
 */
function choicesFor(mode: ImageLabelAnswerMode, marker: ImageLabelMarker, bank: string[]): string[] | null {
  if (mode === 'typed') return null
  if (mode === 'drag') return bank
  const own = cleanList(marker.options)
  return own.length > 0 ? own : bank
}

/**
 * The teacher's key, one entry per marker in the markers' own order.
 *
 * Positional, and it must stay one entry per marker even for the points that
 * carry no key: the student's browser sends one answer per marker in the same
 * order, and dropping the unkeyed ones here would slide every later answer one
 * place to the left.
 *
 * A point ends up unkeyed — `answers: []` — in three ways, all treated the
 * same because all three mean the same thing, that nobody could answer it
 * correctly:
 *
 * 1. The teacher never typed an answer for it.
 * 2. Its mode offers a list of choices and none of them is an accepted answer.
 *    This is what a file import leaves behind, or a teacher who edits the word
 *    bank afterwards and takes out a word that some point was keyed to.
 * 3. Its answers are blank or whitespace, which no student answer can match
 *    (`isBlankCorrect` rejects an empty answer outright).
 *
 * Where a point's answers are *partly* reachable, the unreachable ones are
 * dropped and the point stays keyed on the rest — the same spirit as
 * `classifyCorrectGrid` treating a key that points past the option list as no
 * key at all, applied one accepted value at a time.
 */
export function imageLabelKey(extraData: unknown): ImageLabelKeyedMarker[] {
  const config = asConfig(extraData)
  if (!config) return []

  const mode = readMode(config)
  const bank = cleanList(config.bank)

  return config.markers.map(marker => {
    const accepted = cleanList(marker?.answers)
    const choices = choicesFor(mode, marker ?? ({} as ImageLabelMarker), bank)
    const reachable = choices === null ? accepted : accepted.filter(answer => choices.includes(answer))
    return {
      answers: [...new Set(reachable)],
      // A picked option or a dragged chip is the teacher's own string handed
      // back verbatim, so case-folding it would only ever let a *different*
      // option through. Typed answers respect what the teacher asked for.
      exact: mode !== 'typed' || marker?.case_sensitive === true,
    }
  })
}

/**
 * How many points actually carry a key — the question's structural point value
 * (1 คะแนนต่อจุด) and its ข้อย่อย count, which are required to be the same
 * number. Mirrored in SQL by `education_research_question_max_score`; change
 * the two together.
 */
export function imageLabelMarkerCount(extraData: unknown): number {
  return imageLabelKey(extraData).filter(marker => marker.answers.length > 0).length
}

/** The frozen answer key for one image-label question, prefix included. */
export function imageLabelCorrectAnswer(extraData: unknown): string {
  return IMAGE_LABEL_PREFIX + JSON.stringify(imageLabelKey(extraData))
}

/**
 * A stored key string back into entries, for the grading side.
 *
 * Anything unreadable — truncated JSON, an object where the array belongs, a
 * number where the accepted answers belong — degrades to an unkeyed point
 * rather than throwing, so one malformed row cannot take down a whole
 * submission's grading pass.
 */
export function parseImageLabelKey(raw: string): ImageLabelKeyedMarker[] {
  let parsed: unknown
  try { parsed = JSON.parse(raw || '[]') } catch { return [] }
  if (!Array.isArray(parsed)) return []
  return parsed.map(entry => {
    const marker = entry as Partial<ImageLabelKeyedMarker> | null
    return {
      answers: cleanList(marker?.answers),
      exact: marker?.exact === true,
    }
  })
}

/**
 * What the student's browser sent: one string per marker, in marker order, with
 * an empty string where they left a box alone. Degrades the same way the key
 * does, for the same reason.
 */
export function parseImageLabelAnswer(raw: string): string[] {
  let parsed: unknown
  try { parsed = JSON.parse(raw || '[]') } catch { return [] }
  if (!Array.isArray(parsed)) return []
  return parsed.map(entry => (typeof entry === 'string' ? entry : ''))
}

/**
 * Whether one answer earns its point.
 *
 * Deliberately routed through `isBlankCorrect` rather than restated: the rule
 * for "did this text match one of the accepted values" — trim both sides, an
 * empty answer never matches, fold case unless told otherwise — belongs in one
 * place, and เติมคำ owns it. What is frozen here is the *policy* (`exact`),
 * not the mechanics.
 */
export function isImageLabelMarkerCorrect(studentAnswer: string, marker: ImageLabelKeyedMarker): boolean {
  if (marker.answers.length === 0) return false
  return isBlankCorrect(studentAnswer ?? '', marker.answers, 'fixed', marker.exact)
}
