export const PROCTOR_EVENT_TYPES = [
  'monitoring_started',
  'tab_hidden',
  'tab_visible',
  'fullscreen_entered',
  'fullscreen_exited',
  'window_blur',
  'window_focus',
  'copy_attempt',
  'cut_attempt',
  'paste_attempt',
  'context_menu_attempt',
  'screenshot_key',
] as const

export type ProctorEventType = (typeof PROCTOR_EVENT_TYPES)[number]

export interface ProctorEvent {
  id: string
  type: ProctorEventType
  clientAt: string
}

const EVENT_TYPE_SET = new Set<string>(PROCTOR_EVENT_TYPES)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Validate the small, privacy-minimised event batch accepted at the server
 * boundary. The server timestamp remains authoritative; clientAt is retained
 * only to keep closely-batched events in a useful order for the teacher.
 */
export function normalizeProctorEvents(input: unknown, maxEvents = 20): ProctorEvent[] | null {
  if (!Array.isArray(input) || input.length > maxEvents) return null

  const normalized: ProctorEvent[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') return null
    const id = Reflect.get(item, 'id')
    const type = Reflect.get(item, 'type')
    const clientAt = Reflect.get(item, 'clientAt')
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return null
    if (typeof type !== 'string' || !EVENT_TYPE_SET.has(type)) return null
    if (typeof clientAt !== 'string' || clientAt.length > 64) return null
    const timestamp = new Date(clientAt)
    if (!Number.isFinite(timestamp.getTime())) return null
    normalized.push({ id, type: type as ProctorEventType, clientAt: timestamp.toISOString() })
  }
  return normalized
}
