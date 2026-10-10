import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ClassroomCoverPattern } from '@/components/classrooms/classroom-cover-pattern'
import {
  CLASSROOM_COVER_PATTERN_OPTIONS,
  DEFAULT_CLASSROOM_COVER_PATTERN,
  classroomCoverPatternKey,
  isClassroomCoverPatternKey,
} from './classroom-cover-patterns'

const EXPECTED_KEYS = [
  'physics',
  'chemistry',
  'biology',
  'astronomy',
  'earth',
  'classroom',
  'thai',
  'foreign-language',
  'social-studies',
  'physical-education',
  'korkru-deer',
] as const

describe('theme-reactive classroom cover artwork', () => {
  it('offers the ten requested subjects plus the KorKru deer', () => {
    expect(CLASSROOM_COVER_PATTERN_OPTIONS.map(option => option.key)).toEqual(EXPECTED_KEYS)
    expect(new Set(CLASSROOM_COVER_PATTERN_OPTIONS.map(option => option.label)).size).toBe(11)
    expect(DEFAULT_CLASSROOM_COVER_PATTERN).toBe('classroom')
  })

  it.each(CLASSROOM_COVER_PATTERN_OPTIONS)('renders $key as safe palette-free artwork', option => {
    expect(isClassroomCoverPatternKey(option.key)).toBe(true)
    const html = renderToStaticMarkup(createElement(ClassroomCoverPattern, { patternKey: option.key }))

    expect(html).toContain(`data-classroom-cover-pattern="${option.key}"`)
    expect(html).toContain(`data-classroom-cover-motif="${option.key}"`)
    expect(html).toContain('data-classroom-cover-field="upper-right"')
    expect(html).toContain('stroke="currentColor"')
    expect(html).toContain('fill="currentColor"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('focusable="false"')
    expect(html).not.toMatch(/#[0-9a-f]{3,8}/i)
    expect(html).not.toMatch(/<(?:image|foreignObject|linearGradient|radialGradient)\b/i)
    expect(html).toMatch(/clip-path="url\(#korkru-cover-[^)]+\)"/)
    expect(html).not.toMatch(/url\((?!#korkru-cover-)[^)]+\)/)

    const fills = [...html.matchAll(/\bfill="([^"]+)"/g)].map(match => match[1])
    const strokes = [...html.matchAll(/\bstroke="([^"]+)"/g)].map(match => match[1])
    expect(fills.every(value => value === 'none' || value === 'currentColor')).toBe(true)
    expect(strokes.every(value => value === 'none' || value === 'currentColor')).toBe(true)
  })

  it('keeps every subject motif visually distinct', () => {
    const artwork = CLASSROOM_COVER_PATTERN_OPTIONS.map(option => (
      renderToStaticMarkup(createElement(ClassroomCoverPattern, { patternKey: option.key }))
        .replaceAll(`data-classroom-cover-pattern="${option.key}"`, '')
        .replaceAll(`data-classroom-cover-motif="${option.key}"`, '')
    ))

    expect(new Set(artwork).size).toBe(CLASSROOM_COVER_PATTERN_OPTIONS.length)
  })

  it('aligns the upper-right artwork to the end of covers without cropping it', () => {
    const html = renderToStaticMarkup(createElement(ClassroomCoverPattern, {
      patternKey: 'physics',
      placement: 'end',
    }))

    expect(html).toContain('preserveAspectRatio="xMaxYMin meet"')
    expect(html).toContain('data-classroom-cover-field="upper-right"')
    expect(html).toContain('d="M0 0h320v112Z"')
  })

  it.each([undefined, null, '', 'google-classroom', '<svg>', {}, 11])('falls back safely for %j', value => {
    expect(isClassroomCoverPatternKey(value)).toBe(false)
    expect(classroomCoverPatternKey(value)).toBe(DEFAULT_CLASSROOM_COVER_PATTERN)
  })
})
