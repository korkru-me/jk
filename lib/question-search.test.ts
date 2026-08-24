import { describe, it, expect } from 'vitest'
import {
  matchesSearch, matchesTags, filterQuestions, searchTerms,
  questionSearchOrClauses, tagsMatchingTerm, questionSearchGroup,
  questionSearchGroupFilters, questionSearchGroupSlices,
} from './question-search'

const rain = {
  title: 'ตามเกณฑ์ปริมาณฝนรายวันของประเทศไทย หากวัดปริมาณฝนได้ 50.5 มิลลิเมตร',
  question_text: '<pre class="question-text mat-title-medium">ตามเกณฑ์ปริมาณฝนรายวัน จะจัดอยู่ในเกณฑ์ใด?</pre>',
  difficulty: 'medium',
  tags: ['อุตุนิยมวิทยา', 'ฝน'],
}
const work = {
  title: '*งาน ง่าย งานตั้งฉากกับการกระจัด',
  question_text: '<p>เด็กชายก้านกล้วยยกวัตถุมวล {m} กิโลกรัม</p>',
  difficulty: 'medium',
  tags: null,
}

describe('matchesSearch', () => {
  it('matches everything when nothing was typed', () => {
    expect(matchesSearch(rain, '')).toBe(true)
    expect(matchesSearch(rain, '   ')).toBe(true)
  })

  it('matches the title and the readable body', () => {
    expect(matchesSearch(rain, 'มิลลิเมตร')).toBe(true)
    expect(matchesSearch(rain, 'เกณฑ์ใด')).toBe(true)
    expect(matchesSearch(rain, 'แรงลัพธ์')).toBe(false)
  })

  it('matches tags — the words a teacher files a question under', () => {
    expect(matchesSearch(rain, 'อุตุนิยมวิทยา')).toBe(true)
    expect(matchesSearch(work, 'อุตุนิยมวิทยา')).toBe(false)
  })

  it('does not match the markup the body is wrapped in', () => {
    expect(matchesSearch(rain, 'class')).toBe(false)
    expect(matchesSearch(rain, 'pre')).toBe(false)
  })

  it('matches words in any order, however they are spaced', () => {
    expect(matchesSearch(rain, 'เกณฑ์ ปริมาณฝน')).toBe(true)
    expect(matchesSearch(rain, '  ฝน   50.5  ')).toBe(true)
    expect(matchesSearch(rain, 'ฝน หิมะ')).toBe(false)
  })

  it('ignores case', () => {
    expect(matchesSearch({ ...work, title: 'Hail (ลูกเห็บ)' }, 'HAIL')).toBe(true)
  })
})

describe('matchesTags', () => {
  it('is unfiltered with no tag chips', () => {
    expect(matchesTags(work, [])).toBe(true)
  })

  it('needs every chip, case-insensitively', () => {
    expect(matchesTags(rain, ['ฝน'])).toBe(true)
    expect(matchesTags(rain, ['ฝน', 'อุตุนิยมวิทยา'])).toBe(true)
    expect(matchesTags(rain, ['ฝน', 'ลม'])).toBe(false)
  })

  it('never matches a question whose tags were not loaded', () => {
    // The regression this suite exists for: the แฟ้มโจทย์ pages left `tags`
    // out of their select, so every question arrived tagless and every tag
    // filter came back empty.
    expect(matchesTags({ ...rain, tags: undefined }, ['ฝน'])).toBe(false)
    expect(matchesTags({ ...rain, tags: undefined }, [])).toBe(true)
  })
})

describe('filterQuestions', () => {
  const all = [rain, work]

  it('combines difficulty, search and tags', () => {
    expect(filterQuestions(all, { search: '', difficulty: 'all', tagFilters: [] })).toHaveLength(2)
    expect(filterQuestions(all, { search: '', difficulty: 'hard', tagFilters: [] })).toHaveLength(0)
    expect(filterQuestions(all, { search: 'งาน', difficulty: 'all', tagFilters: [] })).toEqual([work])
    expect(filterQuestions(all, { search: '', difficulty: 'all', tagFilters: ['ฝน'] })).toEqual([rain])
    expect(filterQuestions(all, { search: 'งาน', difficulty: 'all', tagFilters: ['ฝน'] })).toHaveLength(0)
  })
})

describe('searchTerms', () => {
  it('splits on whitespace and drops the empties', () => {
    expect(searchTerms('  ฝน   ตก ')).toEqual(['ฝน', 'ตก'])
    expect(searchTerms('')).toEqual([])
  })
})

