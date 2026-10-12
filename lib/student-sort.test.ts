import { describe, expect, it } from 'vitest'
import {
  nextStudentSortRules,
  sortStudentsByRules,
  type SortableStudentProfile,
  type StudentSortRule,
} from './student-sort'

const students = [
  { id: 'm4-24', full_name: 'คนเลขที่ยี่สิบสี่' },
  { id: 'm3-3', full_name: 'คนชั้นสาม' },
  { id: 'm4-1', full_name: 'คนเลขที่หนึ่ง' },
  { id: 'm4-20', full_name: 'คนเลขที่ยี่สิบ' },
  { id: 'missing', full_name: 'คนข้อมูลไม่ครบ' },
]

const profiles: Record<string, SortableStudentProfile> = {
  'm4-24': { grade_level: 'ม.4', class_number: 24 },
  'm3-3': { grade_level: 'ม.3', class_number: 3 },
  'm4-1': { grade_level: 'ม.4', class_number: 1 },
  'm4-20': { grade_level: 'ม.4', class_number: 20 },
  missing: { grade_level: null, class_number: null },
}

describe('nextStudentSortRules', () => {
  it('makes the latest column primary and retains previous columns as tie-breakers', () => {
    const byNumber = nextStudentSortRules([{ key: 'name', dir: 'asc' }], 'number')
    expect(byNumber).toEqual([
      { key: 'number', dir: 'asc' },
      { key: 'name', dir: 'asc' },
    ])

    expect(nextStudentSortRules(byNumber, 'grade')).toEqual([
      { key: 'grade', dir: 'asc' },
      { key: 'number', dir: 'asc' },
      { key: 'name', dir: 'asc' },
    ])
  })

  it('toggles the current primary and preserves an older rule direction when promoted', () => {
    const rules: StudentSortRule[] = [
      { key: 'grade', dir: 'asc' },
      { key: 'number', dir: 'desc' },
      { key: 'name', dir: 'asc' },
    ]

    expect(nextStudentSortRules(rules, 'grade')[0]).toEqual({ key: 'grade', dir: 'desc' })
    expect(nextStudentSortRules(rules, 'number')).toEqual([
      { key: 'number', dir: 'desc' },
      { key: 'grade', dir: 'asc' },
      { key: 'name', dir: 'asc' },
    ])
  })
})

describe('sortStudentsByRules', () => {
  it('sorts by the latest rule first and uses earlier rules inside each group', () => {
    const sorted = sortStudentsByRules(students, profiles, [
      { key: 'grade', dir: 'asc' },
      { key: 'number', dir: 'asc' },
    ])

    expect(sorted.map(student => student.id)).toEqual([
      'm3-3',
      'm4-1',
      'm4-20',
      'm4-24',
      'missing',
    ])
  })

  it('keeps missing values last even when a rule is descending', () => {
    const sorted = sortStudentsByRules(students, profiles, [
      { key: 'number', dir: 'desc' },
    ])

    expect(sorted.map(student => student.id)).toEqual([
      'm4-24',
      'm4-20',
      'm3-3',
      'm4-1',
      'missing',
    ])
  })
})
