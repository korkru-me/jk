import { describe, expect, it } from 'vitest'
import { homeroomAssignmentScope } from './homeroom-assignment-scope'
import { summarizeClassroomProgress } from './classroom-progress'

const memberships = [
  { classroom_id: 'physics', student_id: 'a' },
  { classroom_id: 'physics', student_id: 'b' },
  { classroom_id: 'chemistry', student_id: 'b' },
  { classroom_id: 'chemistry', student_id: 'c' },
]
const groups = [{ classroom_id: 'physics', student_id: 'a', group_id: 'g1' }]
const physics = [{ classroom_id: 'physics', group_ids: null }]

describe('homeroom assignment reach', () => {
  it('excludes students outside the subject room even when they have an old attempt', () => {
    expect(homeroomAssignmentScope(physics, memberships, groups, new Set(['c'])))
      .toEqual({ classroomStudentIds: ['a', 'b'], assignedStudentIds: ['a', 'b'] })
  })
  it('unions every linked room without counting shared students twice', () => {
    const scope = homeroomAssignmentScope([...physics, { classroom_id: 'chemistry', group_ids: null }], memberships, groups, new Set())
    expect(scope.assignedStudentIds).toEqual(['a', 'b', 'c'])
  })
  it('distinguishes room members outside the assigned group', () => {
    expect(homeroomAssignmentScope([{ classroom_id: 'physics', group_ids: ['g1'] }], memberships, groups, new Set()))
      .toEqual({ classroomStudentIds: ['a', 'b'], assignedStudentIds: ['a'] })
  })
  it('retains attempts after group changes only for current room members', () => {
    const scope = homeroomAssignmentScope([{ classroom_id: 'physics', group_ids: [] }], memberships, groups, new Set(['b', 'c']))
    expect(scope.assignedStudentIds).toEqual(['b'])
  })
  it('does not use a similarly named group from another classroom', () => {
    const scope = homeroomAssignmentScope([{ classroom_id: 'chemistry', group_ids: ['g1'] }], memberships, groups, new Set())
    expect(scope.classroomStudentIds).toEqual(['b', 'c'])
    expect(scope.assignedStudentIds).toEqual([])
  })
  it('handles empty rosters and explicitly empty audiences', () => {
    expect(homeroomAssignmentScope(physics, [], [], new Set()).assignedStudentIds).toEqual([])
    expect(homeroomAssignmentScope([{ classroom_id: 'physics', group_ids: [] }], memberships, groups, new Set()).assignedStudentIds).toEqual([])
  })
  it('counts individual and whole-room denominators only for actual recipients', () => {
    const assignment = { id: 'work', end_at: '2020-01-01', passing_type: null, passing_value: null, score_strategy: 'best' as const }
    const scope = homeroomAssignmentScope(physics, memberships, groups, new Set())
    const summary = summarizeClassroomProgress(['a', 'b', 'c', 'outside'], [assignment], [], Date.now(), () => new Set(scope.assignedStudentIds))
    expect(summary.expectedTotal).toBe(2)
    expect(summary.byAssignment.get('work')!.missing).toBe(2)
    expect(summary.byStudent.get('a')!.total).toBe(1)
    expect(summary.byStudent.get('c')!.total).toBe(0)
    expect(summary.byStudent.get('outside')!.rate).toBe(100)
  })
})
