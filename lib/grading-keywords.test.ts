import { describe, expect, it } from 'vitest'
import { MAX_GRADING_KEYWORDS, MAX_GRADING_KEYWORD_LENGTH, normalizeGradingKeywords, splitGradingKeywordMatches } from './grading-keywords'

describe('grading keyword preferences', () => {
  it.each([undefined, null, 'แรง', 10, { keywords: ['แรง'] }].map(value => ({ value })))('ignores non-array input $value', ({ value }) => {
    expect(normalizeGradingKeywords(value)).toEqual([])
  })

  it('keeps trimmed display spelling, filters invalid entries and deduplicates case-insensitively', () => {
    expect(normalizeGradingKeywords([' แรง ', '', '  ', null, 5, {}, 'แรง', ' FORCE ', 'force', 'Force', 'การเคลื่อนที่']))
      .toEqual(['แรง', 'FORCE', 'การเคลื่อนที่'])
  })

  it('uses the same Unicode case equivalence as literal matching without rewriting display text', () => {
    expect(normalizeGradingKeywords(['S', 'ſ', 'K', 'k', 'ß', 'SS'])).toEqual(['S', 'K', 'ß', 'SS'])
  })

  it('retains only the first ten valid distinct keywords', () => {
    const words = Array.from({ length: 15 }, (_, index) => `คำ${index}`)
    expect(MAX_GRADING_KEYWORDS).toBe(10)
    expect(normalizeGradingKeywords(['', 5, 'x'.repeat(101), words[0], ...words]))
      .toEqual(words.slice(0, 10))
  })

  it('applies the 100 UTF-16 character limit after trimming without truncating words', () => {
    expect(MAX_GRADING_KEYWORD_LENGTH).toBe(100)
    const text = 'ก'.repeat(100), emoji = '😀'.repeat(50)
    expect(normalizeGradingKeywords([` ${text} `, 'ก'.repeat(101), emoji, '😀'.repeat(51)]))
      .toEqual([text, emoji])
  })

  it('does not rewrite Unicode normalization or mutate a supplied preference array', () => {
    const original = Object.freeze([' e\u0301 ', 'É', 'é'])
    expect(normalizeGradingKeywords(original)).toEqual(['e\u0301', 'É'])
    expect(original).toEqual([' e\u0301 ', 'É', 'é'])
  })
})

