import { describe, expect, it } from 'vitest'
import { toggleQuestionSetSelection } from './question-set-selection'

const bank = new Set(['a', 'b', 'c', 'other'])
describe('toggleQuestionSetSelection', () => {
  it('adds in folder order without duplicating existing or repeated ids', () => {
    expect(toggleQuestionSetSelection(['other', 'b'], ['a', 'b', 'a', 'gone'], bank)).toEqual(['other', 'b', 'a'])
  })
  it('a second click removes only this folder, preserving other questions and order', () => {
    const selected = toggleQuestionSetSelection(['other'], ['a', 'b'], bank)
    expect(toggleQuestionSetSelection(selected, ['a', 'b'], bank)).toEqual(['other'])
  })
  it('fills a partially selected set and ignores unavailable questions', () => {
    expect(toggleQuestionSetSelection(['b'], ['a', 'b', 'gone'], bank)).toEqual(['b', 'a'])
    expect(toggleQuestionSetSelection(['a', 'b'], ['a', 'b', 'gone'], bank)).toEqual([])
  })
  it('shared questions use one selection; deselecting a set leaves other sets partial', () => {
    expect(toggleQuestionSetSelection(['a', 'b', 'c'], ['a', 'b'], bank)).toEqual(['c'])
  })
  it('empty and entirely unavailable folders do nothing', () => {
    expect(toggleQuestionSetSelection(['other'], [], bank)).toEqual(['other'])
    expect(toggleQuestionSetSelection(['other'], ['gone'], bank)).toEqual(['other'])
  })
})
