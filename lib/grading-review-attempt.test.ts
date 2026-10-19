import { describe, expect, it } from 'vitest'
import { preferPendingAverageReviewAttempts } from './grading-review-attempt'
import { officialSubmissionsByStudent } from './scoring'

const attempt = (id: string, attempt_number: number, overrides = {}) => ({
  id, student_id: 'student', status: 'submitted', total_score: 2 as number | null,
  max_score: 5, attempt_number, ...overrides,
})

describe('pending contributors in average grading review', () => {
  it('opens an older pending attempt while preserving the official average and maximum exactly', () => {
    const rows = [attempt('older', 1, { total_score: 1, max_score: 3 }),
      attempt('latest', 2, { total_score: 4, max_score: 7 })]
    const official = officialSubmissionsByStudent(rows, 'average')
    const reviewed = preferPendingAverageReviewAttempts(official, rows, new Set(['older']))

    expect(reviewed.get('student')).toEqual({ representative: rows[0], total_score: 2.5, max_score: 7 })
    expect(official.get('student')?.representative).toBe(rows[1])
    expect(rows.map(row => row.total_score)).toEqual([1, 4])
  })

  it('keeps a pending zero contributor reviewable and recognizes graded status', () => {
    const rows = [attempt('zero', 1, { total_score: 0, status: 'graded' }), attempt('latest', 2)]
    const result = preferPendingAverageReviewAttempts(officialSubmissionsByStudent(rows, 'average'), rows, new Set(['zero']))
    expect(result.get('student')?.representative.id).toBe('zero')
    expect(result.get('student')?.total_score).toBe(1)
  })

  it('selects the latest pending contributor, then exposes the next pending round after publication', () => {
    const rows = [attempt('first', 1), attempt('second', 2), attempt('latest-reviewed', 3)]
    const official = officialSubmissionsByStudent(rows, 'average')
    expect(preferPendingAverageReviewAttempts(official, rows, new Set(['first', 'second']))
      .get('student')?.representative.id).toBe('second')
    expect(preferPendingAverageReviewAttempts(official, rows, new Set(['first']))
      .get('student')?.representative.id).toBe('first')
    expect(preferPendingAverageReviewAttempts(official, rows, new Set())
      .get('student')).toBe(official.get('student'))
  })

  it('never selects an active or unscored attempt even if its ID is marked pending', () => {
    const rows = [attempt('complete', 1), attempt('active', 3, { status: 'in_progress' }),
      attempt('unscored', 4, { total_score: null })]
    const official = officialSubmissionsByStudent(rows, 'average')
    const result = preferPendingAverageReviewAttempts(official, rows, new Set(['active', 'unscored']))
    expect(result.get('student')).toBe(official.get('student'))
    expect(result.get('student')?.representative.id).toBe('complete')
  })

  it('keeps learner scopes separate and does not add learners outside the authorized official map', () => {
    const first = attempt('first', 1)
    const second = { ...attempt('second', 2), student_id: 'other' }
    const outsider = { ...attempt('outsider', 9), student_id: 'outside' }
    const official = officialSubmissionsByStudent([first, second], 'average')
    const result = preferPendingAverageReviewAttempts(official, [first, second, outsider], new Set(['first', 'outsider']))
    expect([...result.keys()]).toEqual(['student', 'other'])
    expect(result.get('student')?.representative).toBe(first)
    expect(result.get('other')).toBe(official.get('other'))
  })
})
