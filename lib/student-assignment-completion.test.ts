import { describe, expect, it } from 'vitest'
import { isCompleted, type StudentAssignmentRow } from '@/app/(app)/classrooms/[id]/_components/assignment-status'

const assignment: StudentAssignmentRow = {
  id: 'assignment', title: 'mock', question_ids: [], random_question_count: null,
  completion_rule: 'fixed', end_at: null, duration_minutes: null,
  type: 'exam', max_attempts: 1, retry_scope: 'all', passing_type: null, passing_value: null,
  show_results: 'never', attempts_used: 1, has_in_progress: false,
  submission: { id: 'submission', status: 'graded', total_score: null, max_score: 10 },
}

describe('student assignment completion status', () => {
  it('still counts a finished complete-mode exam with scores hidden', () => {
    expect(isCompleted(assignment)).toBe(true)
  })
  it.each(['exam', 'exercise'])('requires mastery for threshold %s, independent of hidden scores', type => {
    const threshold = { ...assignment, type, passing_type: 'percent' as const, passing_value: 70 }
    expect(isCompleted({ ...threshold, completion_reached: false })).toBe(false)
    expect(isCompleted({ ...threshold, completion_reached: true })).toBe(true)
  })
  it('requires a finished passing streak rather than just a submitted run', () => {
    expect(isCompleted({ ...assignment, completion_rule: 'streak', completion_reached: false })).toBe(false)
    expect(isCompleted({ ...assignment, completion_rule: 'streak', completion_reached: true })).toBe(true)
  })
})
