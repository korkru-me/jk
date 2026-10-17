import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchRowsInChunks } from '@/lib/supabase/fetch-all-rows'
import { RECENT_WORK_WINDOW_MS, recentClassroomWorkItems, type RecentClassroomWorkResult, type RecentWorkRow } from './classroom-recent-work'

type SessionClient = Awaited<ReturnType<typeof createClient>>
type LibraryRow = Omit<RecentWorkRow, 'type'>

/** Called only after teacher relationship authorization, with this room's linked IDs. */
export async function loadClassroomRecentWork(
  supabase: SessionClient,
  classroomId: string,
  actorId: string,
  linkedAssignmentIds: string[],
  practiceEnabled: boolean,
): Promise<RecentClassroomWorkResult> {
  const now = Date.now()
  const asOf = new Date(now).toISOString()
  const cutoff = new Date(now - RECENT_WORK_WINDOW_MS).toISOString()
  const [assignments, libraries] = await Promise.all([
    fetchRowsInChunks<RecentWorkRow, string>(Array.from(new Set(linkedAssignmentIds)), chunk => supabase
      .from('assignments')
      .select('id, title, type, status, created_at, created_by')
      .in('id', chunk)
      .eq('created_by', actorId)
      .in('status', ['draft', 'published'])
      .gte('created_at', cutoff)),
    practiceEnabled
      ? fetchAllRows<LibraryRow>((from, to) => supabase
          .from('practice_libraries')
          .select('id, title, status, created_at, created_by')
          .eq('classroom_id', classroomId)
          .eq('created_by', actorId)
          .in('status', ['draft', 'published'])
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .order('id').range(from, to))
      : Promise.resolve({ rows: [] as LibraryRow[], error: null }),
  ])
  if (assignments.error || libraries.error) return { items: [], asOf, error: 'โหลดงานที่เพิ่งสร้างไม่สำเร็จ กรุณาลองโหลดหน้าใหม่' }
  return {
    items: recentClassroomWorkItems([
      ...assignments.rows,
      ...libraries.rows.map(row => ({ ...row, type: 'practice' })),
    ], actorId, now),
    asOf,
    error: null,
  }
}
