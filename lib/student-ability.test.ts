import { describe, it, expect } from 'vitest'
import {
  assignmentAverages,
  buildStudentAbilities,
  compareAssignmentsForDisplay,
  differenceFromClass,
  formatPercent,
  matchesStudentQuery,
  sortByAbility,
  type AbilityAssignment,
  type AbilitySubmission,
} from './student-ability'

function assignment(over: Partial<AbilityAssignment> & { id: string }): AbilityAssignment {
  return { created_at: '2026-09-01T00:00:00Z', display_order: null, score_strategy: 'best', ...over }
}

let nextId = 0
function submission(over: Partial<AbilitySubmission> & { assignment_id: string; student_id: string }): AbilitySubmission {
  nextId += 1
  return { id: `sub-${nextId}`, status: 'submitted', total_score: 10, max_score: 10, attempt_number: 1, ...over }
}

describe('buildStudentAbilities', () => {
  const a1 = assignment({ id: 'a1' })
  const a2 = assignment({ id: 'a2' })

  it('turns each official score into a share of full marks', () => {
    const abilities = buildStudentAbilities(['s1'], [a1, a2], [
      submission({ assignment_id: 'a1', student_id: 's1', total_score: 15, max_score: 20 }),
      submission({ assignment_id: 'a2', student_id: 's1', total_score: 4, max_score: 5 }),
    ])
    const s1 = abilities.get('s1')!
    expect(s1.cells.map(c => c.percent)).toEqual([75, 80])
    expect(s1.average).toBeCloseTo(77.5)
    expect(s1.submittedCount).toBe(2)
  })

  it('reports work not handed in as missing and leaves it out of the average', () => {
    const abilities = buildStudentAbilities(['s1'], [a1, a2], [
      submission({ assignment_id: 'a1', student_id: 's1', total_score: 6, max_score: 10 }),
    ])
    const s1 = abilities.get('s1')!
    expect(s1.cells[1]).toMatchObject({ state: 'missing', percent: null, submissionId: null })
    expect(s1.average).toBe(60)
    expect(s1.submittedCount).toBe(1)
  })

  it('keeps an unfinished attempt apart from missing work', () => {
    const abilities = buildStudentAbilities(['s1'], [a1], [
      submission({ assignment_id: 'a1', student_id: 's1', status: 'in_progress', total_score: null }),
    ])
    expect(abilities.get('s1')!.cells[0]).toMatchObject({ state: 'in_progress', percent: null })
    expect(abilities.get('s1')!.average).toBeNull()
  })

  it('uses the attempt the งาน counts, not every attempt', () => {
    const latest = assignment({ id: 'a1', score_strategy: 'latest' })
    const rows = [
      submission({ assignment_id: 'a1', student_id: 's1', total_score: 9, attempt_number: 1 }),
      submission({ assignment_id: 'a1', student_id: 's1', total_score: 4, attempt_number: 2 }),
    ]
    expect(buildStudentAbilities(['s1'], [latest], rows).get('s1')!.cells[0].percent).toBe(40)
    expect(buildStudentAbilities(['s1'], [a1], rows).get('s1')!.cells[0].percent).toBe(90)
  })

  it('has no percentage for a งาน with zero full marks, but still counts it as handed in', () => {
    const abilities = buildStudentAbilities(['s1'], [a1], [
      submission({ assignment_id: 'a1', student_id: 's1', total_score: 0, max_score: 0 }),
    ])
    expect(abilities.get('s1')!.cells[0]).toMatchObject({ state: 'done', percent: null })
    expect(abilities.get('s1')!.submittedCount).toBe(1)
    expect(abilities.get('s1')!.average).toBeNull()
  })

  it('links the cell to the official attempt', () => {
    const row = submission({ assignment_id: 'a1', student_id: 's1' })
    expect(buildStudentAbilities(['s1'], [a1], [row]).get('s1')!.cells[0].submissionId).toBe(row.id)
  })

  it('gives every roster student a profile, even with no rows at all', () => {
    const abilities = buildStudentAbilities(['s1', 's2'], [a1], [])
    expect(abilities.get('s2')).toMatchObject({ average: null, submittedCount: 0 })
    expect(abilities.get('s2')!.cells).toHaveLength(1)
  })
})

