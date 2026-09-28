import { hasSolutionText } from '@/lib/question-solution'

/**
 * The เฉลยวิธีทำ of one attempt, ข้อ by ข้อ, the way a student pages through
 * it from their summary page once the งาน lets them (lib/solution-release.ts).
 *
 * Built from the attempt's own `submission_answers`, not the งาน's question
 * list: a งาน that draws a few ข้อ per student opens only the ones this student
 * was actually given, never the whole คลัง behind them. Numbered in the same
 * order the summary page lists them, so "ข้อ 5" means the same ข้อ in both.
 *
 * Each ข้อ shows its own row's เฉลย only. A โจทย์หลายขั้นตอน is not expanded
 * into its steps here, because its steps can be assigned as ข้อ of their own —
 * expanding would show the same เฉลย twice.
 */

export interface AttemptSolutionQuestion {
  title: string | null
  question_text: string | null
  image_urls: string[] | null
  solution_text: string | null
  solution_image_urls: string[] | null
}

/** A `submission_answers` row with the parts of its โจทย์ this view reads. */
export interface AttemptSolutionRow {
  id: string
  order_index: number | null
  random_values: Record<string, number> | null
  /** A to-one embed, which PostgREST may still hand back as a list. */
  questions: AttemptSolutionQuestion | AttemptSolutionQuestion[] | null
}

export interface AttemptSolutionItem {
  /** The `submission_answers` row — what a ข้อ on the summary page is keyed by. */
  answerId: string
  /** 1-based, in the summary page's order. */
  number: number
  title: string | null
  /** The โจทย์ with this attempt's own numbers written in. Null when the
   *  โจทย์ has since been deleted from the คลัง. */
  questionText: string | null
  imageUrls: string[]
  /** The typed เฉลย, with the same numbers; null when nothing was typed. */
  solutionText: string | null
  /** Pictures, board pictures and PDFs, as `SolutionFiles` reads them. */
  solutionFiles: string[]
}

/**
 * Writes this attempt's numbers into `{name}` placeholders — the same thing
 * the results page does to the โจทย์ and โหมดสอน does to the เฉลย, so a เฉลย
 * written against the variables reads with the numbers the student was given.
 * Placeholders with no value are left as they are.
 */
export function fillRandomValues(text: string, values: Record<string, number> | null | undefined): string {
  if (!values) return text
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder
  ))
}

export function attemptItemHasSolution(item: AttemptSolutionItem): boolean {
  return item.solutionText !== null || item.solutionFiles.length > 0
}

export function buildAttemptSolutionItems(rows: readonly AttemptSolutionRow[]): AttemptSolutionItem[] {
  return [...rows]
    .sort((a, b) => (a.order_index ?? Number.MAX_SAFE_INTEGER) - (b.order_index ?? Number.MAX_SAFE_INTEGER))
    .map((row, index) => {
      const question = Array.isArray(row.questions) ? row.questions[0] ?? null : row.questions
      const values = row.random_values ?? {}
      return {
        answerId: row.id,
        number: index + 1,
        title: question?.title?.trim() || null,
        questionText: question ? fillRandomValues(question.question_text ?? '', values) : null,
        imageUrls: question?.image_urls ?? [],
        solutionText: question && hasSolutionText(question.solution_text)
          ? fillRandomValues(question.solution_text as string, values)
          : null,
        solutionFiles: question?.solution_image_urls ?? [],
      }
    })
}
