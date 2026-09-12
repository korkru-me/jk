/**
 * ตารางจำแนก (`classify`) — a grid the student fills in by choosing one option
 * per cell.
 *
 * Rows are the things being judged (a picture of เนื้อหมู, ยางรัดของ, เชือกป่าน),
 * columns are the ways of judging them (จำแนกตามแหล่งกำเนิด, จำแนกตามชนิดของ
 * มอนอเมอร์), and each cell is one choice among that **column's** options. The
 * options belonging to the column rather than to the cell is the whole reason
 * this is not a `composite` of many ปรนัย parts: a teacher types
 * "พอลิเมอร์ธรรมชาติ / พอลิเมอร์สังเคราะห์" once and every row reuses it.
 *
 * Everything downstream — the frozen `CLS:` answer key, the structural point
 * value, the ข้อย่อย badge in the คลัง — is derived here rather than read out of
 * `extra_data` at each call site, because those three numbers must agree. They
 * disagreed once before for composite เติมคำ: `naturalMaxScore` counted a
 * sub-question the renderer gave no input for, and the student lost a point for
 * a blank the teacher never handed them. The counting rule below is written so
 * that a cell is worth a point **only if** it is a cell that can be answered
 * and graded.
 */

import type { ClassifyConfig } from './types'

/**
 * Tells a stored classify key apart from every other type's, the same way
 * `TF:`, `FILL:`, `ORDER:`, `MATCH:`, `COMP:` and `MCQ:` do.
 */
export const CLASSIFY_PREFIX = 'CLS:'

/** No option chosen: a cell the teacher never keyed, or the student left blank. */
export const CLASSIFY_UNSET = -1

function asConfig(extraData: unknown): ClassifyConfig | null {
  const config = extraData as ClassifyConfig | null | undefined
  if (!config || !Array.isArray(config.columns) || !Array.isArray(config.rows)) return null
  return config
}

/**
 * The teacher's key as a row-major grid of option positions —
 * `grid[rowIndex][columnIndex]`, one entry per cell of `rows × columns`.
 *
 * A cell is `CLASSIFY_UNSET` when the teacher left it blank **or** when it
 * points at an option that column no longer has, which is what a file import or
 * a later edit that shortened the option list leaves behind. Both are treated
 * the same on purpose: an unanswerable cell must not be gradable, and
 * `classifyCellCount` reads this same grid, so it cannot be worth a point
 * either.
 *
 * Positions rather than the option's words, for the reason a standalone ปรนัย
 * stores `MCQ:<position>`: two options can carry the same text, and comparing
 * text then credits the wrong one.
 */
export function classifyCorrectGrid(extraData: unknown): number[][] {
  const config = asConfig(extraData)
  if (!config) return []
  return config.rows.map(row => config.columns.map(column => {
    const picked = row?.answers?.[column.id]
    if (typeof picked !== 'number' || !Number.isInteger(picked)) return CLASSIFY_UNSET
    return picked >= 0 && picked < (column.options?.length ?? 0) ? picked : CLASSIFY_UNSET
  }))
}

/**
 * How many cells actually carry a key — the question's structural point value
 * (1 คะแนนต่อช่อง) and its ข้อย่อย count, which are required to be the same
 * number. Mirrored in SQL by `education_research_question_max_score`; change
 * the two together.
 */
export function classifyCellCount(extraData: unknown): number {
  let count = 0
  for (const row of classifyCorrectGrid(extraData)) {
    for (const cell of row) if (cell !== CLASSIFY_UNSET) count++
  }
  return count
}

/**
 * A stored grid string back into a grid. Used for both sides of grading: the
 * frozen key after its `CLS:` prefix, and whatever the student's browser sent.
 * Anything unreadable — truncated JSON, an object where an array belongs, a
 * string where a position belongs — degrades to `CLASSIFY_UNSET` rather than
 * throwing, so one malformed answer cannot take down a whole submission's
 * grading pass.
 */
export function parseClassifyGrid(raw: string): number[][] {
  let parsed: unknown
  try { parsed = JSON.parse(raw || '[]') } catch { return [] }
  if (!Array.isArray(parsed)) return []
  return parsed.map(row => (Array.isArray(row)
    ? row.map(cell => (typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 ? cell : CLASSIFY_UNSET))
    : []))
}

/** The frozen answer key for one classify question, prefix included. */
export function classifyCorrectAnswer(extraData: unknown): string {
  return CLASSIFY_PREFIX + JSON.stringify(classifyCorrectGrid(extraData))
}