describe('literal grading keyword matches', () => {
  it('highlights repeated Thai substrings without requiring word boundaries and preserves newlines', () => {
    const text = 'แรงทำให้เคลื่อนที่\nแรงลัพธ์ทำให้เคลื่อนที่'
    expect(splitGradingKeywordMatches(text, ['แรง', 'เคลื่อนที่'])).toEqual([
      { text: 'แรง', highlighted: true }, { text: 'ทำให้', highlighted: false },
      { text: 'เคลื่อนที่', highlighted: true }, { text: '\n', highlighted: false },
      { text: 'แรง', highlighted: true }, { text: 'ลัพธ์ทำให้', highlighted: false },
      { text: 'เคลื่อนที่', highlighted: true },
    ])
  })

  it('matches case-insensitively while keeping the original case', () => {
    expect(splitGradingKeywordMatches('Force FORCE force', ['FoRcE'])).toEqual([
      { text: 'Force', highlighted: true }, { text: ' ', highlighted: false },
      { text: 'FORCE', highlighted: true }, { text: ' ', highlighted: false },
      { text: 'force', highlighted: true },
    ])
  })

  it('treats regex metacharacters as literal text rather than executable patterns', () => {
    const text = 'a+b [x] aab .+ (test)? \\ ^$'
    const segments = splitGradingKeywordMatches(text, ['a+b', '[x]', '.+', '(test)?', '\\', '^$'])
    expect(segments.filter(segment => segment.highlighted).map(segment => segment.text))
      .toEqual(['a+b', '[x]', '.+', '(test)?', '\\', '^$'])
    expect(segments.map(segment => segment.text).join('')).toBe(text)
    expect(segments.some(segment => !segment.highlighted && segment.text.includes('aab'))).toBe(true)
  })

  it('returns HTML-looking answers and keywords as unchanged text slices', () => {
    const html = '<img src=x onerror=alert(1)>'
    const text = `คำตอบ ${html} & แรง`
    const segments = splitGradingKeywordMatches(text, [html, '&'])
    expect(segments).toEqual([
      { text: 'คำตอบ ', highlighted: false }, { text: html, highlighted: true },
      { text: ' ', highlighted: false }, { text: '&', highlighted: true },
      { text: ' แรง', highlighted: false },
    ])
    expect(segments.map(segment => segment.text).join('')).toBe(text)
  })

  it('merges overlapping occurrences of the same keyword', () => {
    expect(splitGradingKeywordMatches('banana', ['ana'])).toEqual([
      { text: 'b', highlighted: false }, { text: 'anana', highlighted: true },
    ])
  })

  it('merges overlapping different keywords and prefers the longest range at the same start', () => {
    expect(splitGradingKeywordMatches('abcd!', ['abc', 'bcd', 'ab'])).toEqual([
      { text: 'abcd', highlighted: true }, { text: '!', highlighted: false },
    ])
    expect(splitGradingKeywordMatches('แรงลัพธ์', ['แรง', 'แรงลัพธ์']))
      .toEqual([{ text: 'แรงลัพธ์', highlighted: true }])
  })

  it('combines touching ranges into one highlight without adding or removing characters', () => {
    expect(splitGradingKeywordMatches('แรงมาก', ['แรง', 'มาก']))
      .toEqual([{ text: 'แรงมาก', highlighted: true }])
  })

  it('keeps astral emoji intact both beside matches and as repeated matching terms', () => {
    expect(splitGradingKeywordMatches('🙂แรง🚀แรง🙂', ['แรง', '🚀'])).toEqual([
      { text: '🙂', highlighted: false }, { text: 'แรง🚀แรง', highlighted: true },
      { text: '🙂', highlighted: false },
    ])
    expect(splitGradingKeywordMatches('A😀B😀C', ['😀'])).toEqual([
      { text: 'A', highlighted: false }, { text: '😀', highlighted: true },
      { text: 'B', highlighted: false }, { text: '😀', highlighted: true },
      { text: 'C', highlighted: false },
    ])
  })

  it('does not use expanded lowercase string indices to slice the original answer', () => {
    expect(splitGradingKeywordMatches('İA 😀KS', ['a', 'k', 's'])).toEqual([
      { text: 'İ', highlighted: false }, { text: 'A', highlighted: true },
      { text: ' 😀', highlighted: false }, { text: 'KS', highlighted: true },
    ])
  })

  it('preserves composed/decomposed Unicode exactly instead of normalizing the answer', () => {
    const text = 'e\u0301 é'
    const segments = splitGradingKeywordMatches(text, ['é'])
    expect(segments).toEqual([{ text: 'e\u0301 ', highlighted: false }, { text: 'é', highlighted: true }])
    expect(segments.map(segment => segment.text).join('')).toBe(text)
  })

  it('returns one unchanged plain segment for no terms, invalid terms or no matches', () => {
    const text = '  คำตอบ <b>เดิม</b>\n'
    for (const keywords of [[], ['', '  ', 'x'.repeat(101)], ['ไม่พบ']]) {
      expect(splitGradingKeywordMatches(text, keywords)).toEqual([{ text, highlighted: false }])
    }
    expect(splitGradingKeywordMatches('', ['แรง'])).toEqual([])
  })

  it('does not match terms beyond the shared ten-keyword limit or mutate caller order', () => {
    const keywords = Object.freeze(Array.from({ length: 11 }, (_, index) => `<${index}>`))
    expect(splitGradingKeywordMatches('<10>', keywords)).toEqual([{ text: '<10>', highlighted: false }])
    expect(keywords[0]).toBe('<0>')
  })
})
