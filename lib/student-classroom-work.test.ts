import { describe, expect, it } from 'vitest'
import { classroomCalendarEvents, orderStudentClassroomWork } from './student-classroom-work'
import type { StudentAssignmentRow } from '@/app/(app)/classrooms/[id]/_components/assignment-status'
import type { AssignmentCategory } from './assignment-categories'

const categories: AssignmentCategory[] = ['finished', 'mixed', 'pending'].map((id, position) => ({ id, position, name: id, color: 'purple', classroom_id: 'room' }))
const base: StudentAssignmentRow = { id: 'base', title: 'งาน', question_ids: [], random_question_count: null, completion_rule: 'fixed', end_at: '2026-10-13T00:00:00Z', duration_minutes: null, type: 'exam', max_attempts: 1, retry_scope: 'all', passing_type: null, passing_value: null, show_results: 'never', attempts_used: 0, has_in_progress: false, submission: null }
const row = (id: string, group: string | null, done = false): StudentAssignmentRow => ({ ...base, id, category_id: group, submission: done ? { id: `sub-${id}`, status: 'submitted', total_score: null, max_score: 10 } : null })
const all = [row('done-only', 'finished', true), row('mixed-done', 'mixed', true), row('mixed-first', 'mixed'), row('mixed-second', 'mixed'), row('pending-only', 'pending')]
describe('student classroom work ordering and calendar projection', () => {
  it('moves completed work and fully completed groups last while preserving pending order', () => {
    const sections = orderStudentClassroomWork(all, all, categories)
    expect(sections.map(s => s.category?.id)).toEqual(['mixed', 'pending', 'finished'])
    expect(sections[0].assignments.map(a => a.id)).toEqual(['mixed-first', 'mixed-second', 'mixed-done'])
    expect(all.map(a => a.id)).toEqual(['done-only', 'mixed-done', 'mixed-first', 'mixed-second', 'pending-only'])
  })
  it('checks whole-group completion before type/status filters', () => {
    const visible = [all[0], all[1], all[4]]
    expect(orderStudentClassroomWork(visible, all, categories).map(s => s.category?.id)).toEqual(['mixed', 'pending', 'finished'])
  })
  it('keeps unknown categories visible and handles empty work', () => {
    expect(orderStudentClassroomWork([row('unknown', 'deleted')], [row('unknown', 'deleted')], categories)[0].assignments[0].id).toBe('unknown')
    expect(orderStudentClassroomWork([], [], categories)).toEqual([])
  })
  it('shows only the supplied classroom work and omits undated/invalid dates', () => {
    const events = classroomCalendarEvents([all[0], { ...base, id: 'no-date', end_at: null }, { ...base, id: 'invalid-date', end_at: 'invalid' }], 'ห้องวิชานี้')
    expect(events).toEqual([{ id: 'done-only', title: 'งาน', classroomName: 'ห้องวิชานี้', endAt: base.end_at, done: true, submissionId: 'sub-done-only' }])
  })
  it('uses the existing mastery completion gate rather than submitted status alone', () => {
    const failed = { ...row('mastery', 'mixed', true), passing_type: 'percent' as const, passing_value: 70, completion_reached: false }
    expect(classroomCalendarEvents([failed], 'วิชา')[0].done).toBe(false)
    expect(classroomCalendarEvents([{ ...failed, completion_reached: true }], 'วิชา')[0].done).toBe(true)
  })
})
