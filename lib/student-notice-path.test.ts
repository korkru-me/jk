import { describe, expect, it } from 'vitest'
import { isStudentNoticeSuspendedPath } from './student-notice-path'

describe('automatic student notice learning-route guard', () => {
  it.each([
    '/assignments/work/take',
    '/assignments/work/take?attempt=active&sebChallenge=challenge',
    '/assignments/work/take/',
    '/practice/library/exercises/exercise/take',
    '/practice/library/exercises/exercise/take?resume=1',
    '/practice/library/questions/question',
    '/practice/library/questions/question#answer',
  ])('does not interrupt answering or entry on %s', pathname => {
    expect(isStudentNoticeSuspendedPath(pathname)).toBe(true)
  })

  it.each([
    '/dashboard', '/classrooms/room', '/classrooms/room?view=assignments',
    '/assignments', '/assignments/work', '/assignments/work/results',
    '/assignments/work/takeover', '/submissions/submission',
    '/practice', '/practice/library', '/practice/library/library',
    '/practice/library/exercises/exercise',
  ])('allows the notice queue on %s', pathname => {
    expect(isStudentNoticeSuspendedPath(pathname)).toBe(false)
  })

  it.each([null, undefined, ''])('waits while the route is unresolved (%s)', pathname => {
    expect(isStudentNoticeSuspendedPath(pathname)).toBe(true)
  })
})