describe('questionSearchOrClauses', () => {
  it('is empty for a blank query — no clause to AND in', () => {
    expect(questionSearchOrClauses('', ['ฝน'])).toEqual([])
    expect(questionSearchOrClauses('   ')).toEqual([])
  })

  it('searches title and body when no tag matches', () => {
    expect(questionSearchOrClauses('ฝน', ['งาน'])).toEqual([
      'title.ilike."%ฝน%",question_text.ilike."%ฝน%"',
    ])
  })

  it('adds the tags a word points at, by substring', () => {
    expect(questionSearchOrClauses('พลัง', ['พลังงาน', 'งาน', 'พลังงานกล'])).toEqual([
      'title.ilike."%พลัง%",question_text.ilike."%พลัง%",tags.ov.{"พลังงาน","พลังงานกล"}',
    ])
  })

  it('gives one clause per word — chained .or() calls AND them', () => {
    expect(questionSearchOrClauses('ฝน เกณฑ์')).toHaveLength(2)
  })

  it('quotes values so a comma or a dot cannot break the filter', () => {
    expect(questionSearchOrClauses('a,b')[0]).toContain('title.ilike."%a,b%"')
    expect(questionSearchOrClauses('a', ['a,b'])[0]).toContain('tags.ov.{"a,b"}')
  })

  it('escapes the wildcards LIKE would otherwise read as pattern', () => {
    // \% reaches LIKE as a literal per cent — the extra backslash is the one
    // PostgREST strips when it unquotes the value.
    expect(questionSearchOrClauses('50%')[0]).toContain(String.raw`title.ilike."%50\\%%"`)
  })
})

describe('tagsMatchingTerm', () => {
  it('is case-insensitive and ignores surrounding space', () => {
    expect(tagsMatchingTerm(['Energy', 'งาน'], ' ENER ')).toEqual(['Energy'])
  })

  it('is empty for a blank term', () => {
    expect(tagsMatchingTerm(['งาน'], '  ')).toEqual([])
  })
})

describe('questionSearchGroup', () => {
  it('uses the visible priority tag, then title, then content', () => {
    expect(questionSearchGroup(rain, 'ฝน')).toBe('tag')
    expect(questionSearchGroup({ ...rain, tags: [] }, 'มิลลิเมตร')).toBe('title')
    expect(questionSearchGroup({ ...rain, title: 'ปริมาณน้ำ', tags: [] }, 'เกณฑ์ใด')).toBe('content')
  })

  it('puts a result in only the highest-priority group', () => {
    expect(questionSearchGroup({
      ...rain,
      title: 'ฝนรายวัน',
      question_text: '<p>ฝนตกหนัก</p>',
      tags: ['ฝน'],
    }, 'ฝน')).toBe('tag')
  })

  it('keeps the every-term broad matching rule before grouping', () => {
    expect(questionSearchGroup(rain, 'ฝน หิมะ')).toBeNull()
    expect(questionSearchGroup(rain, '')).toBeNull()
  })
})

describe('questionSearchGroupFilters', () => {
  it('builds the tag and title pieces used for exclusive server groups', () => {
    const filters = questionSearchGroupFilters('พลัง งาน', ['พลังงาน', 'งาน', 'แรง'])
    expect(filters.broadOrClauses).toHaveLength(2)
    expect(filters.matchingTags).toEqual(['พลังงาน', 'งาน'])
    expect(filters.titleOrClause).toContain('title.ilike."%พลัง%"')
    expect(filters.titleOrClause).toContain('title.ilike."%งาน%"')
    expect(filters.matchingTagsLiteral).toBe('{"พลังงาน","งาน"}')
  })

  it('returns safe empty group pieces for a blank query', () => {
    expect(questionSearchGroupFilters('  ', ['งาน'])).toEqual({
      broadOrClauses: [],
      matchingTags: [],
      titleOrClause: '',
      titlePatterns: [],
      matchingTagsLiteral: '{}',
    })
  })
})

describe('questionSearchGroupSlices', () => {
  const counts = { tag: 10, title: 20, content: 30 }

  it('fills one page in tag-title-content order', () => {
    expect(questionSearchGroupSlices(counts, 'all', 1, 24)).toEqual({
      tag: { from: 0, to: 9 },
      title: { from: 0, to: 13 },
    })
    expect(questionSearchGroupSlices(counts, 'all', 2, 24)).toEqual({
      title: { from: 14, to: 19 },
      content: { from: 0, to: 17 },
    })
  })

  it('pages a selected group independently', () => {
    expect(questionSearchGroupSlices(counts, 'content', 2, 24)).toEqual({
      content: { from: 24, to: 29 },
    })
  })

  it('returns no slice past the final result', () => {
    expect(questionSearchGroupSlices(counts, 'all', 4, 24)).toEqual({})
  })
})
