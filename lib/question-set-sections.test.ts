import { describe, it, expect } from 'vitest'
import {
  normalizeSetSections,
  groupQuestionsBySection,
  sectionsAreContiguous,
  filterSectionsToQuestions,
  questionIdsForSections,
  ungroupedQuestionIds,
  parseSections,
  moveSection,
  moveQuestionInSet,
  moveQuestionToIndex,
  moveQuestionOrder,
  moveQuestionOrderToIndex,
  setQuestionInSection,
  clearQuestionSections,
  sectionsByQuestionId,
  removeQuestionsFromSet,
} from './question-set-sections'

const s = (id: string, title: string, question_ids: string[]) => ({ id, title, question_ids })

describe('normalizeSetSections', () => {
  it('leaves a set with no sections alone', () => {
    expect(normalizeSetSections([], ['a', 'b'])).toEqual({ sections: [], question_ids: ['a', 'b'] })
  })

  it("keeps the set's own question order — sections do not reorder it", () => {
    const result = normalizeSetSections(
      [s('s2', 'วงกลม', ['c']), s('s1', 'โปรเจกไทล์', ['a'])],
      ['a', 'b', 'c']
    )
    expect(result.question_ids).toEqual(['a', 'b', 'c'])
  })

  it('drops ids the set does not contain', () => {
    const result = normalizeSetSections([s('s1', 'x', ['a', 'ghost'])], ['a', 'b'])
    expect(result.sections[0].question_ids).toEqual(['a'])
    expect(result.question_ids).toEqual(['a', 'b'])
  })

  it('lets one question sit in several sections', () => {
    const result = normalizeSetSections([s('s1', 'x', ['a']), s('s2', 'y', ['a', 'b'])], ['a', 'b'])
    expect(result.sections.map(x => x.question_ids)).toEqual([['a'], ['a', 'b']])
  })

  it('still drops a repeat within one section', () => {
    const result = normalizeSetSections([s('s1', 'x', ['a', 'a'])], ['a'])
    expect(result.sections[0].question_ids).toEqual(['a'])
  })

  it('keeps an empty section — the heading is created before it is filled', () => {
    const result = normalizeSetSections([s('s1', 'ใหม่', [])], ['a'])
    expect(result.sections).toHaveLength(1)
    expect(result.question_ids).toEqual(['a'])
  })

  it('replaces duplicate section ids instead of merging them', () => {
    const result = normalizeSetSections([s('dup', 'x', ['a']), s('dup', 'y', ['b'])], ['a', 'b'])
    expect(result.sections[0].id).not.toEqual(result.sections[1].id)
  })

  it('ignores junk from a tampered payload', () => {
    const result = normalizeSetSections([null, 'nope', { title: 5 }], ['a'])
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].title).toBe('')
    expect(result.question_ids).toEqual(['a'])
  })
})

describe('groupQuestionsBySection', () => {
  const sections = [s('s1', 'โปรเจกไทล์', ['a', 'b']), s('s2', 'วงกลม', ['c'])]

  it('splits an ordered list into one run per section', () => {
    expect(groupQuestionsBySection(['a', 'b', 'c', 'd'], sections)).toEqual([
      { sectionId: 's1', title: 'โปรเจกไทล์', question_ids: ['a', 'b'] },
      { sectionId: 's2', title: 'วงกลม', question_ids: ['c'] },
      { sectionId: null, title: null, question_ids: ['d'] },
    ])
  })

  it('follows the given order, not the section order', () => {
    const runs = groupQuestionsBySection(['c', 'a'], sections)
    expect(runs.map(r => r.sectionId)).toEqual(['s2', 's1'])
  })

  it('breaks into short runs when the order is shuffled', () => {
    expect(sectionsAreContiguous(['a', 'c', 'b'], sections)).toBe(false)
    expect(sectionsAreContiguous(['a', 'b', 'c'], sections)).toBe(true)
  })
})

describe('subsetting', () => {
  const sections = [s('s1', 'โปรเจกไทล์', ['a', 'b']), s('s2', 'วงกลม', ['c'])]

  it('keeps only questions still present, dropping emptied sections', () => {
    expect(filterSectionsToQuestions(sections, ['b'])).toEqual([s('s1', 'โปรเจกไทล์', ['b'])])
  })

  it('collects question ids for the chosen sections in section order', () => {
    expect(questionIdsForSections(sections, ['s2', 's1'])).toEqual(['a', 'b', 'c'])
  })

  it('reports what no section claimed', () => {
    expect(ungroupedQuestionIds(sections, ['a', 'b', 'c', 'd'])).toEqual(['d'])
  })
})

describe('parseSections', () => {
  it('returns [] for anything that is not a section array', () => {
    expect(parseSections(null)).toEqual([])
    expect(parseSections({ id: 's1' })).toEqual([])
  })

  it('keeps well-formed rows and repairs a missing title', () => {
    expect(parseSections([{ id: 's1', question_ids: ['a', 2] }])).toEqual([s('s1', '', ['a'])])
  })
})

