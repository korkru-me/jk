import { AuthInvalidJwtError, isAuthError } from '@supabase/supabase-js'
import type { AuthError, JWK, JwtPayload, SupabaseClient, User } from '@supabase/supabase-js'

/**
 * The user fields an access token carries. A session check that only needs
 * the caller's identity reads these from the signed token instead of asking
 * the Auth server, so the result deliberately lacks fields that only the Auth
 * database knows (identities, confirmation and sign-in timestamps).
 */
export type SessionUser = Pick<User, 'id' | 'aud' | 'email' | 'phone' | 'role' | 'is_anonymous' | 'app_metadata' | 'user_metadata'>

export type SessionUserResult =
  | { data: { user: SessionUser }; error: null }
  | { data: { user: null }; error: AuthError | null }

export function sessionUserFromClaims(claims: JwtPayload | null | undefined): SessionUser | null {
  if (!claims || typeof claims.sub !== 'string' || claims.sub.length === 0) return null
  // Only end-user sessions identify a person. An anon or service-role token
  // has no `sub` of its own and must never be read as a signed-in user.
  if (claims.role !== 'authenticated') return null
  return {
    id: claims.sub,
    aud: Array.isArray(claims.aud) ? claims.aud[0] ?? '' : claims.aud ?? '',
    email: typeof claims.email === 'string' && claims.email ? claims.email : undefined,
    phone: typeof claims.phone === 'string' && claims.phone ? claims.phone : undefined,
    role: claims.role,
    is_anonymous: claims.is_anonymous === true,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
  }
}

/**
 * Drop-in for `supabase.auth.getUser()` on request paths that only need the
 * caller's identity. With the project's asymmetric (ES256) signing key the
 * token signature and expiry are verified locally against a public key that
 * auth-js caches per server instance for 10 minutes, so a busy exam no longer
 * sends one Auth-server request per page, autosave and proctor heartbeat.
 *
 * Trade-off: a token revoked by sign-out stays usable until it expires (one
 * hour at most). Flows that change credentials, linked identities or admin
 * roles keep using `getUser()`, which also consults the Auth database.
 *
 * A legacy symmetric key makes auth-js fall back to `getUser()` itself, and an
 * unreachable Auth server still surfaces as an AuthRetryableFetchError, so
 * existing "temporarily unavailable" handling continues to apply.
 */
const JWKS_TTL_MS = 10 * 60 * 1000
const JWKS_TIMEOUT_MS = 10_000
let jwksCache: { keys: JWK[]; fetchedAt: number } | null = null
let jwksInFlight: Promise<JWK[] | null> | null = null

/**
 * auth-js caches the signing keys per server instance, but every request that
 * arrives before the first download finishes starts its own download. When a
 * whole class opens the exam at once, share one download per instance instead.
 * A failed download is not cached; auth-js then fetches (and reports) itself.
 */
async function sharedSigningKeys(): Promise<JWK[] | null> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return null
  jwksInFlight ??= (async () => {
    try {
      const response = await fetch(`${new URL(supabaseUrl).origin}/auth/v1/.well-known/jwks.json`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
        signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
        cache: 'no-store',
      })
      if (!response.ok) return null
      const body = await response.json() as { keys?: unknown }
      const keys = Array.isArray(body.keys) ? body.keys as JWK[] : []
      if (keys.length === 0) return null
      jwksCache = { keys, fetchedAt: Date.now() }
      return keys
    } catch {
      return null
    } finally {
      jwksInFlight = null
    }
  })()
  return await jwksInFlight
}

export async function getSessionUser(supabase: SupabaseClient): Promise<SessionUserResult> {
  let result: Awaited<ReturnType<SupabaseClient['auth']['getClaims']>>
  try {
    const keys = await sharedSigningKeys()
    // A key id missing from the shared set (for example right after a key
    // rotation) makes auth-js download the current set itself.
    result = await supabase.auth.getClaims(undefined, keys ? { jwks: { keys } } : {})
  } catch (error) {
    // auth-js throws a plain Error for an expired or malformed token, where
    // getUser() answered "no user". Keep that answer: the caller is signed out.
    if (isAuthError(error)) return { data: { user: null }, error }
    return { data: { user: null }, error: new AuthInvalidJwtError(error instanceof Error ? error.message : 'Invalid JWT') }
  }
  const { data, error } = result
  if (error) return { data: { user: null }, error }
  const user = sessionUserFromClaims(data?.claims)
  return user ? { data: { user }, error: null } : { data: { user: null }, error: null }
}
