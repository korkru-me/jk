import type { ProctorEventRow, ProctorSessionRow } from './exam-proctor-realtime'
import type { createClient } from './supabase/client'

export const PROCTOR_HISTORY_PAGE_SIZE = 100

/** The history may outlive many exam rounds; do not silently stop at the API row cap. */
export async function loadProctorSessions(client: ReturnType<typeof createClient>, assignmentId: string) {
  const rows: ProctorSessionRow[] = []
  const batchSize = 500
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await client.from('exam_proctor_sessions').select('*')
      .eq('assignment_id', assignmentId)
      .order('submission_id', { ascending: true })
      .range(offset, offset + batchSize - 1)
    if (error || !data) return { data: null, error: error ?? new Error('Cannot load proctor sessions') }
    rows.push(...data as ProctorSessionRow[])
    if (data.length < batchSize) return { data: rows, error: null }
  }
}
export interface ProctorHistoryPage {
  events: ProctorEventRow[]
  nextBefore: number | null
}

/** Read one bounded page through the current session's ordinary event RLS. */
export async function loadProctorHistoryPage(
  client: ReturnType<typeof createClient>,
  assignmentId: string,
  before: number | null,
): Promise<ProctorHistoryPage> {
  if (before !== null && (!Number.isSafeInteger(before) || before < 1)) {
    throw new Error('Invalid event cursor')
  }
  let query = client.from('exam_proctor_events')
    .select('id, org_id, assignment_id, submission_id, student_id, event_type, occurred_at_client, created_at, acknowledged_at, acknowledged_by')
    .eq('assignment_id', assignmentId)
    .order('id', { ascending: false })
    .limit(PROCTOR_HISTORY_PAGE_SIZE + 1)
  if (before !== null) query = query.lt('id', before)
  const { data, error } = await query
  if (error || !data) throw new Error('Cannot load proctor history')
  const events = data.slice(0, PROCTOR_HISTORY_PAGE_SIZE) as ProctorEventRow[]
  return {
    events,
    nextBefore: data.length > PROCTOR_HISTORY_PAGE_SIZE ? events.at(-1)!.id : null,
  }
}
