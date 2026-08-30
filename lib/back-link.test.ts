import { describe, it, expect } from 'vitest'
import { withBackHref, resolveBackHref, backHrefFromSearchParams, BACK_PARAM } from './back-link'

const params = (query: string) => new URLSearchParams(query)

describe('withBackHref', () => {
  it('tags the page being left onto the link', () => {
    expect(withBackHref('/questions/import/word', '/questions/import'))
      .toBe('/questions/import/word?back=%2Fquestions%2Fimport')
  })

  it('keeps the whole remembered view, filters and page included', () => {
    const href = withBackHref('/questions/import/word', '/questions?tab=team&page=2')
    expect(resolveBackHref(params(href.split('?')[1]), '/nope')).toBe('/questions?tab=team&page=2')
  })

  it('adds to a target that already has a query of its own', () => {
    expect(withBackHref('/x?a=1', '/questions')).toBe('/x?a=1&back=%2Fquestions')
  })

  it('links plainly when there is nowhere sensible to return to', () => {
    expect(withBackHref('/questions/import/word', 'https://example.test/')).toBe('/questions/import/word')
  })
})

describe('resolveBackHref', () => {
  it('returns the remembered page', () => {
    expect(resolveBackHref(params(`${BACK_PARAM}=%2Fquestions%2Fimport`), '/questions'))
      .toBe('/questions/import')
  })

  it('falls back when nothing was remembered', () => {
    // A bookmark, a typed address, or a link made before the arrow read this.
    expect(resolveBackHref(params(''), '/questions/import')).toBe('/questions/import')
  })

  it('refuses to send the reader to another site', () => {
    // The value comes from the browser, so a back arrow is an open redirect
    // waiting to happen — the same reason safeQuestionsRedirect exists.
    expect(resolveBackHref(params(`${BACK_PARAM}=https%3A%2F%2Fevil.test`), '/questions')).toBe('/questions')
    expect(resolveBackHref(params(`${BACK_PARAM}=%2F%2Fevil.test`), '/questions')).toBe('/questions')
    expect(resolveBackHref(params(`${BACK_PARAM}=%2F%5Cevil.test`), '/questions')).toBe('/questions')
    expect(resolveBackHref(params(`${BACK_PARAM}=javascript%3Aalert(1)`), '/questions')).toBe('/questions')
  })
})

describe('backHrefFromSearchParams', () => {
  it('reads the value a server page was given', () => {
    expect(backHrefFromSearchParams({ back: '/questions?tab=mine' }, '/questions'))
      .toBe('/questions?tab=mine')
  })

  it('takes the first of a repeated param rather than failing', () => {
    expect(backHrefFromSearchParams({ back: ['/questions/import', '/elsewhere'] }, '/questions'))
      .toBe('/questions/import')
  })

  it('falls back for a missing or off-site value', () => {
    expect(backHrefFromSearchParams({}, '/questions/import')).toBe('/questions/import')
    expect(backHrefFromSearchParams({ back: 'https://evil.test' }, '/questions')).toBe('/questions')
  })
})
