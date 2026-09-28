import { describe, expect, it } from 'vitest'
import {
  HOMEROOM_CLASSROOM_NAVIGATION,
  SUBJECT_CLASSROOM_NAVIGATION,
  classroomNavigationFor,
} from './classroom-navigation'

describe('classroom navigation', () => {
  it('keeps the complete subject-classroom order for managers', () => {
    expect(classroomNavigationFor('subject', true).map(item => item.key)).toEqual([
      'overview',
      'assignments',
      'scores',
      'ability',
      'students',
      'groups',
      'invite',
      'coteachers',
    ])
  })

  it('hides manager-only subject pages from view-only teachers', () => {
    expect(classroomNavigationFor('subject', false).map(item => item.key)).toEqual([
      'overview',
      'students',
      'groups',
      'invite',
      'coteachers',
    ])
  })

  it('keeps the complete homeroom order for managers', () => {
    expect(classroomNavigationFor('homeroom', true).map(item => item.key)).toEqual([
      'overview',
      'homeroom',
      'students',
      'invite',
      'coteachers',
    ])
  })

  it('hides the manager-only homeroom page from view-only teachers', () => {
    expect(classroomNavigationFor('homeroom', false).map(item => item.key)).toEqual([
      'overview',
      'students',
      'invite',
      'coteachers',
    ])
  })

  it('does not duplicate navigation keys', () => {
    for (const items of [SUBJECT_CLASSROOM_NAVIGATION, HOMEROOM_CLASSROOM_NAVIGATION]) {
      const keys = items.map(item => item.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})
