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

describe('original classroom cover patterns', () => {
  it('offers the ten requested subjects plus the KorKru deer', () => {
    expect(CLASSROOM_COVER_PATTERN_OPTIONS).toHaveLength(11)
    expect(new Set(CLASSROOM_COVER_PATTERN_OPTIONS.map(option => option.key)).size).toBe(11)
    expect(new Set(CLASSROOM_COVER_PATTERN_OPTIONS.map(option => option.label)).size).toBe(11)
    expect(CLASSROOM_COVER_PATTERN_OPTIONS.at(-1)?.key).toBe('korkru-deer')
  })

  it.each(CLASSROOM_COVER_PATTERN_OPTIONS)('renders $key as palette-free line art', option => {
    expect(isClassroomCoverPatternKey(option.key)).toBe(true)
    const html = renderToStaticMarkup(createElement(ClassroomCoverPattern, { patternKey: option.key }))

    expect(html).toContain(`data-classroom-cover-pattern="${option.key}"`)
    expect(html).toContain('stroke="currentColor"')
    expect(html).not.toMatch(/#[0-9a-f]{3,8}/i)
  })

  it.each([undefined, null, '', 'google-classroom', '<svg>', {}, 11])('falls back safely for %j', value => {
    expect(isClassroomCoverPatternKey(value)).toBe(false)
    expect(classroomCoverPatternKey(value)).toBe(DEFAULT_CLASSROOM_COVER_PATTERN)
  })
})
