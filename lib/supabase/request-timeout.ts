export const SUPABASE_READ_TIMEOUT_MS = 20_000
export const SUPABASE_AUTH_USER_TIMEOUT_MS = 10_000

interface SupabaseTimeoutFetchOptions {
  fetch?: typeof fetch
  readTimeoutMs?: number
  authUserTimeoutMs?: number
}

/**
 * Bound only requests that are safe to abandon: Data API reads and the Auth
 * user check. Writes, RPCs and refresh-token rotation may already have
 * committed when a client gives up, and Storage uploads can be legitimately
 * long, so those keep their original transport and upstream limits.
 */
export function createSupabaseTimeoutFetch(
  supabaseUrl: string,
  options: SupabaseTimeoutFetchOptions = {},
): typeof fetch {
  const origin = new URL(supabaseUrl).origin
  const send: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const readTimeoutMs = options.readTimeoutMs ?? SUPABASE_READ_TIMEOUT_MS
  const authUserTimeoutMs = options.authUserTimeoutMs ?? SUPABASE_AUTH_USER_TIMEOUT_MS

  return async (input, init) => {
    const request = input instanceof Request ? input : null
    const url = new URL(request?.url ?? input.toString())
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const isRead = method === 'GET' || method === 'HEAD'
    const timeoutMs = url.origin !== origin || !isRead
      ? null
      : url.pathname.startsWith('/rest/v1/')
        ? readTimeoutMs
        // getClaims() fetches the public signing keys at most once per
        // 10 minutes per server instance; a stalled fetch must not hold a
        // request any longer than the user check it replaces.
        : url.pathname === '/auth/v1/user' || url.pathname === '/auth/v1/.well-known/jwks.json'
          ? authUserTimeoutMs
          : null
    if (timeoutMs === null) return send(input, init)

    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const callerSignal = init?.signal ?? request?.signal
    try {
      return await send(input, {
        ...init,
        signal: callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal,
      })
    } catch (error) {
      // postgrest-js replays failed GET/HEAD requests up to three times but
      // never replays AbortError. Keep a timed-out read from multiplying its
      // wait and adding retry load to a database that is already saturated.
      if (timeoutSignal.aborted && !callerSignal?.aborted) {
        throw new DOMException(`Supabase request timed out after ${timeoutMs} ms`, 'AbortError')
      }
      throw error
    }
  }
}
