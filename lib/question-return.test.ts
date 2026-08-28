import { describe, it, expect } from 'vitest'
import { questionEditHref, questionsReturnTo, safeQuestionsRedirect } from './question-return'

describe('questionEditHref', () => {
  it('carries the bank view along as one encoded param', () => {
    // `useSearchParams().toString()` hands over an already-encoded query string.
    const bankQuery = new URLSearchParams({ q: 'นิวตัน', page: '2' }).toString()
    const href = questionEditHref('/questions/abc/edit', bankQuery)
    expect(href).toBe(`/questions/abc/edit?from=${encodeURIComponent(bankQuery)}`)
    expect(questionsReturnTo(new URLSearchParams(href.split('?')[1]))).toBe(`/questions?${bankQuery}`)
  })

  it('stays bare when the bank had no search or filters', () => {
    expect(questionEditHref('/questions/abc/edit', '')).toBe('/questions/abc/edit')
  })

  it('folds extra params into the remembered view', () => {
    const href = questionEditHref('/questions/abc/edit', 'q=แรง', { tab: 'team' })
    expect(questionsReturnTo(new URLSearchParams(href.split('?')[1]))).toBe('/questions?q=%E0%B9%81%E0%B8%A3%E0%B8%87&tab=team')
  })
})

describe('questionsReturnTo', () => {
  it('rebuilds the search and page the edit started from', () => {
    const params = new URLSearchParams({ from: 'q=นิวตัน&page=2' })
    expect(questionsReturnTo(params)).toBe(`/questions?q=${encodeURIComponent('นิวตัน')}&page=2`)
  })

  it('still honours the older tab-only links', () => {
    expect(questionsReturnTo(new URLSearchParams({ tab: 'team' }))).toBe('/questions?tab=team')
  })

  it('falls back to the plain bank', () => {
    expect(questionsReturnTo(new URLSearchParams())).toBe('/questions')
  })
})

describe('safeQuestionsRedirect', () => {
  it('keeps a question-bank target with its query', () => {
    expect(safeQuestionsRedirect('/questions?q=แรง&page=3')).toBe(`/questions?q=${encodeURIComponent('แรง')}&page=3`)
  })

  it('refuses anywhere that is not the question bank', () => {
    expect(safeQuestionsRedirect('https://evil.example/steal')).toBe('/questions')
    expect(safeQuestionsRedirect('//evil.example')).toBe('/questions')
    expect(safeQuestionsRedirect('/settings/team')).toBe('/questions')
    expect(safeQuestionsRedirect(undefined)).toBe('/questions')
  })
})

describe('returning to a แฟ้มโจทย์ editor', () => {
  const setId = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607'

  it('sends an edit started from a แฟ้ม back to that แฟ้ม', () => {
    const href = questionEditHref('/questions/abc/edit', '', { set: setId })
    expect(questionsReturnTo(new URLSearchParams(href.split('?')[1])))
      .toBe(`/questions/sets/${setId}/edit`)
  })

  it('ignores a แฟ้ม id that is not one', () => {
    const href = questionEditHref('/questions/abc/edit', '', { set: '../../settings/team' })
    expect(questionsReturnTo(new URLSearchParams(href.split('?')[1]))).toBe('/questions')
  })

  it('lets the server redirect to a แฟ้ม editor, and nowhere else under it', () => {
    expect(safeQuestionsRedirect(`/questions/sets/${setId}/edit`)).toBe(`/questions/sets/${setId}/edit`)
    expect(safeQuestionsRedirect('/questions/sets/not-a-uuid/edit')).toBe('/questions')
    expect(safeQuestionsRedirect(`/questions/sets/${setId}/edit/../../../admin`)).toBe('/questions')
  })
})
