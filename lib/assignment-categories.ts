import {
  GROUP_COLOR_IDS,
  nextGroupColor,
  type GroupColorId,
} from '@/lib/classroom-groups'

export { GROUP_COLOR_IDS as ASSIGNMENT_CATEGORY_COLOR_IDS }
export type AssignmentCategoryColor = GroupColorId

export const ASSIGNMENT_CATEGORY_NAME_MAX = 60
export const MAX_ASSIGNMENT_CATEGORIES_PER_CLASSROOM = 30
export const UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE = '__uncategorized__'

export interface AssignmentCategory {
  id: string
  classroom_id: string
  name: string
  color: AssignmentCategoryColor
  position: number
}

export function assignmentCategorySelectItems(categories: AssignmentCategory[]) {
  return [
    { value: UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE, label: 'ยังไม่จัดกลุ่ม' },
    ...categories.map(category => ({ value: category.id, label: category.name })),
  ]
}

/** Unknown/deleted category ids are presented as ungrouped, never as raw UUIDs. */
export function normalizeAssignmentCategoryId(
  categoryId: string | null | undefined,
  categories: AssignmentCategory[],
): string | null {
  if (!categoryId) return null
  return categories.some(category => category.id === categoryId) ? categoryId : null
}

/**
 * Postgres/PostgREST codes returned while a newly deployed category schema is
 * still absent from the runtime database or schema cache.
 */
export function isMissingAssignmentCategorySchema(error: { code?: string } | null): boolean {
  return error?.code === '42703'
    || error?.code === '42P01'
    || error?.code === 'PGRST204'
    || error?.code === 'PGRST205'
}

export function normalizeAssignmentCategoryName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name.length === 0 || name.length > ASSIGNMENT_CATEGORY_NAME_MAX) return null
  return name
}

export function isAssignmentCategoryColor(value: unknown): value is AssignmentCategoryColor {
  return typeof value === 'string' && (GROUP_COLOR_IDS as readonly string[]).includes(value)
}

export function nextAssignmentCategoryColor(existingColors: string[]): AssignmentCategoryColor {
  return nextGroupColor(existingColors)
}

export function defaultAssignmentCategoryName(existingNames: string[]): string {
  const taken = new Set(existingNames.map(name => name.trim()))
  for (let number = 1; ; number++) {
    const candidate = `กลุ่มที่ ${number}`
    if (!taken.has(candidate)) return candidate
  }
}

export interface AssignmentCategorySection<T> {
  category: AssignmentCategory | null
  assignments: T[]
}

/**
 * Categories keep their teacher-defined position. Unknown/stale category ids
 * fail open into "ยังไม่จัดกลุ่ม" so an assignment never disappears merely
 * because category data was deleted between the page queries.
 */
export function groupAssignmentsByCategory<T extends { category_id?: string | null }>(
  assignments: T[],
  categories: AssignmentCategory[],
  includeEmptyCategories = false,
): AssignmentCategorySection<T>[] {
  const sortedCategories = [...categories].sort((a, b) =>
    a.position - b.position || a.name.localeCompare(b.name, 'th'),
  )
  const known = new Set(sortedCategories.map(category => category.id))
  const byCategory = new Map<string, T[]>()
  const ungrouped: T[] = []

  for (const assignment of assignments) {
    if (!assignment.category_id || !known.has(assignment.category_id)) {
      ungrouped.push(assignment)
      continue
    }
    const rows = byCategory.get(assignment.category_id) ?? []
    rows.push(assignment)
    byCategory.set(assignment.category_id, rows)
  }

  const sections: AssignmentCategorySection<T>[] = sortedCategories
    .map(category => ({ category, assignments: byCategory.get(category.id) ?? [] }))
    .filter(section => includeEmptyCategories || section.assignments.length > 0)

  if (ungrouped.length > 0 || (includeEmptyCategories && categories.length > 0)) {
    sections.push({ category: null, assignments: ungrouped })
  }
  return sections
}
