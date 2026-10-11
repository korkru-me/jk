export type ClassroomRecentView = {
  classroom_id: string
  viewed_at: string
}

/**
 * Puts classrooms the user has opened first, newest visit first. Classrooms
 * that have never been opened keep the previous dashboard fallback: newest
 * creation first.
 */
export function sortClassroomsByRecentViews<T extends { id: string; created_at: string }>(
  classrooms: readonly T[],
  recentViews: readonly ClassroomRecentView[],
): T[] {
  const viewedAtByClassroom = new Map(
    recentViews.map(view => [view.classroom_id, Date.parse(view.viewed_at)]),
  )

  return [...classrooms].sort((a, b) => {
    const aViewedAt = viewedAtByClassroom.get(a.id)
    const bViewedAt = viewedAtByClassroom.get(b.id)

    if (aViewedAt !== undefined && bViewedAt !== undefined) {
      const viewedDiff = bViewedAt - aViewedAt
      if (viewedDiff !== 0) return viewedDiff
    } else if (aViewedAt !== undefined) {
      return -1
    } else if (bViewedAt !== undefined) {
      return 1
    }

    return Date.parse(b.created_at) - Date.parse(a.created_at)
  })
}
