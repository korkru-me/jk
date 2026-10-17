import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import { createGoogleIdTokenVerifier, verifyGoogleIdToken } from './google-id-token.server'

vi.mock('server-only', () => ({}))

const now = Date.parse('2026-10-17T12:00:00Z')
const seconds = Math.floor(now / 1000)
const audience = 'synthetic-client.apps.googleusercontent.com'
const nonceHash = 'a'.repeat(64)
const email = 'verified@example.com'
const subject = 'google-subject-123'
const expected = { audience, nonceHash, email }
let keyPair: Awaited<ReturnType<typeof generateKeyPair>>
let resolveKey: JWTVerifyGetKey

beforeAll(async () => {
  keyPair = await generateKeyPair('RS256')
  const jwk = await exportJWK(keyPair.publicKey)
  resolveKey = createLocalJWKSet({ keys: [{ ...jwk, kid: 'synthetic-google-key', alg: 'RS256', use: 'sig' }] })
})

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function token(overrides: JWTPayload = {}, key = keyPair.privateKey) {
  return new SignJWT({
    iss: 'https://accounts.google.com', aud: audience, sub: subject,
    exp: seconds + 3600, iat: seconds, nonce: nonceHash,
    email, email_verified: true, ...overrides,
  }).setProtectedHeader({ alg: 'RS256', kid: 'synthetic-google-key' }).sign(key)
}

function verifier() {
  return createGoogleIdTokenVerifier(resolveKey, () => new Date(now))
}

describe('Google account-link ID token verification with real synthetic JWT signatures', () => {
  it.each(['https://accounts.google.com', 'accounts.google.com'])('accepts a correctly signed, fresh, exact-email Google token from %s', async (issuer) => {
    expect(await verifier()(await token({ iss: issuer }), expected)).toEqual({ subject, email })
  })

  it('normalizes email case/whitespace but returns only subject and expected email', async () => {
    const signed = await token({ email: ' VERIFIED@example.com ', name: 'Private synthetic profile', picture: 'https://example.invalid/private' })
    const result = await verifier()(signed, expected)
    expect(result).toEqual({ subject, email })
    expect(result).not.toHaveProperty('name')
    expect(result).not.toHaveProperty('picture')
    expect(JSON.stringify(result)).not.toContain(signed)
  })

  it.each([
    { iss: 'https://attacker.invalid' }, { aud: 'different-client.apps.googleusercontent.com' },
    { exp: seconds - 6 }, { iat: seconds - 306 }, { iat: seconds + 60 },
    { nonce: 'b'.repeat(64) }, { nonce: nonceHash.toUpperCase() },
    { email: 'other@example.com' }, { email: email.replace('verified', 'verified+tag') },
    { email_verified: false }, { email_verified: 'true' }, { sub: '' }, { sub: ' ' },
    { sub: 'x'.repeat(256) }, { azp: 'other-client.apps.googleusercontent.com' },
    { aud: [audience, 'other-client.apps.googleusercontent.com'] },
  ])('rejects invalid signed claims (%j)', async (claims) => {
    expect(await verifier()(await token(claims), expected)).toBeNull()
  })

  it.each(['sub', 'exp', 'iat', 'nonce', 'email', 'email_verified'] as const)('requires %s even when the signature is valid', async (claim) => {
    expect(await verifier()(await token({ [claim]: undefined }), expected)).toBeNull()
  })

  it('does not merge Gmail dot/plus/googlemail variants', async () => {
    for (const googleEmail of ['firstlast@gmail.com', 'first.last+tag@gmail.com', 'first.last@googlemail.com']) {
      expect(await verifier()(await token({ email: googleEmail }), { ...expected, email: 'first.last@gmail.com' })).toBeNull()
    }
  })

  it('allows multiple audiences only when azp names this exact configured client', async () => {
    expect(await verifier()(await token({ aud: [audience, 'other-client.apps.googleusercontent.com'], azp: audience }), expected)).toEqual({ subject, email })
  })

  it('rejects a forged signature from another RSA key', async () => {
    const attackerKey = await generateKeyPair('RS256')
    expect(await verifier()(await token({}, attackerKey.privateKey), expected)).toBeNull()
  })

  it('rejects HS256 and unsigned tokens without resolving a verification key', async () => {
    const resolve = vi.fn<JWTVerifyGetKey>()
    const verify = createGoogleIdTokenVerifier(resolve, () => new Date(now))
    const signed = await new SignJWT({ sub: subject, email, email_verified: true }).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode('synthetic-secret-at-least-32-characters'))
    expect(await verify(signed, expected)).toBeNull()
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: subject })).toString('base64url')}.`
    expect(await verify(unsigned, expected)).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('bounds invalid input and fails closed if the key resolver is unavailable', async () => {
    const resolve = vi.fn<JWTVerifyGetKey>().mockRejectedValue(new Error('private-key-detail'))
    const verify = createGoogleIdTokenVerifier(resolve, () => new Date(now))
    for (const invalid of ['', 'malformed', 'x'.repeat(16385)]) expect(await verify(invalid, expected)).toBeNull()
    expect(await verify(await token(), expected)).toBeNull()
    expect(await verify(await token(), { ...expected, audience: '' })).toBeNull()
    expect(await verify(await token(), { ...expected, nonceHash: 'invalid' })).toBeNull()
  })

  it('production verifier fetches only the fixed Google keyset and refuses redirects', async () => {
    const publicJwk = await exportJWK(keyPair.publicKey)
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: 'synthetic-google-key', alg: 'RS256', use: 'sig' }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)
    const currentSeconds = Math.floor(Date.now() / 1000)
    const signed = await new SignJWT({ iss: 'https://accounts.google.com', aud: audience, sub: subject, exp: currentSeconds + 3600, iat: currentSeconds, nonce: nonceHash, email, email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-google-key', jku: 'https://attacker.invalid/keys' }).sign(keyPair.privateKey)
    expect(await verifyGoogleIdToken(signed, expected)).toEqual({ subject, email })
    expect(fetch).toHaveBeenCalledOnce()
    expect(String(fetch.mock.calls[0][0])).toBe('https://www.googleapis.com/oauth2/v3/certs')
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'manual', method: 'GET' })
  })
})
