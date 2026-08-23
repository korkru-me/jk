import { describe, it, expect } from 'vitest'
import {
  dedupeTags,
  rankTagsByUse,
  normalizeTag,
  tagKey,
  mergeTagPool,
  canonicalTag,
  hasTag,
  suggestTags,
} from './tag-suggest'

const EARTH = 'โลก ดาราศาสตร์ และอวกาศ'

describe('normalizeTag', () => {
  it('collapses inner whitespace and trims', () => {
    expect(normalizeTag('  โลก  ดาราศาสตร์   และอวกาศ ')).toBe(EARTH)
  })
})

describe('tagKey', () => {
  it('treats spacing and case as the same tag', () => {
    expect(tagKey('โลก  ดาราศาสตร์ และอวกาศ')).toBe(tagKey(EARTH))
    expect(tagKey('Physics')).toBe(tagKey('physics'))
  })
})

describe('mergeTagPool', () => {
  it('puts recent tags first and drops duplicate spellings', () => {
    expect(mergeTagPool(['ฟิสิกส์', EARTH], ['โลก  ดาราศาสตร์ และอวกาศ'])).toEqual([
      EARTH,
      'ฟิสิกส์',
    ])
  })

  it('ignores blank entries', () => {
    expect(mergeTagPool(['', '   '], [])).toEqual([])
  })
})

describe('canonicalTag', () => {
  it('reuses the spelling already in the pool', () => {
    expect(canonicalTag([EARTH], 'โลก  ดาราศาสตร์  และอวกาศ')).toBe(EARTH)
  })

  it('falls back to the normalized input for a new tag', () => {
    expect(canonicalTag([EARTH], '  เคมี ')).toBe('เคมี')
  })
})

describe('hasTag', () => {
  it('compares on the key, not the raw string', () => {
    expect(hasTag([EARTH], 'โลก ดาราศาสตร์  และอวกาศ')).toBe(true)
    expect(hasTag([EARTH], 'โลก')).toBe(false)
  })
})

describe('suggestTags', () => {
  const pool = [EARTH, 'โลกร้อน', 'ชีววิทยา', 'ดาราศาสตร์เบื้องต้น']

  it('suggests the full tag from the first word', () => {
    expect(suggestTags(pool, 'โลก')).toEqual([EARTH, 'โลกร้อน'])
  })

  it('ranks a whole-tag prefix above a word match', () => {
    expect(suggestTags(pool, 'ดารา')).toEqual(['ดาราศาสตร์เบื้องต้น', EARTH])
  })

  it('matches a word in the middle of a tag', () => {
    expect(suggestTags(pool, 'อวกาศ')).toEqual([EARTH])
  })

  it('leaves out tags that are already picked', () => {
    expect(suggestTags(pool, 'โลก', ['โลก  ดาราศาสตร์ และอวกาศ'])).toEqual(['โลกร้อน'])
  })

  it('lists the pool when nothing is typed', () => {
    expect(suggestTags(pool, '  ')).toEqual(pool)
  })

  it('still finds the tag when a letter is mistyped', () => {
    expect(suggestTags(pool, 'ชีวdวิทยา')).toEqual(['ชีววิทยา'])
  })

  it('does not guess from a short query', () => {
    expect(suggestTags(pool, 'ชีx')).toEqual([])
  })

  it('honours the limit', () => {
    expect(suggestTags(pool, '', [], 2)).toHaveLength(2)
  })
})

describe('dedupeTags', () => {
  it('keeps the first spelling and drops the repeats', () => {
    expect(dedupeTags(['ไฟฟ้า', ' ไฟฟ้า ', 'Physics', 'physics'])).toEqual(['ไฟฟ้า', 'Physics'])
  })

  it('drops blanks', () => {
    expect(dedupeTags(['  ', 'คลื่น', ''])).toEqual(['คลื่น'])
  })
})

describe('rankTagsByUse', () => {
  it('puts the most-used tag first', () => {
    expect(rankTagsByUse([
      ['กลศาสตร์', 'งาน'],
      ['กลศาสตร์'],
      ['คลื่น'],
      ['กลศาสตร์', 'คลื่น'],
    ])).toEqual(['กลศาสตร์', 'คลื่น', 'งาน'])
  })

  it('counts spellings of one tag together, keeping the first one seen', () => {
    // Three questions tagged 'ไฟฟ้า' two ways, one tagged 'คลื่น': one entry
    // each, and the spelling stored is the one that appeared first.
    expect(rankTagsByUse([['ไฟฟ้า'], [' ไฟฟ้า'], ['ไฟฟ้า  '], ['คลื่น']]))
      .toEqual(['ไฟฟ้า', 'คลื่น'])
  })

  it('counts a tag repeated on one question only once', () => {
    expect(rankTagsByUse([['ไฟฟ้า', 'ไฟฟ้า '], ['คลื่น'], ['คลื่น']]))
      .toEqual(['คลื่น', 'ไฟฟ้า'])
  })

  it('breaks ties alphabetically so the order does not shuffle between loads', () => {
    expect(rankTagsByUse([['ข'], ['ก'], ['ค']])).toEqual(['ก', 'ข', 'ค'])
  })

  it('survives questions with no tags at all', () => {
    expect(rankTagsByUse([null, undefined, [], ['งาน']])).toEqual(['งาน'])
  })
})
