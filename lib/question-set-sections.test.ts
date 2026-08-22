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
  moveQuestionToSection,
  moveQuestionWithinGroup,
} from './question-set-sections'

const s = (id: string, title: string, question_ids: string[]) => ({ id, title, question_ids })

describe('normalizeSetSections', () => {
  it('leaves a set with no sections alone', () => {
    expect(normalizeSetSections([], ['a', 'b'])).toEqual({ sections: [], question_ids: ['a', 'b'] })
  })

  it('rebuilds question_ids so section order is question order', () => {
    const result = normalizeSetSections(
      [s('s2', 'วงกลม', ['c']), s('s1', 'โปรเจกไทล์', ['a'])],
      ['a', 'b', 'c']
    )
    expect(result.question_ids).toEqual(['c', 'a', 'b'])
  })

  it('drops ids the set does not contain', () => {
    const result = normalizeSetSections([s('s1', 'x', ['a', 'ghost'])], ['a', 'b'])
    expect(result.sections[0].question_ids).toEqual(['a'])
    expect(result.question_ids).toEqual(['a', 'b'])
  })

  it('keeps a question claimed twice in the first section only', () => {
    const result = normalizeSetSections([s('s1', 'x', ['a']), s('s2', 'y', ['a', 'b'])], ['a', 'b'])
    expect(result.sections.map(x => x.question_ids)).toEqual([['a'], ['b']])
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

  it('moving a section carries its questions', () => {
    const { question_ids } = moveSection(sections, 's2', -1, ids)
    expect(question_ids).toEqual(['c', 'a', 'b', 'd'])
  })

  it('moving a question into a section appends it there', () => {
    const result = moveQuestionToSection(sections, ids, 'd', 's1')
    expect(result.sections[0].question_ids).toEqual(['a', 'b', 'd'])
    expect(result.question_ids).toEqual(['a', 'b', 'd', 'c'])
  })

  it('moving a question out of every section leaves it ungrouped', () => {
    const result = moveQuestionToSection(sections, ids, 'a', null)
    expect(result.sections[0].question_ids).toEqual(['b'])
    expect(ungroupedQuestionIds(result.sections, result.question_ids)).toEqual(['a', 'd'])
  })

  it('reorders inside a section without escaping it', () => {
    const result = moveQuestionWithinGroup(sections, ids, 'b', -1)
    expect(result.sections[0].question_ids).toEqual(['b', 'a'])
  })

  it('stops at the edge instead of falling into the next group', () => {
    const result = moveQuestionWithinGroup(sections, ids, 'a', -1)
    expect(result.sections[0].question_ids).toEqual(['a', 'b'])
  })

  it('reorders ungrouped questions among themselves', () => {
    const withTwoLoose = moveQuestionToSection(sections, [...ids, 'e'], 'e', null)
    const result = moveQuestionWithinGroup(withTwoLoose.sections, withTwoLoose.question_ids, 'e', -1)
    expect(ungroupedQuestionIds(result.sections, result.question_ids)).toEqual(['e', 'd'])
  })
})
