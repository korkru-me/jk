import { describe, expect, it } from 'vitest'
import {
  assignmentCategorySelectItems,
  defaultAssignmentCategoryName,
  groupAssignmentsByCategory,
  isMissingAssignmentCategorySchema,
  normalizeAssignmentCategoryName,
  UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE,
  type AssignmentCategory,
} from './assignment-categories'

const categories: AssignmentCategory[] = [
  { id: 'later', classroom_id: 'room', name: 'บทที่ 2', color: 'blue', position: 2 },
  { id: 'first', classroom_id: 'room', name: 'บทที่ 1', color: 'purple', position: 1 },
]

describe('assignment categories', () => {
  it('normalizes teacher-entered names and rejects invalid ones', () => {
    expect(normalizeAssignmentCategoryName('  บทที่   1  ')).toBe('บทที่ 1')
    expect(normalizeAssignmentCategoryName('   ')).toBeNull()
    expect(normalizeAssignmentCategoryName('ก'.repeat(61))).toBeNull()
  })

  it('suggests the first unused numbered name', () => {
    expect(defaultAssignmentCategoryName(['หมวดที่ 1', 'หมวดที่ 3'])).toBe('หมวดที่ 2')
  })

  it('provides human-readable labels for category select values', () => {
    expect(assignmentCategorySelectItems(categories)).toEqual([
      { value: UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE, label: 'ยังไม่จัดหมวด' },
      { value: 'later', label: 'บทที่ 2' },
      { value: 'first', label: 'บทที่ 1' },
    ])
  })

  it('orders sections and keeps stale category assignments visible as ungrouped', () => {
    const sections = groupAssignmentsByCategory([
      { id: 'a', category_id: 'later' },
      { id: 'b', category_id: 'missing' },
      { id: 'c', category_id: 'first' },
      { id: 'd', category_id: null },
    ], categories)

    expect(sections.map(section => section.category?.id ?? null)).toEqual(['first', 'later', null])
    expect(sections.map(section => section.assignments.map(item => item.id))).toEqual([
      ['c'],
      ['a'],
      ['b', 'd'],
    ])
  })

  it('can retain empty categories for the teacher management view', () => {
    const sections = groupAssignmentsByCategory([], categories, true)
    expect(sections.map(section => section.category?.id ?? null)).toEqual(['first', 'later', null])
  })

  it('recognizes only missing-schema errors for the deployment fallback', () => {
    expect(isMissingAssignmentCategorySchema({ code: '42703' })).toBe(true)
    expect(isMissingAssignmentCategorySchema({ code: '42P01' })).toBe(true)
    expect(isMissingAssignmentCategorySchema({ code: 'PGRST204' })).toBe(true)
    expect(isMissingAssignmentCategorySchema({ code: 'PGRST205' })).toBe(true)
    expect(isMissingAssignmentCategorySchema({ code: '42501' })).toBe(false)
    expect(isMissingAssignmentCategorySchema(null)).toBe(false)
  })
})
