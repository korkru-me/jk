/** The hard close is independent of the on-time due date/late colour bands. */
export function attemptExpiresAt(startedAt: string, durationMinutes: number | null | undefined,
  endAt: string | null | undefined): string | null {
  const start = Date.parse(startedAt)
  const timed = Number.isFinite(start) && durationMinutes != null && durationMinutes > 0
    ? start + durationMinutes * 60_000 : Infinity
  const end = endAt ? Date.parse(endAt) : Infinity
  const close = Math.min(timed, Number.isFinite(end) ? end : Infinity)
  return Number.isFinite(close) ? new Date(close).toISOString() : null
}

export function attemptHasExpired(expiresAt: string | null | undefined, nowMs = Date.now()): boolean {
  return expiresAt != null && Date.parse(expiresAt) <= nowMs
}

export function attemptSecondsLeft(expiresAt: string | null | undefined, nowMs: number): number | null {
  if (!expiresAt) return null
  const end = Date.parse(expiresAt)
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - nowMs) / 1000)) : 0
}