describe('assignmentAverages and differenceFromClass', () => {
  const a1 = assignment({ id: 'a1' })
  const a2 = assignment({ id: 'a2' })
  const abilities = buildStudentAbilities(['s1', 's2', 's3'], [a1, a2], [
    submission({ assignment_id: 'a1', student_id: 's1', total_score: 10 }),
    submission({ assignment_id: 'a1', student_id: 's2', total_score: 6 }),
    submission({ assignment_id: 'a2', student_id: 's2', total_score: 2 }),
  ])
  const averages = assignmentAverages(abilities.values(), ['a1', 'a2'])

  it('averages only the students who handed each งาน in', () => {
    expect(averages.get('a1')).toEqual({ average: 80, submittedCount: 2 })
    expect(averages.get('a2')).toEqual({ average: 20, submittedCount: 1 })
  })

  it('compares a student with the class on the งาน they did, not on all of them', () => {
    // s1 did only a1 (100%) whose class mean is 80 — ahead by 20, even though
    // the mean across both งาน would be 50.
    expect(differenceFromClass(abilities.get('s1')!, averages)).toBeCloseTo(20)
    expect(differenceFromClass(abilities.get('s3')!, averages)).toBeNull()
  })
})

describe('sortByAbility', () => {
  const students = [
    { id: 's1', full_name: 'ข' },
    { id: 's2', full_name: 'ก' },
    { id: 's3', full_name: 'ค' },
  ]
  const a1 = assignment({ id: 'a1' })
  const abilities = buildStudentAbilities(['s1', 's2', 's3'], [a1], [
    submission({ assignment_id: 'a1', student_id: 's1', total_score: 5 }),
    submission({ assignment_id: 'a1', student_id: 's2', total_score: 9 }),
  ])

  it('ranks by average and keeps students with no score last both ways', () => {
    expect(sortByAbility(students, {}, abilities, 'score', 'desc').map(s => s.id)).toEqual(['s2', 's1', 's3'])
    expect(sortByAbility(students, {}, abilities, 'score', 'asc').map(s => s.id)).toEqual(['s1', 's2', 's3'])
  })

  it('falls back to the shared roster order for the other keys', () => {
    const profiles = { s1: { class_number: 2 }, s2: { class_number: 3 }, s3: { class_number: 1 } }
    expect(sortByAbility(students, profiles, abilities, 'number', 'asc').map(s => s.id)).toEqual(['s3', 's1', 's2'])
    expect(sortByAbility(students, {}, abilities, 'name', 'asc').map(s => s.id)).toEqual(['s2', 's1', 's3'])
  })
})

describe('matchesStudentQuery', () => {
  const student = { full_name: 'ธนภัทร  สุขใส' }
  const profile = { student_code: 'ST-6501', class_number: 12 }

  it('matches part of a name regardless of spacing', () => {
    expect(matchesStudentQuery(student, profile, 'ธนภัทร สุข')).toBe(true)
    expect(matchesStudentQuery(student, profile, 'สมชาย')).toBe(false)
  })

  it('matches รหัสนักเรียน case-insensitively and เลขที่ exactly', () => {
    expect(matchesStudentQuery(student, profile, 'st-65')).toBe(true)
    expect(matchesStudentQuery(student, profile, '12')).toBe(true)
    expect(matchesStudentQuery(student, profile, '3')).toBe(false)
  })

  it('lets an empty query through', () => {
    expect(matchesStudentQuery(student, undefined, '   ')).toBe(true)
  })
})

describe('compareAssignmentsForDisplay', () => {
  it('puts a teacher-set order first, then the oldest งาน', () => {
    const rows = [
      assignment({ id: 'new', created_at: '2026-09-03T00:00:00Z' }),
      assignment({ id: 'old', created_at: '2026-09-01T00:00:00Z' }),
      assignment({ id: 'pinned', created_at: '2026-09-05T00:00:00Z', display_order: 1 }),
    ]
    expect(rows.sort(compareAssignmentsForDisplay).map(a => a.id)).toEqual(['pinned', 'old', 'new'])
  })
})

describe('formatPercent', () => {
  it('rounds to a whole percent and shows a dash for no value', () => {
    expect(formatPercent(72.5)).toBe('73%')
    expect(formatPercent(null)).toBe('–')
  })
})
