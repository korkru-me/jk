import { describe, expect, it } from 'vitest'
import {
  HOMEROOM_CLASSROOM_NAVIGATION,
  SUBJECT_CLASSROOM_NAVIGATION,
  classroomNavigationHref,
  classroomNavigationFor,
  isClassroomDetailPath,
  resolveClassroomNavigationKey,
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

  it('resolves only pages available to the current classroom permission', () => {
    const viewOnlyItems = classroomNavigationFor('subject', false)

    expect(resolveClassroomNavigationKey('students', viewOnlyItems)).toBe('students')
    expect(resolveClassroomNavigationKey('scores', viewOnlyItems)).toBe('overview')
    expect(resolveClassroomNavigationKey('unknown', viewOnlyItems)).toBe('overview')
    expect(resolveClassroomNavigationKey(undefined, viewOnlyItems)).toBe('overview')
    expect(resolveClassroomNavigationKey(['groups', 'students'], viewOnlyItems)).toBe('groups')
  })

  it('updates the view parameter without losing the remembered back target', () => {
    expect(classroomNavigationHref(
      'https://korkru.test/classrooms/room-1?back=%2Fclassrooms%2Farchived#content',
      'students',
    )).toBe('/classrooms/room-1?back=%2Fclassrooms%2Farchived&view=students#content')
  })

  it('removes the default overview view while preserving other URL state', () => {
    expect(classroomNavigationHref(
      'https://korkru.test/classrooms/room-1?view=scores&back=%2Fclassrooms',
      'overview',
    )).toBe('/classrooms/room-1?back=%2Fclassrooms')
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
