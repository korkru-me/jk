import type { ProctorEventRow } from './exam-proctor-realtime'

export const PROCTOR_REVIEW_EVENT_TYPES = [
  'tab_hidden',
  'fullscreen_exited',
  'window_blur',
  'copy_attempt',
  'cut_attempt',
  'paste_attempt',
  'context_menu_attempt',
  'screenshot_key',
  'concurrent_connection',
] as const

export const PROCTOR_RECENT_EVENT_LIMIT = 100
export const PROCTOR_REVIEW_QUEUE_LIMIT = 100

export const PROCTOR_EVENT_LABELS: Record<string, string> = {
  monitoring_started: 'เริ่มเชื่อมต่อห้องคุมสอบ',
  tab_hidden: 'ออกจากแท็บข้อสอบ',
  tab_visible: 'กลับเข้าแท็บข้อสอบ',
  fullscreen_entered: 'กลับเข้าเต็มจอ',
  fullscreen_exited: 'ออกจากเต็มจอ',
  window_blur: 'หน้าต่างเสียโฟกัส',
  window_focus: 'กลับมาที่หน้าต่างข้อสอบ',
  copy_attempt: 'พยายามคัดลอก',
  cut_attempt: 'พยายามตัดข้อความ',
  paste_attempt: 'พยายามวางข้อความ',
  context_menu_attempt: 'เปิดเมนูคลิกขวา',
  screenshot_key: 'กดปุ่ม Print Screen',
  concurrent_connection: 'ตรวจพบหน้าสอบเปิดพร้อมกันหลายจุด',
}

export type ProctorAlertSeverity = 'warning' | 'urgent'

const REVIEW_EVENT_TYPE_SET = new Set<string>(PROCTOR_REVIEW_EVENT_TYPES)
const URGENT_EVENT_TYPE_SET = new Set<string>([
  'screenshot_key',
  'concurrent_connection',
])

export function isReviewableProctorEvent(eventType: string): boolean {
  return REVIEW_EVENT_TYPE_SET.has(eventType)
}

export function proctorAlertSeverity(eventType: string): ProctorAlertSeverity | null {
  if (!isReviewableProctorEvent(eventType)) return null
  return URGENT_EVENT_TYPE_SET.has(eventType) ? 'urgent' : 'warning'
}

export function isUnacknowledgedProctorEvent(
  event: Pick<ProctorEventRow, 'event_type' | 'acknowledged_at'>,
): boolean {
  return isReviewableProctorEvent(event.event_type) && event.acknowledged_at === null
}

/**
 * Register every observed event ID, including recovery and acknowledged rows,
 * and return only unseen reviewable rows. Realtime INSERT and polling snapshot
 * both use this path so reconnecting cannot replay an alert.
 */
export function takeUnseenReviewableProctorEvents(
  events: ProctorEventRow[],
  seenEventIds: Set<number>,
): ProctorEventRow[] {
  const unseenReviewableEvents: ProctorEventRow[] = []
  for (const event of events) {
    if (seenEventIds.has(event.id)) continue
    seenEventIds.add(event.id)
    if (isUnacknowledgedProctorEvent(event)) unseenReviewableEvents.push(event)
  }
  return unseenReviewableEvents
}

function eventTime(event: Pick<ProctorEventRow, 'created_at'>): number {
  const parsed = new Date(event.created_at).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Keep the latest lifecycle feed and a separately bounded review queue. A
 * reviewable event must not become unreachable merely because later recovery
 * events pushed it below the recent-event limit.
 */
export function selectProctorDashboardEvents(events: ProctorEventRow[]): ProctorEventRow[] {
  const sorted = [...new Map(events.map(event => [event.id, event])).values()]
    .sort((a, b) => eventTime(b) - eventTime(a))
  const selectedIds = new Set(
    sorted.slice(0, PROCTOR_RECENT_EVENT_LIMIT).map(event => event.id),
  )
  let queued = 0
  for (const event of sorted) {
    if (queued >= PROCTOR_REVIEW_QUEUE_LIMIT) break
    if (!isUnacknowledgedProctorEvent(event)) continue
    selectedIds.add(event.id)
    queued += 1
  }
  return sorted.filter(event => selectedIds.has(event.id))
}

/**
 * A tab change can emit blur/fullscreen signals together. Keep every durable
 * event in the feed, but use one representative alert per student per short
 * alert batch so the proctor does not receive an avoidable sound storm.
 */
export function collapseProctorAlertEvents(events: ProctorEventRow[]): ProctorEventRow[] {
  const byStudent = new Map<string, ProctorEventRow>()

  for (const event of events) {
    if (!isUnacknowledgedProctorEvent(event)) continue
    const current = byStudent.get(event.student_id)
    if (!current) {
      byStudent.set(event.student_id, event)
      continue
    }

    const currentUrgent = proctorAlertSeverity(current.event_type) === 'urgent'
    const nextUrgent = proctorAlertSeverity(event.event_type) === 'urgent'
    if (nextUrgent && !currentUrgent) byStudent.set(event.student_id, event)
  }

  return [...byStudent.values()]
}
