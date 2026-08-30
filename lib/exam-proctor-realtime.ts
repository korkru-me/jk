export interface ProctorSessionRow {
  submission_id: string
  org_id: string
  assignment_id: string
  student_id: string
  started_monitoring_at: string
  last_seen_at: string
  is_online: boolean
  is_tab_visible: boolean
  is_fullscreen: boolean
  completed_at: string | null
  tab_switch_count: number
  fullscreen_exit_count: number
  window_blur_count: number
  clipboard_attempt_count: number
  screenshot_key_count: number
  active_connection_count: number
  concurrent_connection_count: number
  secure_browser_verified_at: string | null
  secure_browser_platform: 'windows' | 'macos' | 'ios' | null
  secure_browser_version: string | null
  exam_access_mode: 'browser' | 'seb' | 'android_monitored'
  android_approved_at: string | null
  android_approved_by: string | null
  last_event_type: string | null
  last_event_at: string | null
  created_at: string
  updated_at: string
}

export interface ProctorEventRow {
  id: number
  org_id: string
  assignment_id: string
  submission_id: string
  student_id: string
  event_type: string
  occurred_at_client: string | null
  created_at: string
}

export type ProctorSessionChange =
  | { type: 'upsert'; row: ProctorSessionRow }
  | { type: 'delete'; submissionId: string }

export type ProctorEventChange =
  | { type: 'upsert'; row: ProctorEventRow }
  | { type: 'delete'; eventId: number }

export type ProctorDashboardConnectionMode = 'connecting' | 'live' | 'fallback'

export const PROCTOR_FALLBACK_POLL_MS = 15_000
export const PROCTOR_LIVE_RECONCILE_MS = 60_000

const PROCTOR_SIGNAL_RETRY_DELAYS_MS = [1_000, 3_000, 10_000, 30_000] as const

function time(value: string): number {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Apply Realtime changes that arrived while a snapshot query was in flight.
 * This prevents a slower snapshot response from rolling the dashboard back.
 */
export function applyProctorSessionChanges(
  snapshot: ProctorSessionRow[],
  changes: ProctorSessionChange[],
): ProctorSessionRow[] {
  const bySubmission = new Map(snapshot.map(row => [row.submission_id, row]))
  for (const change of changes) {
    if (change.type === 'delete') bySubmission.delete(change.submissionId)
    else bySubmission.set(change.row.submission_id, change.row)
  }
  return [...bySubmission.values()].sort((a, b) => time(b.last_seen_at) - time(a.last_seen_at))
}

export function applyProctorEventChanges(
  snapshot: ProctorEventRow[],
  changes: ProctorEventChange[],
  limit = 100,
): ProctorEventRow[] {
  const byId = new Map(snapshot.map(row => [row.id, row]))
  for (const change of changes) {
    if (change.type === 'delete') byId.delete(change.eventId)
    else byId.set(change.row.id, change.row)
  }
  return [...byId.values()]
    .sort((a, b) => time(b.created_at) - time(a.created_at))
    .slice(0, Math.max(0, limit))
}

export function proctorDashboardConnectionMode(status: string): ProctorDashboardConnectionMode {
  if (status === 'SUBSCRIBED') return 'live'
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') return 'fallback'
  return 'connecting'
}

export function proctorSignalRetryDelay(consecutiveFailures: number): number {
  const normalizedFailures = Number.isFinite(consecutiveFailures)
    ? Math.max(1, Math.floor(consecutiveFailures))
    : 1
  const index = Math.max(0, Math.min(
    PROCTOR_SIGNAL_RETRY_DELAYS_MS.length - 1,
    normalizedFailures - 1,
  ))
  return PROCTOR_SIGNAL_RETRY_DELAYS_MS[index]
}
