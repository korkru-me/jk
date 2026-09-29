import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { getAssignmentClassroomLinks } from './assignment-category-data.server'

type QueryResult = {
  data: Record<string, unknown>[] | null
  error: { code: string; message: string } | null
}

function adminWithLinkResults(...results: QueryResult[]) {
  const selects: string[] = []
  let call = 0
  const admin = {
    from(table: string) {
      expect(table).toBe('assignment_classrooms')
      return {
        select(columns: string) {
          selects.push(columns)
          return {
            eq: async () => results[call++],
          }
        },
      }
    },
  }
  return { admin, selects }
}

describe('assignment category schema rollout fallback', () => {
  it('uses categorized links when the schema is ready', async () => {
    const rows = [{ assignment_id: 'a', display_order: 1, group_ids: null, category_id: 'cat' }]
    const { admin, selects } = adminWithLinkResults({ data: rows, error: null })

    await expect(getAssignmentClassroomLinks(admin as never, 'room')).resolves.toEqual(rows)
    expect(selects).toHaveLength(1)
  })

  it('keeps existing links visible when category_id has not reached the database yet', async () => {
    const legacyRows = Array.from({ length: 12 }, (_, index) => ({
      assignment_id: `assignment-${index + 1}`,
      display_order: index,
      group_ids: null,
    }))
    const { admin, selects } = adminWithLinkResults(
      { data: null, error: { code: '42703', message: 'category_id does not exist' } },
      { data: legacyRows, error: null },
    )

    const result = await getAssignmentClassroomLinks(admin as never, 'room')
    expect(result).toHaveLength(12)
    expect(result.every(row => row.category_id === null)).toBe(true)
    expect(selects[1]).not.toContain('category_id')
  })

  it('does not hide permission or connectivity failures behind an empty list', async () => {
    const error = { code: '42501', message: 'permission denied' }
    const { admin, selects } = adminWithLinkResults({ data: null, error })

    await expect(getAssignmentClassroomLinks(admin as never, 'room')).rejects.toEqual(error)
    expect(selects).toHaveLength(1)
  })
})
