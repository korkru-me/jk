import { describe, expect, it } from 'vitest'
import { studentAssignmentCardState } from '@/app/(app)/classrooms/[id]/_components/student-assignment-card-state'
import type { StudentAssignmentRow } from '@/app/(app)/classrooms/[id]/_components/assignment-status'

const now = Date.parse('2026-10-14T10:00:00+07:00')
const BASE: StudentAssignmentRow = {
  id: 'work', title: 'งานจำลอง', question_ids: [], random_question_count: null, completion_rule: 'fixed',
  end_at: '2026-10-15T10:00:00+07:00', duration_minutes: null, type: 'exam', max_attempts: 1,
  retry_scope: 'all', passing_type: null, passing_value: null, show_results: 'immediate',
  attempts_used: 0, has_in_progress: false, submission: null,
}
const FINISHED = { id: 'submission', status: 'graded', total_score: 8, max_score: 10 }

describe('whole student assignment card navigation', () => {
  it('opens the existing waiting/take route for an unstarted assignment', () => {
    expect(studentAssignmentCardState(BASE, now).href).toBe('/assignments/work/take')
  })
  it('resumes an unfinished retry even when an older official attempt is finished', () => {
    const state = studentAssignmentCardState({ ...BASE, has_in_progress: true, submission: FINISHED, attempts_used: 2 }, now)
    expect(state.href).toBe('/assignments/work/take')
    expect(state.actionLabel).toBe('ทำต่อ')
    expect(state.canRetry).toBe(false)
  })
  it('routes exhausted attempts to results and routes available wrong-only retries to take', () => {
    expect(studentAssignmentCardState({ ...BASE, submission: FINISHED, attempts_used: 1 }, now).href).toBe('/submissions/submission')
    const retry = studentAssignmentCardState({ ...BASE, type: 'exercise', max_attempts: 3, attempts_used: 1, retry_scope: 'wrong_only', submission: FINISHED }, now)
    expect(retry.href).toBe('/assignments/work/take')
    expect(retry.actionLabel).toBe('แก้ข้อที่ยังไม่เต็ม')
    expect(retry.remaining).toBe(2)
  })
  it.each(['never', 'after_due'] as const)('keeps %s scores and pass/fail wording hidden', show_results => {
    const state = studentAssignmentCardState({ ...BASE, show_results, passing_type: 'percent', passing_value: 70, submission: { ...FINISHED, total_score: 2 }, completion_reached: false, attempts_used: 1 }, now)
    expect(state.canShowScore).toBe(false)
    expect(state.score).toBeNull()
    expect(state.statusLabel).toBe('ส่งแล้ว')
    expect(state.statusVariant).toBe('statusSuccess')
  })
  it('releases after-due scores only after the deadline', () => {
    const state = studentAssignmentCardState({ ...BASE, show_results: 'after_due', end_at: '2026-10-13T10:00:00+07:00', submission: FINISHED, attempts_used: 1 }, now)
    expect(state.score).toEqual({ total: 8, max: 10 })
    expect(state.actionLabel).toBe('ดูผลและเฉลย')
  })
  it('keeps a mastered streak complete despite a lower representative score', () => {
    const state = studentAssignmentCardState({ ...BASE, type: 'exercise', completion_rule: 'streak', streak_target: 5, completion_reached: true, submission: FINISHED, attempts_used: 1 }, now)
    expect(state.canRetry).toBe(false)
    expect(state.href).toBe('/submissions/submission')
    expect(state.statusLabel).toBe('ผ่านเงื่อนไขแล้ว')
  })
})
