/**
 * How question difficulty and question types are labelled and coloured.
 *
 * These were previously copied into question-card.tsx, question-picker.tsx and
 * assignment-detail-client.tsx, which had drifted apart — the same difficulty
 * read "ปานกลาง" on one screen and "กลาง" on another. Keeping them here means
 * a label or colour change lands everywhere at once, and it keeps presentation
 * config out of component files that also hold delete/duplicate/export logic.
 */

export interface DifficultyMeta {
  /** Label shown wherever this difficulty appears. */
  label: string
  /** Badge background + text colour. */
  badge: string
  /** Border to pair with `badge` when the badge is outlined. */
  border: string
  /** Solid fill, for progress bars. */
  bar: string
}

export const DIFF_META: Record<string, DifficultyMeta> = {
  easy: {
    label: 'ง่าย',
    badge: 'bg-success/10 text-success',
    border: 'border-success/20',
    bar: 'bg-success',
  },
  medium: {
    label: 'ปานกลาง',
    badge: 'bg-warning/10 text-warning',
    border: 'border-warning/20',
    bar: 'bg-warning',
  },
  hard: {
    label: 'ยาก',
    badge: 'bg-destructive/10 text-destructive',
    border: 'border-destructive/20',
    bar: 'bg-destructive',
  },
  analytical: {
    label: 'วิเคราะห์',
    // The other three ride on semantic tokens and follow the theme on their
    // own; purple has no token, so it needs explicit dark values or the badge
    // stays light-on-light in dark mode.
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-900',
    bar: 'bg-purple-400',
  },
}

/** Full question-type names, for filters and anywhere with room. */
export const TYPE_LABEL: Record<string, string> = {
  mcq: 'ปรนัย',
  written: 'อัตนัย',
  essay: 'บรรยาย',
  true_false: 'ถ/ผ',
  fill_blank: 'เติมคำ',
  matching: 'จับคู่',
  ordering: 'เรียงลำดับ',
  file_upload: 'ไฟล์งาน',
  composite: 'โจทย์ผสม',
}

/** Compact question-type names, for dense question lists. */
export const TYPE_SHORT: Record<string, string> = {
  mcq: 'MCQ',
  written: 'เขียน',
  essay: 'บรรยาย',
  true_false: 'ถ/ผ',
  fill_blank: 'เติมคำ',
  matching: 'จับคู่',
  ordering: 'เรียง',
  file_upload: 'ไฟล์งาน',
  composite: 'ผสม',
}

/**
 * One line of readable text from a question's body, for list rows and cards.
 *
 * `question_text` is rich text — tiptap markup from the editor, or whatever
 * markup an imported bank carried — so printing it raw shows the reader
 * `<pre class="...">` instead of the question.
 */
export function questionExcerpt(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
