import { describe, expect, it } from 'vitest'
import { buildStudentLearningData, type LearningAssignment, type LearningSubmission } from '@/app/(app)/dashboard/_components/student-learning-data'
import type { StudentClassroom } from '@/app/(app)/classrooms/_components/student-view'

const now = Date.parse('2026-10-14T10:00:00+07:00')
const classrooms: StudentClassroom[] = [
  { id: 'blue', name: 'ห้องสีน้ำเงิน', description: 'สีปก: blue', status: 'active', classroom_type: 'subject' },
  { id: 'green', name: 'ห้องสีเขียว', description: 'สีปก: green', status: 'active', classroom_type: 'subject' },
]
function assignment(overrides: Partial<LearningAssignment> = {}): LearningAssignment {
  return {
    id: 'work', classroom_id: 'blue', title: 'งาน', type: 'exercise',
    end_at: '2026-10-15T10:00:00+07:00', duration_minutes: null,
    passing_type: 'percent', passing_value: 60, score_strategy: 'best', display_max_score: null, show_results: 'immediate',
    assignment_classrooms: [{ classroom_id: 'blue', group_ids: null }], ...overrides,
  }
}
function attempt(a: LearningAssignment, score: number, number = 1): LearningSubmission {
  return { id: `submission-${number}`, assignment_id: a.id, assignments: { ...a, classrooms: { name: 'ห้องสีน้ำเงิน' } },
    total_score: score, max_score: 10, score_adjustment: 0, status: 'graded', attempt_number: number, created_at: `2026-10-${10 + number}T10:00:00+07:00` }
}
function build(assignments: LearningAssignment[], submissions: LearningSubmission[] = [], groupOf?: Map<string, string>) {
  return buildStudentLearningData({ classrooms, assignments, submissions, groupOf, now })
}

describe('combined student learning data', () => {
  it.each(['best', 'latest', 'average'] as const)('uses the official %s attempt consistently in every section', strategy => {
    const a = assignment({ score_strategy: strategy })
    const data = build([a], [attempt(a, 9), attempt(a, 2, 2)])
    const done = strategy === 'best'
    expect(data.doneCount).toBe(done ? 1 : 0)
    expect(data.pendingWork).toHaveLength(done ? 0 : 1)
    expect(data.pendingCountMap.blue ?? 0).toBe(done ? 0 : 1)
    expect(data.calendarEvents[0].done).toBe(done)
    if (!done) expect(data.pendingWork[0].previousScore?.total).toBe(strategy === 'latest' ? 2 : 5.5)
  })
  it('rescales display points and teacher adjustments before deciding completion', () => {
    const a = assignment({ display_max_score: 20, passing_type: 'score', passing_value: 12 })
    const s = { ...attempt(a, 5), score_adjustment: 2 }
    const data = build([a], [s])
    expect(data.doneCount).toBe(1)
    expect(data.history[0].score).toEqual({ total: 12, max: 20 })
  })
  it('keeps hidden scores out of the rendered data and labels gated results correctly', () => {
    for (const show_results of ['never', 'after_due'] as const) {
      const a = assignment({ show_results })
      const data = build([a], [attempt(a, 2)])
      expect(data.pendingWork[0].previousScore).toBeNull()
      expect(data.pendingWork[0].hasPreviousAttempt).toBe(true)
      expect(data.history[0].score).toBeNull()
      expect(data.history[0].reviewLabel).toBe('ดูสถานะ')
    }
    const a = assignment({ show_results: 'after_due', end_at: '2026-10-13T10:00:00+07:00' })
    expect(build([a], [attempt(a, 2)]).history[0].reviewLabel).toBe('ดูเฉลย')
  })
  it('filters other groups and unenrolled links but preserves an existing attempt after a group change', () => {
    const a = assignment({ assignment_classrooms: [{ classroom_id: 'blue', group_ids: ['other-group'] }] })
    const outside = assignment({ id: 'outside', assignment_classrooms: [{ classroom_id: 'outside-room', group_ids: null }] })
    expect(build([a, outside], [], new Map([['blue', 'own-group']])).pendingWork).toHaveLength(0)
    const data = build([a, outside], [{ ...attempt(a, 0), status: 'in_progress' }])
    expect(data.pendingWork.map(w => w.id)).toEqual(['work'])
    expect(data.pendingWork[0].inProgress).toBe(true)
    expect(data.pendingWork[0].classroom?.id).toBe('blue')
  })
  it('counts a shared assignment once, attributes its theme to a reachable enrolled room and tallies each room', () => {
    const a = assignment({ classroom_id: 'outside-room', assignment_classrooms: classrooms.map(c => ({ classroom_id: c.id, group_ids: null })) })
    const data = build([a, a])
    expect(data.pendingWork).toHaveLength(1)
    expect(data.pendingCountMap).toEqual({ blue: 1, green: 1 })
    expect(data.pendingWork[0].classroom).toEqual(classrooms[0])
    expect(data.pendingWork[0].otherClassroomNames).toEqual(['ห้องสีเขียว'])
  })
  it('keeps every pending assignment, sorts dated work before undated work and handles an empty account', () => {
    const rows = Array.from({ length: 16 }, (_, i) => assignment({ id: String(i), end_at: i === 0 ? null : '2026-10-15T10:00:00+07:00' }))
    const data = build(rows)
    expect(data.pendingWork).toHaveLength(16)
    expect(data.pendingWork.at(-1)?.id).toBe('0')
    expect(data.urgentCount).toBe(15)
    expect(buildStudentLearningData({ classrooms: [], assignments: [], submissions: [], now })).toEqual({
      classrooms: [], pendingCountMap: {}, pendingWork: [], urgentCount: 0, doneCount: 0, calendarEvents: [], history: [],
    })
  })
})
