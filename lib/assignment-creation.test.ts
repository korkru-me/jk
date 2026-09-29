import { describe, expect, it } from 'vitest'
import {
  assignmentCreationHref,
  assignmentCreationHubHref,
  assignmentCreationTitle,
  firstSearchParam,
  newAssignmentTypeDefaults,
  resolveAssignmentTypePreset,
} from './assignment-creation'

describe('assignment creation navigation', () => {
  it('builds the shared classroom-scoped assignment start link', () => {
    expect(assignmentCreationHubHref('room 1')).toBe(
      '/assignments/new?classroom=room+1',
    )
  })

  it('builds a classroom-scoped exercise link', () => {
    expect(assignmentCreationHref('room 1', 'exercise')).toBe(
      '/assignments/new?classroom=room+1&type=exercise',
    )
  })

  it('builds a classroom-scoped exam link', () => {
    expect(assignmentCreationHref('room-2', 'exam')).toBe(
      '/assignments/new?classroom=room-2&type=exam',
    )
  })

  it.each([
    ['exercise', 'สร้างแบบฝึกหัด'],
    ['exam', 'สร้างข้อสอบ'],
  ] as const)('labels a %s creation flow as %s', (type, expected) => {
    expect(assignmentCreationTitle(type)).toBe(expected)
  })

  it('uses the first value when a search parameter is repeated', () => {
    expect(firstSearchParam(['room-1', 'room-2'])).toBe('room-1')
    expect(firstSearchParam('room-1')).toBe('room-1')
    expect(firstSearchParam(undefined)).toBeUndefined()
  })

  it('uses exercise defaults for repeatable work with math tools', () => {
    expect(newAssignmentTypeDefaults('exercise')).toEqual({
      maxAttempts: '',
      retryScope: 'wrong_only',
      mathToolsEnabled: true,
    })
  })

  it('uses exam defaults for one attempt without math tools', () => {
    expect(newAssignmentTypeDefaults('exam')).toEqual({
      maxAttempts: '1',
      retryScope: 'all',
      mathToolsEnabled: false,
    })
  })

  it.each([
    ['exercise', 'exercise'],
    ['exam', 'exam'],
    [['exam', 'exercise'], 'exam'],
    ['quiz', undefined],
    [undefined, undefined],
  ] as const)('accepts only a supported assignment type preset', (value, expected) => {
    expect(resolveAssignmentTypePreset(value)).toBe(expected)
  })
})
