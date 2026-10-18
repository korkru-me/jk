export const MAX_GRADING_KEYWORDS = 10
export const MAX_GRADING_KEYWORD_LENGTH = 100

export interface GradingKeywordSegment {
  text: string
  highlighted: boolean
}

function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Display preferences only: keep the teacher's spelling and never parse HTML. */
export function normalizeGradingKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const keywords: string[] = []
  const seen: RegExp[] = []
  for (const value of input) {
    if (typeof value !== 'string') continue
    const keyword = value.trim()
    if (!keyword || keyword.length > MAX_GRADING_KEYWORD_LENGTH || seen.some(pattern => pattern.test(keyword))) continue
    keywords.push(keyword)
    // Use the same Unicode case comparison as the matcher, including ſ/S and
    // K/K, without expanding or rewriting the displayed keyword.
    seen.push(new RegExp(`^(?:${escapePattern(keyword)})$`, 'iu'))
    if (keywords.length === MAX_GRADING_KEYWORDS) break
  }
  return keywords
}

/** Return original text slices; rendering them as React text/mark nodes is safe
 * even when an answer or keyword looks like HTML or a regular expression. */
export function splitGradingKeywordMatches(text: string, keywords: readonly string[]): GradingKeywordSegment[] {
  if (!text) return []
  const terms = normalizeGradingKeywords(keywords).sort((left, right) => right.length - left.length)
  const ranges: { start: number; end: number }[] = []
  for (const keyword of terms) {
    const pattern = new RegExp(escapePattern(keyword), 'giu')
    let previous: (typeof ranges)[number] | undefined
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const end = match.index + match[0].length
      // Compact a term's overlapping run while scanning, rather than keeping
      // one range per character in a long repeated answer.
      if (previous && match.index <= previous.end) previous.end = Math.max(previous.end, end)
      else { previous = { start: match.index, end }; ranges.push(previous) }
      // Advance from the match start, not its end, to include overlapping
      // occurrences such as both "ana" matches in "banana". Keep astral
      // characters intact when advancing the UTF-16 index.
      pattern.lastIndex = match.index + (text.codePointAt(match.index)! > 0xffff ? 2 : 1)
    }
  }
  if (!ranges.length) return [{ text, highlighted: false }]

  ranges.sort((left, right) => left.start - right.start || right.end - left.end)
  const merged: typeof ranges = []
  for (const range of ranges) {
    const previous = merged[merged.length - 1]
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
    else merged.push({ ...range })
  }

  const segments: GradingKeywordSegment[] = []
  let cursor = 0
  for (const range of merged) {
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start), highlighted: false })
    segments.push({ text: text.slice(range.start, range.end), highlighted: true })
    cursor = range.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlighted: false })
  return segments
}