describe('reordering', () => {
  const sections = [s('s1', 'A', ['a', 'b']), s('s2', 'B', ['c'])]
  const ids = ['a', 'b', 'c', 'd']

  it('moving a section leaves the question order alone', () => {
    const { question_ids, sections: next } = moveSection(sections, 's2', -1, ids)
    expect(next.map(x => x.id)).toEqual(['s2', 's1'])
    expect(question_ids).toEqual(ids)
  })

  it('moves a question within the set', () => {
    const result = moveQuestionInSet(sections, ids, 'c', -1)
    expect(result.question_ids).toEqual(['a', 'c', 'b', 'd'])
  })

  it('stops at the ends of the set', () => {
    expect(moveQuestionInSet(sections, ids, 'a', -1).question_ids).toEqual(ids)
    expect(moveQuestionInSet(sections, ids, 'd', 1).question_ids).toEqual(ids)
  })

  it('sends a question straight to a position, in either direction', () => {
    expect(moveQuestionToIndex(sections, ids, 'd', 0).question_ids).toEqual(['d', 'a', 'b', 'c'])
    expect(moveQuestionToIndex(sections, ids, 'a', 3).question_ids).toEqual(['b', 'c', 'd', 'a'])
  })

  it('clamps a position outside the set instead of dropping the question', () => {
    expect(moveQuestionToIndex(sections, ids, 'b', -5).question_ids).toEqual(['b', 'a', 'c', 'd'])
    expect(moveQuestionToIndex(sections, ids, 'b', 99).question_ids).toEqual(['a', 'c', 'd', 'b'])
  })

  it('leaves the set alone when the question is not in it', () => {
    expect(moveQuestionToIndex(sections, ids, 'zz', 0).question_ids).toEqual(ids)
  })

  it('keeps section membership through a move', () => {
    const { sections: next } = moveQuestionToIndex(sections, ids, 'a', 3)
    expect(next.map(x => x.question_ids)).toEqual([['a', 'b'], ['c']])
  })
})

describe('question order without sections', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('nudges and clamps the same way the set version does', () => {
    expect(moveQuestionOrder(ids, 'c', -1)).toEqual(['a', 'c', 'b', 'd'])
    expect(moveQuestionOrder(ids, 'a', -1)).toEqual(ids)
    expect(moveQuestionOrder(ids, 'd', 1)).toEqual(ids)
  })

  it('sends a question to a position, clamped to the list', () => {
    expect(moveQuestionOrderToIndex(ids, 'd', 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveQuestionOrderToIndex(ids, 'b', 99)).toEqual(['a', 'c', 'd', 'b'])
    expect(moveQuestionOrderToIndex(ids, 'b', -5)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('leaves the list alone for an id it does not hold', () => {
    expect(moveQuestionOrder(ids, 'zz', 1)).toEqual(ids)
    expect(moveQuestionOrderToIndex(ids, 'zz', 0)).toEqual(ids)
  })

  it('does not mutate the list it was given', () => {
    const original = [...ids]
    moveQuestionOrder(ids, 'a', 1)
    moveQuestionOrderToIndex(ids, 'a', 3)
    expect(ids).toEqual(original)
  })
})

describe('section membership', () => {
  const sections = [s('s1', 'A', ['a', 'b']), s('s2', 'B', ['c'])]
  const ids = ['a', 'b', 'c', 'd']

  it('adds a question to a section without taking it out of another', () => {
    const result = setQuestionInSection(sections, ids, 'a', 's2', true)
    expect(result.sections[0].question_ids).toEqual(['a', 'b'])
    expect(result.sections[1].question_ids).toEqual(['c', 'a'])
  })

  it('removes only the section it was asked about', () => {
    const both = setQuestionInSection(sections, ids, 'a', 's2', true)
    const result = setQuestionInSection(both.sections, both.question_ids, 'a', 's1', false)
    expect(result.sections[0].question_ids).toEqual(['b'])
    expect(result.sections[1].question_ids).toEqual(['c', 'a'])
  })

  it('reports every section a question belongs to', () => {
    const both = setQuestionInSection(sections, ids, 'a', 's2', true)
    expect(sectionsByQuestionId(both.sections).get('a')?.map(x => x.id)).toEqual(['s1', 's2'])
  })

  it('clearing puts a question back in the แฟ้ม alone', () => {
    const both = setQuestionInSection(sections, ids, 'a', 's2', true)
    const result = clearQuestionSections(both.sections, both.question_ids, 'a')
    expect(ungroupedQuestionIds(result.sections, result.question_ids)).toEqual(['a', 'd'])
  })

  it('assigning two sections that share a question yields it once, in set order', () => {
    const both = setQuestionInSection(sections, ids, 'a', 's2', true)
    expect(questionIdsForSections(both.sections, ['s1', 's2'], both.question_ids)).toEqual(['a', 'b', 'c'])
  })
})

describe('bulk moves', () => {
  const sections = [s('s1', 'A', ['a', 'b']), s('s2', 'B', ['c'])]
  const ids = ['a', 'b', 'c', 'd', 'e']

  it('removes several questions from the set without touching the rest', () => {
    const result = removeQuestionsFromSet(sections, ids, ['b', 'd'])
    expect(result.question_ids).toEqual(['a', 'c', 'e'])
    expect(result.sections[0].question_ids).toEqual(['a'])
  })
})
