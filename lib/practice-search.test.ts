import { describe, expect, it } from 'vitest'
import {
  PRACTICE_PAGE_SIZE,
  buildPracticeQuestionHref,
  buildPracticeSearchHref,
  parsePracticeSearchParams,
  practiceSearchTerms,
  practiceTotalPages,
} from './practice-search'

describe('practice search URL contract', () => {
  it('keeps repeated tags, de-duplicates case-insensitively and validates paging', () => {
    expect(parsePracticeSearchParams({
      q: '  กฎ   ของนิวตัน  ',
      tag: ['สอวน. ค่าย 1', 'ไฟฟ้า', '  ไฟฟ้า ', 'ELECTRIC', 'electric'],
      page: '-4',
    })).toEqual({
      q: 'กฎ ของนิวตัน',
      tags: ['สอวน. ค่าย 1', 'ไฟฟ้า', 'ELECTRIC'],
      page: 1,
      ignoredTagCount: 0,
    })
  })

  it('serializes every selected tag as its own URL value', () => {
    const href = buildPracticeSearchHref('library-1', {
      q: 'สนามไฟฟ้า',
      tags: ['สอวน. ค่าย 1', 'ไฟฟ้า'],
      page: 3,
      ignoredTagCount: 0,
    })
    const url = new URL(href, 'https://korkru.test')

    expect(url.pathname).toBe('/practice/library-1/library')
    expect(url.searchParams.get('q')).toBe('สนามไฟฟ้า')
    expect(url.searchParams.getAll('tag')).toEqual(['สอวน. ค่าย 1', 'ไฟฟ้า'])
    expect(url.searchParams.get('page')).toBe('3')
  })

  it('resets only the fields requested by a navigation patch', () => {
    const href = buildPracticeSearchHref('library-1', {
      q: 'แรง', tags: ['นิวตัน'], page: 4,
      ignoredTagCount: 0,
    }, { page: 1 })
    const url = new URL(href, 'https://korkru.test')

    expect(url.searchParams.get('q')).toBe('แรง')
    expect(url.searchParams.getAll('tag')).toEqual(['นิวตัน'])
    expect(url.searchParams.has('page')).toBe(false)
  })

  it('uses 24 rows per page and bounds search work', () => {
    expect(PRACTICE_PAGE_SIZE).toBe(24)
    expect(practiceTotalPages(0)).toBe(1)
    expect(practiceTotalPages(24)).toBe(1)
    expect(practiceTotalPages(25)).toBe(2)
    expect(practiceSearchTerms('หนึ่ง สอง สาม')).toEqual(['หนึ่ง', 'สอง', 'สาม'])
  })

  it('bounds worst-case Thai filters and carries them without nesting a back URL', () => {
    const state = parsePracticeSearchParams({
      q: 'ก'.repeat(160),
      tag: Array.from({ length: 20 }, (_, index) => `${index}-${'ข'.repeat(80)}`),
      page: '100000',
    })
    const href = buildPracticeQuestionHref('library-1', 'question-1', state)
    const url = new URL(href, 'https://korkru.test')

    expect(href.length).toBeLessThan(4_300)
    expect(url.searchParams.has('back')).toBe(false)
    expect(url.searchParams.get('q')).toHaveLength(160)
    expect(url.searchParams.getAll('tag').length).toBeGreaterThan(0)
    expect(state.ignoredTagCount).toBeGreaterThan(0)
  })

  it('reports instead of silently accepting tags beyond the supported request budget', () => {
    const state = parsePracticeSearchParams({
      tag: Array.from({ length: 23 }, (_, index) => `tag-${index}`),
    })

    expect(state.tags).toHaveLength(20)
    expect(state.ignoredTagCount).toBe(3)
  })
})


it('keeps an exercise through question and paging links and validates untrusted IDs', () => {
  const id = '80000000-0000-4000-8000-000000000001'
  const state = parsePracticeSearchParams({ exercise: id, page: '2' })
  expect(new URL(buildPracticeQuestionHref('library', 'question', state), 'https://test.invalid').searchParams.get('exercise')).toBe(id)
  expect(new URL(buildPracticeSearchHref('library', state, { page: 3 }), 'https://test.invalid').searchParams.get('exercise')).toBe(id)
  expect(buildPracticeSearchHref('library', state, { exerciseId: '', page: 1 })).toBe('/practice/library/library')
  expect(parsePracticeSearchParams({ exercise: 'not-a-uuid' }).exerciseId).toBeUndefined()
})
