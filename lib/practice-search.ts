import { searchTerms } from '@/lib/question-search'

export const PRACTICE_PAGE_SIZE = 24
export const PRACTICE_MAX_TAGS = 20

export interface PracticeSearchState {
  q: string
  tags: string[]
  page: number
  ignoredTagCount: number
}

type SearchParamValue = string | string[] | undefined

const MAX_QUERY_LENGTH = 160
const MAX_TAG_LENGTH = 80
const MAX_PAGE = 100_000
// Keep the full query comfortably below common 8 KiB request-line limits.
// Question links carry these params directly instead of nesting an encoded
// return URL, so this is also the upper bound for the longest practice route.
const MAX_ENCODED_QUERY_LENGTH = 4_096

function first(value: SearchParamValue): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function repeated(value: SearchParamValue): string[] {
  if (Array.isArray(value)) return value
  return value === undefined ? [] : [value]
}

function normalizeText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function normalizedUniquePracticeTags(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const tags: string[] = []

  for (const value of values) {
    const tag = normalizeText(value, MAX_TAG_LENGTH)
    const key = tag.toLocaleLowerCase('th-TH')
    if (!tag || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }

  return tags
}

export function normalizePracticeTags(values: readonly string[]): string[] {
  return normalizedUniquePracticeTags(values).slice(0, PRACTICE_MAX_TAGS)
}

function queryParams(q: string, tags: readonly string[], page: number): URLSearchParams {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  for (const tag of tags) params.append('tag', tag)
  if (page > 1) params.set('page', String(page))
  return params
}

function tagsWithinUrlBudget(q: string, tags: readonly string[], page: number): string[] {
  const accepted: string[] = []
  for (const tag of tags) {
    const candidate = [...accepted, tag]
    if (queryParams(q, candidate, page).toString().length > MAX_ENCODED_QUERY_LENGTH) break
    accepted.push(tag)
  }
  return accepted
}

export function parsePracticeSearchParams(
  params: Record<string, SearchParamValue>,
): PracticeSearchState {
  const rawPage = Number.parseInt(first(params.page), 10)
  const page = Number.isSafeInteger(rawPage) && rawPage > 0
    ? Math.min(rawPage, MAX_PAGE)
    : 1
  const q = normalizeText(first(params.q), MAX_QUERY_LENGTH)
  const normalizedTags = normalizedUniquePracticeTags(repeated(params.tag))
  const tags = tagsWithinUrlBudget(
    q,
    normalizedTags.slice(0, PRACTICE_MAX_TAGS),
    page,
  )
  return Object.freeze({
    q,
    tags: Object.freeze(tags) as string[],
    page,
    ignoredTagCount: normalizedTags.length - tags.length,
  })
}

export function practiceSearchTerms(query: string): string[] {
  return searchTerms(normalizeText(query, MAX_QUERY_LENGTH)).slice(0, 12)
}

export function buildPracticeSearchHref(
  libraryId: string,
  state: PracticeSearchState,
  patch: Partial<PracticeSearchState> = {},
): string {
  const next: PracticeSearchState = {
    q: normalizeText(patch.q ?? state.q, MAX_QUERY_LENGTH),
    tags: normalizePracticeTags(patch.tags ?? state.tags),
    page: Math.min(Math.max(1, patch.page ?? state.page), MAX_PAGE),
    ignoredTagCount: 0,
  }
  const boundedTags = tagsWithinUrlBudget(next.q, next.tags, next.page)
  const params = queryParams(next.q, boundedTags, next.page)
  const query = params.toString()
  return `/practice/${encodeURIComponent(libraryId)}/library${query ? `?${query}` : ''}`
}

export function buildPracticeQuestionHref(
  libraryId: string,
  questionId: string,
  state: PracticeSearchState,
): string {
  const libraryHref = buildPracticeSearchHref(libraryId, state)
  const queryIndex = libraryHref.indexOf('?')
  const query = queryIndex >= 0 ? libraryHref.slice(queryIndex) : ''
  return `/practice/${encodeURIComponent(libraryId)}/questions/${encodeURIComponent(questionId)}${query}`
}

export function practiceTotalPages(total: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / PRACTICE_PAGE_SIZE))
}
