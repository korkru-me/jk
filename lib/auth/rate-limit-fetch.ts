/** Retry only an explicit Auth rate-limit rejection. A dropped signup or a
 * server error may already have created an account and must not be replayed.
 * This remains request-local: no credentials, sessions or responses are cached.
 */
export function createAuthRateLimitFetch(
  supabaseUrl: string,
  options: {
    fetch?: typeof fetch
    sleep?: (milliseconds: number) => Promise<void>
    random?: () => number
  } = {},
): typeof fetch {
  const origin = new URL(supabaseUrl).origin
  const send = options.fetch ?? globalThis.fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)))
  const random = options.random ?? Math.random
  return async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const retryable = url.origin === origin
      && ['/auth/v1/signup', '/auth/v1/token', '/auth/v1/user'].includes(url.pathname)
      && (request.method === 'GET' || request.method === 'POST')
    // At most eight retries and 40 seconds of sleep. The original rejection is
    // returned if Retry-After exceeds that budget, rather than retrying early.
    let waited = 0
    for (let attempt = 0; ; attempt += 1) {
      const response = await send(request.clone())
      if (!retryable || response.status !== 429 || attempt >= 8 || request.signal.aborted) return response
      // A provider email quota cannot be solved by replaying the same signup.
      // Preserve the response so the caller can show its existing quota copy.
      const rejection = await response.clone().json().catch(() => null)
      if ([rejection?.code, rejection?.error_code].includes('over_email_send_rate_limit')) return response
      const retryAfter = response.headers.get('retry-after')
      const seconds = retryAfter === null ? NaN : Number(retryAfter)
      const serverDelay = Number.isFinite(seconds) && seconds >= 0
        ? seconds * 1000
        : retryAfter ? Math.max(0, Date.parse(retryAfter) - Date.now()) : 0
      const delay = Math.max(Number.isFinite(serverDelay) ? serverDelay : 0,
        Math.min(8000, 500 * 2 ** attempt) + Math.floor(random() * 250))
      if (waited + delay > 40_000) return response
      await response.body?.cancel()
      await sleep(delay)
      if (request.signal.aborted) throw request.signal.reason
      waited += delay
    }
  }
}
