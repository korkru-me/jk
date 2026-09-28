import { describe, expect, it } from 'vitest'
import {
  HOMEROOM_CLASSROOM_NAVIGATION,
  SUBJECT_CLASSROOM_NAVIGATION,
  classroomNavigationFor,
  isClassroomDetailPath,
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

describe('classroom detail route detection', () => {
  it.each([
    '/classrooms/6f201055-28e8-41a2-98ea-90c3054b437e',
    '/classrooms/room-slug',
    '/classrooms/room-slug/',
  ])('recognizes a direct classroom detail route: %s', pathname => {
    expect(isClassroomDetailPath(pathname)).toBe(true)
  })

  it.each([
    '/classrooms',
    '/classrooms/new',
    '/classrooms/archived',
    '/classrooms/trash',
    '/classrooms/room-slug/report',
    '/dashboard',
  ])('does not compact the global sidebar on non-detail routes: %s', pathname => {
    expect(isClassroomDetailPath(pathname)).toBe(false)
  })
})
