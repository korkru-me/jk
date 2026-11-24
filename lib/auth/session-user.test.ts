import { describe, expect, it, vi } from 'vitest'
import { createClient, isAuthRetryableFetchError } from '@supabase/supabase-js'
import { getSessionUser, sessionUserFromClaims } from '@/lib/auth/session-user'

const URL = 'https://project.supabase.test'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const KID = 'test-key'

const b64url = (bytes: Uint8Array | string) => Buffer.from(bytes).toString('base64url')

async function keyPair() {
  return await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
}

async function signToken(privateKey: CryptoKey, payload: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: KID }))
  const body = b64url(JSON.stringify(payload))
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, Buffer.from(`${header}.${body}`))
  return `${header}.${body}.${b64url(new Uint8Array(signature))}`
}

function claims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    sub: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'student@example.test', iss: `${URL}/auth/v1`, aal: 'aal1' as const,
    iat: now, exp: now + 3600, session_id: 's', is_anonymous: false,
    app_metadata: { provider: 'email' }, user_metadata: { full_name: 'นักเรียน' }, ...overrides,
  }
}

async function clientWith(accessToken: string, publicJwk: JsonWebKey, jwksStatus = 200) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = new globalThis.URL(input instanceof Request ? input.url : input.toString()).pathname
    if (path === '/auth/v1/.well-known/jwks.json') {
      return jwksStatus === 200
        ? Response.json({ keys: [{ ...publicJwk, kid: KID, alg: 'ES256', use: 'sig', key_ops: ['verify'] }] })
        : new Response('{}', { status: jwksStatus })
    }
    return Response.json({ message: `unexpected ${path}` }, { status: 500 })
  })
  const session = {
    access_token: accessToken, refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: USER_ID },
  }
  const memory = new Map<string, string>()
  const supabase = createClient(URL, 'anon', {
    // A unique storage key per client isolates auth-js's process-wide JWKS cache.
    auth: { persistSession: true, autoRefreshToken: false, storageKey: crypto.randomUUID(),
      storage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: k => void memory.delete(k) } },
    global: { fetch },
  })
  memory.set((supabase.auth as unknown as { storageKey: string }).storageKey, JSON.stringify(session))
  return { supabase, fetch }
}

describe('getSessionUser', () => {
  it('verifies a genuine ES256 token locally without asking the Auth server for the user', async () => {
    const { privateKey, publicKey } = await keyPair()
    const { supabase, fetch } = await clientWith(await signToken(privateKey, claims()), await crypto.subtle.exportKey('jwk', publicKey))

    const first = await getSessionUser(supabase)
    const second = await getSessionUser(supabase)

    expect(first.error).toBeNull()
    expect(first.data.user).toMatchObject({ id: USER_ID, email: 'student@example.test', user_metadata: { full_name: 'นักเรียน' } })
    expect(second.data.user?.id).toBe(USER_ID)
    const paths = fetch.mock.calls.map(([input]) => new globalThis.URL(String(input instanceof Request ? input.url : input)).pathname)
    expect(paths).toEqual(['/auth/v1/.well-known/jwks.json'])
  })

  it('rejects a token signed by any other key', async () => {
    const trusted = await keyPair()
    const attacker = await keyPair()
    const { supabase } = await clientWith(await signToken(attacker.privateKey, claims()), await crypto.subtle.exportKey('jwk', trusted.publicKey))

    const result = await getSessionUser(supabase)
    expect(result.data.user).toBeNull()
    expect(result.error).not.toBeNull()
  })

  it('rejects an expired token', async () => {
    const { privateKey, publicKey } = await keyPair()
    const past = Math.floor(Date.now() / 1000) - 120
    const { supabase } = await clientWith(await signToken(privateKey, claims({ iat: past - 3600, exp: past })), await crypto.subtle.exportKey('jwk', publicKey))
    // An expired stored session is refreshed first; the refresh endpoint is
    // unavailable here, so no identity may be produced.
    const result = await getSessionUser(supabase)
    expect(result.data.user).toBeNull()
  })

  it('reports an unreachable key endpoint as temporary, not as signed out', async () => {
    const { privateKey, publicKey } = await keyPair()
    const { supabase } = await clientWith(await signToken(privateKey, claims()), await crypto.subtle.exportKey('jwk', publicKey), 503)

    const result = await getSessionUser(supabase)
    expect(result.data.user).toBeNull()
    expect(isAuthRetryableFetchError(result.error)).toBe(true)
  })
})

describe('shared signing keys', () => {
  it('downloads the key set once when a whole class arrives at the same moment', async () => {
    const { privateKey, publicKey } = await keyPair()
    const publicJwk = await crypto.subtle.exportKey('jwk', publicKey)
    const token = await signToken(privateKey, claims())
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL)
    const shared = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      return Response.json({ keys: [{ ...publicJwk, kid: KID, alg: 'ES256', use: 'sig', key_ops: ['verify'] }] })
    })
    vi.stubGlobal('fetch', shared)
    try {
      const fresh = await import('@/lib/auth/session-user')
      const clients = await Promise.all(Array.from({ length: 20 }, () => clientWith(token, publicJwk)))
      const results = await Promise.all(clients.map(({ supabase }) => fresh.getSessionUser(supabase)))

      expect(results.every(result => result.data.user?.id === USER_ID)).toBe(true)
      expect(shared).toHaveBeenCalledTimes(1)
      expect(clients.every(({ fetch }) => fetch.mock.calls.length === 0)).toBe(true)
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    }
  })
})

describe('sessionUserFromClaims', () => {
  it('maps end-user claims to the fields callers read', () => {
    expect(sessionUserFromClaims(claims())).toEqual({
      id: USER_ID, aud: 'authenticated', email: 'student@example.test', phone: undefined,
      role: 'authenticated', is_anonymous: false,
      app_metadata: { provider: 'email' }, user_metadata: { full_name: 'นักเรียน' },
    })
  })

  it('never treats anon or service-role tokens as a person', () => {
    expect(sessionUserFromClaims(claims({ role: 'anon' }))).toBeNull()
    expect(sessionUserFromClaims(claims({ role: 'service_role' }))).toBeNull()
    expect(sessionUserFromClaims(claims({ sub: '' }))).toBeNull()
    expect(sessionUserFromClaims(null)).toBeNull()
  })
})
