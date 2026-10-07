import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CLASSROOM_ICON_OPTIONS, DEFAULT_CLASSROOM_ICON, classroomIconKey, isClassroomIconKey } from './classroom-icons'
import { ClassroomIcon } from '@/components/classrooms/classroom-icon'

describe('classroom icon choices', () => {
  it('offers exactly the 21 approved options, with unique keys and labels', () => {
    expect(CLASSROOM_ICON_OPTIONS).toHaveLength(21)
    expect(new Set(CLASSROOM_ICON_OPTIONS.map(option => option.key)).size).toBe(21)
    expect(new Set(CLASSROOM_ICON_OPTIONS.map(option => option.label)).size).toBe(21)
    expect(CLASSROOM_ICON_OPTIONS[0].key).toBe(DEFAULT_CLASSROOM_ICON)
  })

  it.each([undefined, null, '', 'unknown', 'School', '<svg>', {}, 1])('falls back to the existing building for %j', value => {
    expect(isClassroomIconKey(value)).toBe(false)
    expect(classroomIconKey(value)).toBe('school')
  })

  it.each(CLASSROOM_ICON_OPTIONS)('recognizes and renders $key independently of the room subject', option => {
    expect(isClassroomIconKey(option.key)).toBe(true)
    expect(classroomIconKey(option.key)).toBe(option.key)
    const html = renderToStaticMarkup(createElement(ClassroomIcon, { iconKey: option.key }))
    expect(html).toContain(`data-classroom-icon="${option.key}"`)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('currentColor')
  })

  it('renders a real school, not an undefined component, for unknown saved values', () => {
    expect(renderToStaticMarkup(createElement(ClassroomIcon, { iconKey: 'future-icon' })))
      .toContain('data-classroom-icon="school"')
  })

  it.each([
    ['thai', 'ก'], ['english', 'A'], ['chinese', '中'], ['korean', '한'], ['japanese', 'あ'],
  ])('gives %s its own language glyph', (key, glyph) => {
    expect(renderToStaticMarkup(createElement(ClassroomIcon, { iconKey: key }))).toContain(`>${glyph}</text>`)
  })
})
