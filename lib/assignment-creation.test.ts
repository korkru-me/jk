import { describe, expect, it } from 'vitest'
import {
  assignmentCreationHref,
  newAssignmentTypeDefaults,
  resolveAssignmentTypePreset,
} from './assignment-creation'

describe('assignment creation navigation', () => {
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
