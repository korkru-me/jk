/**
 * Calls an idempotent server action, retrying when no response arrives.
 *
 * WebKit drops POST requests it has already opened — "Load failed", "The
 * network connection was lost" — often enough on iOS/iPadOS that a single
 * dropped request was all it took to tell a student their answer had not been
 * saved and send them off to check their internet. Those come back as a thrown
 * error, and a second attempt almost always lands.
 *
 * A thrown browser request does not prove the server did no work: the request
 * can commit and lose only its response. This helper must therefore be used
 * only for operations where repeating the same call has the same effect, such
 * as setting an answer to the same value. `checkAnswer`, which increments a
 * counter, deliberately does not use it.
 *
 * An action that *answered* is never retried, even when the answer is a
 * refusal. The caller reads that result out of `data` in its own shape.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  /** No response arrived after every attempt; an idempotent call may still have committed. */
  | { ok: false; data?: undefined }

export interface RetryOptions {
  /** Total tries, not extra ones. */
  attempts?: number
  /** Waited after the first failure; multiplied by the attempt number after that. */
  backoffMs?: number
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export async function callIdempotentAction<T>(
  action: () => Promise<T>,
  { attempts = 3, backoffMs = 400, sleep = defaultSleep }: RetryOptions = {},
): Promise<ActionResult<T>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return { ok: true, data: await action() }
    } catch {
      if (attempt >= attempts) return { ok: false }
      await sleep(backoffMs * attempt)
    }
  }
}
