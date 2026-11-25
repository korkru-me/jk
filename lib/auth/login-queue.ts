/** Shared by the login server action and the login form. When hosted Auth
 * answers "too many requests", the student is not told to try again later:
 * the form keeps them in a short queue and retries on its own, spread out with
 * jitter so a whole room does not retry in the same second.
 */
export const LOGIN_BUSY_MESSAGE = 'มีผู้ใช้งานพร้อมกันจำนวนมาก กรุณารอสักครู่แล้วลองเข้าสู่ระบบใหม่'

/** The longest the form keeps retrying before handing control back. */
export const LOGIN_QUEUE_MAX_MS = 3 * 60_000

const BASE_DELAY_MS = 8_000
const MAX_DELAY_MS = 30_000
const JITTER_MS = 7_000

/** Wait before retry number `attempt` (0-based): 8 s, 12 s, 18 s, 27 s, 30 s…
 * plus up to 7 s of random spread. */
export function nextLoginRetryDelayMs(attempt: number, random: () => number = Math.random) {
  const base = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 1.5 ** Math.max(0, attempt))
  return Math.round(base + random() * JITTER_MS)
}

/** Whether another retry still fits inside the queue window. */
export function canRetryLogin(startedAt: number, now: number, delayMs: number) {
  return now + delayMs - startedAt <= LOGIN_QUEUE_MAX_MS
}

export function isInvalidCredentials(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === 'invalid_credentials' || error?.message === 'Invalid login credentials'
}
