import { describe, expect, it } from 'vitest'
import { isAssignmentStudentPreviewPath } from './assignment-preview-navigation'

describe('isAssignmentStudentPreviewPath', () => {
  it.each([
    '/assignments/assignment-1/preview',
    '/assignments/assignment-1/preview/',
  ])('recognizes the student-view preview route: %s', pathname => {
    expect(isAssignmentStudentPreviewPath(pathname)).toBe(true)
  })

  it.each([
    '/assignments',
    '/assignments/assignment-1',
    '/assignments/assignment-1/edit',
    '/assignments/assignment-1/preview/results',
    '/dashboard',
  ])('keeps normal navigation outside the preview route: %s', pathname => {
    expect(isAssignmentStudentPreviewPath(pathname)).toBe(false)
  })
})
