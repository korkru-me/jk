export const EXAM_PROCTOR_RETENTION_DAYS = 90

export interface ProctorPurgeCounts {
  eventsDeleted: number
  connectionsDeleted: number
  sessionsDeleted: number
}

function nonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null
  return value
}

/** Validate the deliberately small result returned by the privileged purge RPC. */
export function normalizeProctorPurgeCounts(input: unknown): ProctorPurgeCounts | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null

  const eventsDeleted = nonNegativeInteger(Reflect.get(input, 'eventsDeleted'))
  const connectionsDeleted = nonNegativeInteger(Reflect.get(input, 'connectionsDeleted'))
  const sessionsDeleted = nonNegativeInteger(Reflect.get(input, 'sessionsDeleted'))
  if (eventsDeleted === null || connectionsDeleted === null || sessionsDeleted === null) return null

  return { eventsDeleted, connectionsDeleted, sessionsDeleted }
}

export function totalPurgedProctorRecords(counts: ProctorPurgeCounts): number {
  return counts.eventsDeleted + counts.connectionsDeleted + counts.sessionsDeleted
}
