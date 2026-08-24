/**
 * How the โจทย์ pickers match what a teacher typed.
 *
 * This used to live inline in question-picker.tsx as a single
 * `title.includes(search)` test, which missed in ways that read as "search is
 * broken":
 *   - tags were never searched, so the words a teacher files a question under
 *     found nothing;
 *   - the whole query had to appear as one uninterrupted run of characters, so
 *     "ปริมาณฝน เกณฑ์" matched nothing even though both words are in the
 *     question — and so did any query carrying a stray double space;
 *   - the markup in question_text was searched raw, so a phrase straddling a
 *     tag was invisible while "span" and "class" were hits.
 */
import { questionExcerpt } from '@/lib/question-display'
import { escapeLike } from '@/lib/utils'

export interface SearchableQuestion {
  title: string
  question_text: string
  difficulty: string
  tags?: string[] | null
}

export const QUESTION_SEARCH_GROUPS = ['tag', 'title', 'content'] as const
export type QuestionSearchGroup = (typeof QUESTION_SEARCH_GROUPS)[number]
export type QuestionSearchScope = 'all' | QuestionSearchGroup

export interface QuestionSearchGroupFilters {
  /** The existing broad search rule: every term must match somewhere. */
  broadOrClauses: string[]
  /** Tags reached by at least one term, using the same cap as the broad rule. */
  matchingTags: string[]
  /** One OR clause that asks whether at least one term appears in the title. */
  titleOrClause: string
  /** LIKE patterns used to exclude every possible title match. */
  titlePatterns: string[]
  /** Raw PostgREST array literal for a `not.ov` filter. */
  matchingTagsLiteral: string
}

export type QuestionSearchGroupCounts = Record<QuestionSearchGroup, number>

export type QuestionSearchGroupSlices = Partial<
  Record<QuestionSearchGroup, { from: number; to: number }>
>

/** Case-folded, whitespace-collapsed — the form both sides of a match take. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** The words of a query, in the order typed; empty for a blank query. */
export function searchTerms(search: string): string[] {
  const normalized = normalize(search)
  return normalized ? normalized.split(' ') : []
}

/**
 * Everything about a question a search may match: its title, the readable text
 * of its body (markup stripped — that is what the row shows), and its tags.
 */
function haystack(q: SearchableQuestion): string {
  return normalize([q.title, questionExcerpt(q.question_text), ...(q.tags ?? [])].join(' '))
}

/**
 * True when every word of the query appears somewhere in the question.
 *
 * Words rather than the raw string, so word order and the spacing between them
 * do not matter: a teacher who remembers two words from a question finds it
 * without having to remember how they were joined.
 */
export function matchesSearch(q: SearchableQuestion, search: string): boolean {
  const terms = searchTerms(search)
  if (terms.length === 0) return true
  const text = haystack(q)
  return terms.every(term => text.includes(term))
}

/**
 * Why a broad search result was found, with the priority teachers see in the
 * bank: tag first, then title, then body content. A result belongs to exactly
 * one group even when the same word appears in more than one field.
 *
 * For a multi-word search, all terms still have to match somewhere. Once that
 * is true, any tag hit wins; otherwise any title hit wins; the remainder was
 * found entirely through the readable question body.
 */
export function questionSearchGroup(
  q: SearchableQuestion,
  search: string,
): QuestionSearchGroup | null {
  const terms = searchTerms(search)
  if (terms.length === 0 || !matchesSearch(q, search)) return null

  const tags = (q.tags ?? []).map(normalize)
  if (terms.some(term => tags.some(tag => tag.includes(term)))) return 'tag'

  const title = normalize(q.title)
  if (terms.some(term => title.includes(term))) return 'title'

  return 'content'
}

/** True when the question carries every tag being filtered on. */
export function matchesTags(q: SearchableQuestion, tagFilters: string[]): boolean {
  if (tagFilters.length === 0) return true
  const qTags = (q.tags ?? []).map(t => t.trim().toLowerCase())
  return tagFilters.every(f => qTags.includes(f.trim().toLowerCase()))
}

export interface QuestionFilters {
  search: string
  /** `all`, or one of the difficulty keys. */
  difficulty: string
  /** Whole-tag chips, ANDed on top of the search. The pickers search tags
   *  through `search` instead and pass nothing here. */
  tagFilters?: string[]
}

export function filterQuestions<T extends SearchableQuestion>(
  questions: T[],
  { search, difficulty, tagFilters = [] }: QuestionFilters,
): T[] {
  return questions.filter(q =>
    (difficulty === 'all' || q.difficulty === difficulty) &&
    matchesSearch(q, search) &&
    matchesTags(q, tagFilters)
  )
}

