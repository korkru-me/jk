export const RECENT_WORK_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export interface RecentClassroomWorkItem {
  id: string
  title: string
  type: 'exercise' | 'exam' | 'practice'
  status: 'draft' | 'published'
  createdAt: string
}

export interface RecentClassroomWorkResult {
  items: RecentClassroomWorkItem[]
  asOf: string
  error: string | null
}

export type RecentWorkRow = {
  id: string
  title: string
  type: string
  status: string
  created_at: string
  created_by: string
}

/** Creation time is fixed: editing settings never renews the three-day window. */
export function visibleRecentClassroomWork(items: RecentClassroomWorkItem[], now: number): RecentClassroomWorkItem[] {
  return items.filter(item => {
    const createdAt = Date.parse(item.createdAt)
    return Number.isFinite(createdAt) && createdAt <= now && now - createdAt < RECENT_WORK_WINDOW_MS
  }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
}

/** Author-only metadata. Never pass raw database rows to the client. */
export function recentClassroomWorkItems(rows: RecentWorkRow[], actorId: string, now: number): RecentClassroomWorkItem[] {
  const items = rows.flatMap(row => {
    if (row.created_by !== actorId || (row.status !== 'draft' && row.status !== 'published')) return []
    if (row.type !== 'exercise' && row.type !== 'exam' && row.type !== 'practice') return []
    return [{ id: row.id, title: row.title, type: row.type, status: row.status, createdAt: row.created_at } satisfies RecentClassroomWorkItem]
  })
  return visibleRecentClassroomWork(items, now)
}
