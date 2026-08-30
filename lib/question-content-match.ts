/**
 * Spotting questions whose content is the same question twice.
 *
 * A bank grows duplicates by accident: the same export file imported twice,
 * "ทำสำเนาเพื่อแก้ไข" left unedited, the same question typed again months
 * later. Renaming or retagging one of them hides the collision, so the match
 * deliberately ignores everything that is a *label* on the question — title,
 * tags, difficulty, category, visibility, who it is shared with — and compares
 * only **what the student sees and what counts as correct**.
 *
 * The solution and the "แนบรูปวิธีทำ" switch are labels too by this rule: they
 * change how the teacher handles the question, not what is being asked.
 */

/** Columns a fingerprint is built from — the select list for reading them back. */
export const CONTENT_COLUMNS =
  'id, question_text, question_type, image_urls, mcq_options, answer_formula, ' +
  'answer_unit, answer_tolerance, answer_parts, variables, logic_rules, is_random, extra_data'

export interface QuestionContent {
  id: string
  question_text: string | null
  question_type?: string | null
  image_urls?: unknown
  mcq_options?: unknown
  answer_formula?: unknown
  answer_unit?: unknown
  answer_tolerance?: unknown
  answer_parts?: unknown
  variables?: unknown
  logic_rules?: unknown
  is_random?: unknown
  extra_data?: unknown
}

/**
 * Wording only: markup and spacing differ between the editor, an import and a
 * paste of the same text, and none of that changes the question being asked.
 */
export function normalizeQuestionText(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Keys whose string values are addresses, compared byte for byte. */
const URL_KEY = /_urls?$/

/**
 * Canonical form of one content value.
 *
 * Object keys are sorted, because Postgres hands jsonb back in its own order
 * and two equal objects must still stringify the same. `id` is dropped
 * wherever it appears: choices and ordering items carry a `Math.random()` id
 * minted in the browser, so a copy of a question never shares them.
 * Empty string, empty array, empty object and null all collapse to null —
 * the forms disagree about which one means "not set".
 */
function canonical(value: unknown, verbatim = false): unknown {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) {
    const items = value.map(item => canonical(item, verbatim))
    return items.length === 0 ? null : items
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'id')
      .map(([key, item]) => [key, canonical(item, verbatim || URL_KEY.test(key))] as const)
      .filter(([, item]) => item !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return entries.length === 0 ? null : Object.fromEntries(entries)
  }
  if (typeof value === 'string') {
    const text = verbatim ? value.trim() : normalizeQuestionText(value)
    return text === '' ? null : text
  }
  return value
}

/**
 * The content a fingerprint is built from, without the row's identity.
 *
 * Every field is optional so that the server actions can fingerprint the
 * payload they are about to write, which names only the columns that path ever
 * sets — a group's parent row, for one, never carries mcq_options.
 */
export type FingerprintableContent = Omit<Partial<QuestionContent>, 'id'>

/** A stable string standing for one question's content, and nothing else. */
export function questionFingerprint(q: FingerprintableContent): string {
  return JSON.stringify([
    normalizeQuestionText(q.question_text ?? ''),
    q.question_type ?? null,
    canonical(q.image_urls, true),
    canonical(q.mcq_options),
    canonical(q.answer_formula),
    canonical(q.answer_unit),
    q.answer_tolerance ?? null,
    canonical(q.answer_parts),
    canonical(q.variables),
    canonical(q.logic_rules),
    q.is_random ?? false,
    canonical(q.extra_data),
  ])
}
