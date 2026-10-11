import { describe, expect, it } from 'vitest'
import { sortClassroomsByRecentViews } from './classroom-recency'

const classrooms = [
  { id: 'new', created_at: '2026-10-03T00:00:00.000Z' },
  { id: 'middle', created_at: '2026-10-02T00:00:00.000Z' },
  { id: 'old', created_at: '2026-10-01T00:00:00.000Z' },
]

describe('sortClassroomsByRecentViews', () => {
  it('puts the most recently opened classroom first', () => {
    const result = sortClassroomsByRecentViews(classrooms, [
      { classroom_id: 'old', viewed_at: '2026-10-11T02:00:00.000Z' },
      { classroom_id: 'middle', viewed_at: '2026-10-11T03:00:00.000Z' },
    ])

    expect(result.map(classroom => classroom.id)).toEqual(['middle', 'old', 'new'])
  })

  it('keeps never-opened classrooms behind viewed classrooms by creation date', () => {
    const result = sortClassroomsByRecentViews(classrooms, [
      { classroom_id: 'old', viewed_at: '2026-10-01T00:00:00.000Z' },
    ])

    expect(result.map(classroom => classroom.id)).toEqual(['old', 'new', 'middle'])
  })

  it('does not mutate the source order', () => {
    const source = [...classrooms]
    sortClassroomsByRecentViews(source, [
      { classroom_id: 'old', viewed_at: '2026-10-11T02:00:00.000Z' },
    ])

    expect(source.map(classroom => classroom.id)).toEqual(['new', 'middle', 'old'])
  })
})
