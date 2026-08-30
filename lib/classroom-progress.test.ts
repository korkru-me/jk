import { describe, it, expect } from 'vitest'
import {
  computeAssignmentProgress,
  isDueBy,
  summarizeClassroomProgress,
  type ProgressAssignment,
  type ProgressSubmission,
} from './classroom-progress'

const HOUR = 3600_000
const NOW = new Date('2026-09-01T12:00:00Z').getTime()

function assignment(over: Partial<ProgressAssignment> & { id: string }): ProgressAssignment {
  return {
    end_at: null,
    passing_type: null,
    passing_value: null,
    score_strategy: 'best',
    ...over,
  }
}

function submission(over: Partial<ProgressSubmission> & { assignment_id: string; student_id: string }): ProgressSubmission {
  return {
    status: 'submitted',
    total_score: 10,
    max_score: 10,
    attempt_number: 1,
    ...over,
  }
}

describe('isDueBy', () => {
  it('treats a งาน with no deadline as always due', () => {
    expect(isDueBy(null, NOW)).toBe(true)
  })

  it('separates past from future deadlines', () => {
    expect(isDueBy(new Date(NOW - HOUR).toISOString(), NOW)).toBe(true)
    expect(isDueBy(new Date(NOW + HOUR).toISOString(), NOW)).toBe(false)
  })
})

describe('computeAssignmentProgress', () => {
  it('counts one student once no matter how many attempts they made', () => {
    const a = assignment({ id: 'a1' })
    const progress = computeAssignmentProgress(a, [
      submission({ assignment_id: 'a1', student_id: 's1', attempt_number: 1, total_score: 4 }),
      submission({ assignment_id: 'a1', student_id: 's1', attempt_number: 2, total_score: 9 }),
    ])
    expect(progress.attempted).toBe(1)
    expect(progress.submitted).toBe(1)
  })

  it('separates a still-working student from one who handed in', () => {
    const a = assignment({ id: 'a1' })
    const progress = computeAssignmentProgress(a, [
      submission({ assignment_id: 'a1', student_id: 's1' }),
      submission({ assignment_id: 'a1', student_id: 's2', status: 'in_progress', total_score: null }),
    ], new Set(['s1', 's2', 's3']))
    expect(progress.submitted).toBe(1)
    expect(progress.inProgress).toBe(1)
    expect(progress.missing).toBe(2)
  })

  it('applies the งาน\'s passing threshold to completed/passed', () => {
    const a = assignment({ id: 'a1', passing_type: 'percent', passing_value: 60 })
    const progress = computeAssignmentProgress(a, [
      submission({ assignment_id: 'a1', student_id: 's1', total_score: 8 }),
      submission({ assignment_id: 'a1', student_id: 's2', total_score: 3 }),
    ])
    expect(progress.submitted).toBe(2)
    expect(progress.completed).toBe(1)
    expect(progress.passed).toBe(1)
  })

  it('follows score_strategy when attempts disagree', () => {
    const a = assignment({ id: 'a1', score_strategy: 'latest', passing_type: 'percent', passing_value: 60 })
    const progress = computeAssignmentProgress(a, [
      submission({ assignment_id: 'a1', student_id: 's1', attempt_number: 1, total_score: 10 }),
      submission({ assignment_id: 'a1', student_id: 's1', attempt_number: 2, total_score: 2 }),
    ])
    expect(progress.passed).toBe(0)
  })

  it('ignores submitters who are no longer on the roster', () => {
    const a = assignment({ id: 'a1' })
    const progress = computeAssignmentProgress(a, [
      submission({ assignment_id: 'a1', student_id: 'moved-away' }),
    ], new Set(['s1']))
    expect(progress.submitted).toBe(0)
    expect(progress.missing).toBe(1)
  })
})

describe('summarizeClassroomProgress', () => {
  const students = ['s1', 's2']
  const assignments = [
    assignment({ id: 'past', end_at: new Date(NOW - HOUR).toISOString() }),
    assignment({ id: 'future', end_at: new Date(NOW + HOUR).toISOString() }),
  ]

  it('measures each student against what is already due, not everything assigned', () => {
    const summary = summarizeClassroomProgress(students, assignments, [
      submission({ assignment_id: 'past', student_id: 's1' }),
    ], NOW)

    expect(summary.dueAssignmentCount).toBe(1)
    expect(summary.byStudent.get('s1')).toMatchObject({ submitted: 1, total: 1, rate: 100 })
    expect(summary.byStudent.get('s2')).toMatchObject({ submitted: 0, total: 1, rate: 0 })
    expect(summary.overallRate).toBe(50)
  })

  it('does not credit an early hand-in of work that is not due yet', () => {
    const summary = summarizeClassroomProgress(students, assignments, [
      submission({ assignment_id: 'future', student_id: 's1' }),
    ], NOW)

    expect(summary.byStudent.get('s1')?.rate).toBe(0)
    expect(summary.byAssignment.get('future')?.submitted).toBe(1)
  })

  it('reports no rate at all when nothing is due yet', () => {
    const summary = summarizeClassroomProgress(students, [assignments[1]], [], NOW)
    expect(summary.overallRate).toBeNull()
    expect(summary.byStudent.get('s1')?.rate).toBe(100)
  })

  it('keeps a student listed even with no submission rows anywhere', () => {
    const summary = summarizeClassroomProgress(students, assignments, [], NOW)
    expect(summary.byStudent.size).toBe(2)
    expect(summary.submittedTotal).toBe(0)
    expect(summary.expectedTotal).toBe(2)
  })
})
