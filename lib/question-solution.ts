import { questionExcerpt } from '@/lib/question-display'

/**
 * A โจทย์'s เฉลย read on its own, the way the คลังโจทย์'s ดูเฉลย button shows
 * it: the typed text and the files — pictures, board pictures and PDFs, which
 * all share `solution_image_urls` (see lib/solution-attachments.ts).
 *
 * This is the เฉลย a teacher attaches under "เฉลยวิธีทำ", not the answer key.
 * Every graded type carries an answer key; a โจทย์ without an attached เฉลย is
 * not a โจทย์ without an answer.
 */

/** The two columns a เฉลย is kept in, as any read of a question row has them. */
export interface SolutionColumns {
  solution_text: string | null
  solution_image_urls: string[] | null
}

/**
 * Typed เฉลย that holds anything: words, or only a picture placed in the text.
 *
 * The editor stores an empty box as '', but a box typed into and cleared again
 * can still come back as empty paragraphs — `<p></p><p></p>` — which is text
 * to the database and nothing to a reader.
 */
export function hasSolutionText(text: string | null | undefined): boolean {
  if (!text) return false
  return questionExcerpt(text).length > 0 || /<img\b/i.test(text)
}

/** Whether a row carries a เฉลย of its own, in either column. */
export function hasSolution(row: SolutionColumns): boolean {
  return hasSolutionText(row.solution_text) || (row.solution_image_urls ?? []).length > 0
}

/** One block of the dialog: a โจทย์'s own เฉลย, or one ข้อย่อย's. */
export interface QuestionSolutionPart {
  /** The row it was read from — a key, nothing more. */
  id: string
  /** "ข้อย่อยที่ 2" for a step of a โจทย์หลายขั้นตอน; null for the โจทย์'s own. */
  label: string | null
  /** The step's wording on one line, so its เฉลย can be told apart. */
  excerpt: string | null
  /** Null when nothing was typed — including a box left as empty paragraphs. */
  text: string | null
  files: string[]
}

export interface QuestionSolution {
  title: string
  parts: QuestionSolutionPart[]
}

/** A step of a โจทย์หลายขั้นตอน, as the solution read fetches it. */
export type SolutionStepRow = SolutionColumns & {
  id: string
  order_in_group: number | null
  question_text: string | null
}

function toPart(
  row: SolutionColumns & { id: string },
  label: string | null,
  excerpt: string | null,
): QuestionSolutionPart {
  return {
    id: row.id,
    label,
    excerpt,
    text: hasSolutionText(row.solution_text) ? row.solution_text : null,
    files: row.solution_image_urls ?? [],
  }
}

/**
 * What the dialog shows for one card.
 *
 * A single โจทย์ is its own row. A โจทย์หลายขั้นตอน keeps its เฉลย on the
 * steps — the row the คลัง lists holds only the shared context — so every step
 * is listed in order, including the ones without a เฉลย: which ข้อย่อย still
 * lack one is part of what the teacher opened this to see. The listed row's own
 * columns still show when something is in them, since nothing stops an older
 * row from carrying a เฉลย there.
 */
export function buildQuestionSolution(
  row: SolutionColumns & { id: string; title: string },
  steps: readonly SolutionStepRow[],
): QuestionSolution {
  const parts: QuestionSolutionPart[] = []
  if (steps.length === 0 || hasSolution(row)) parts.push(toPart(row, null, null))

  const ordered = [...steps].sort((a, b) => (a.order_in_group ?? 0) - (b.order_in_group ?? 0))
  ordered.forEach((step, index) => {
    parts.push(toPart(step, `ข้อย่อยที่ ${index + 1}`, questionExcerpt(step.question_text) || null))
  })

  return { title: row.title, parts }
}