/**
 * The tags in `tagUniverse` that a typed word points at.
 *
 * Substring, not equality: someone typing "พลัง" means to reach the questions
 * tagged "พลังงาน" as much as the ones with the word in their title.
 */
export function tagsMatchingTerm(tagUniverse: string[], term: string): string[] {
  const t = term.trim().toLowerCase()
  if (!t) return []
  return tagUniverse.filter(tag => tag.toLowerCase().includes(t))
}

/** PostgREST needs a value with commas, dots or braces in it quoted. */
function quoteForPostgrest(value: string): string {
  return `"${value.replace(/[\\"]/g, m => `\\${m}`)}"`
}

function tagsReachedByTerms(tagUniverse: string[], terms: string[]): string[] {
  const unique = new Set<string>()
  for (const term of terms) {
    for (const tag of tagsMatchingTerm(tagUniverse, term).slice(0, 100)) unique.add(tag)
  }
  return [...unique]
}

/**
 * Database filter pieces for the three exclusive result groups.
 *
 * The page first applies `broadOrClauses`, then:
 * - tag: overlaps `matchingTags`;
 * - title: does not overlap those tags, and matches `titleOrClause`;
 * - content: does not overlap those tags, and excludes every `titlePatterns`
 *   entry.
 *
 * This mirrors `questionSearchGroup` without asking the browser to download a
 * large bank merely to classify it.
 */
export function questionSearchGroupFilters(
  search: string,
  tagUniverse: string[] = [],
): QuestionSearchGroupFilters {
  const terms = searchTerms(search)
  const titlePatterns = terms.map(term => `%${escapeLike(term)}%`)
  const matchingTags = tagsReachedByTerms(tagUniverse, terms)

  return {
    broadOrClauses: questionSearchOrClauses(search, tagUniverse),
    matchingTags,
    titleOrClause: titlePatterns
      .map(pattern => `title.ilike.${quoteForPostgrest(pattern)}`)
      .join(','),
    titlePatterns,
    matchingTagsLiteral: `{${matchingTags.map(quoteForPostgrest).join(',')}}`,
  }
}

/**
 * Slice one ordinary page across the ordered groups. The returned offsets are
 * relative to each group, so a page can end with title results and continue
 * with content results without duplicates or oversized payloads.
 */
export function questionSearchGroupSlices(
  counts: QuestionSearchGroupCounts,
  scope: QuestionSearchScope,
  page: number,
  perPage: number,
): QuestionSearchGroupSlices {
  if (perPage <= 0) return {}

  const visibleGroups = scope === 'all' ? QUESTION_SEARCH_GROUPS : [scope]
  const pageStart = Math.max(0, page - 1) * perPage
  const pageEnd = pageStart + perPage
  let groupStart = 0
  const slices: QuestionSearchGroupSlices = {}

  for (const group of visibleGroups) {
    const groupEnd = groupStart + counts[group]
    const intersectionStart = Math.max(pageStart, groupStart)
    const intersectionEnd = Math.min(pageEnd, groupEnd)
    if (intersectionStart < intersectionEnd) {
      slices[group] = {
        from: intersectionStart - groupStart,
        to: intersectionEnd - groupStart - 1,
      }
    }
    groupStart = groupEnd
  }

  return slices
}

/**
 * The same rule as `matchesSearch`, expressed for a database query: one
 * `or(...)` clause per word typed, to be ANDed together by chaining `.or()`.
 *
 * The คลังโจทย์ pages search server-side (the bank is too big to ship whole)
 * while the pickers search in the browser, so the rule lives here once instead
 * of drifting apart — which is exactly what had happened: the bank searched
 * title and body, the picker only the title, and neither searched tags.
 *
 * A tag can only be matched by an exact array element (`ov`), so the words are
 * resolved against the tags that actually exist first — that is what
 * `tagUniverse` is for. Without it, tags simply do not take part.
 */
export function questionSearchOrClauses(search: string, tagUniverse: string[] = []): string[] {
  return searchTerms(search).map(term => {
    const like = `%${escapeLike(term)}%`
    const parts = [`title.ilike.${quoteForPostgrest(like)}`, `question_text.ilike.${quoteForPostgrest(like)}`]
    // Capped: a one-letter word can point at hundreds of tags, and every one
    // of them rides in the query string.
    const tags = tagsMatchingTerm(tagUniverse, term).slice(0, 100)
    if (tags.length > 0) parts.push(`tags.ov.{${tags.map(quoteForPostgrest).join(',')}}`)
    return parts.join(',')
  })
}
