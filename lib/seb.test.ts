import { describe, expect, it } from 'vitest'
import {
  createSebChallengeClaims,
  createSebRequestHash,
  createSebSessionClaims,
  inspectSebReadiness,
  normalizeSebRequestUrl,
  parseSebVersion,
  readSebEnvironment,
  signSebClaims,
  verifySebClaims,
  verifySebRequestHashes,
} from '@/lib/seb'

const CONFIG_KEY = 'a'.repeat(64)
const BROWSER_KEY = 'b'.repeat(64)
const SECRET = 'phase-one-seb-session-secret-for-tests'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const ASSIGNMENT_ID = '22222222-2222-4222-8222-222222222222'
const REQUEST_URL = `https://exam.example/assignments/${ASSIGNMENT_ID}/take?sebChallenge=token#ignored`

describe('SEB request verification', () => {
  it('removes fragments but retains the exact query string', () => {
    expect(normalizeSebRequestUrl(REQUEST_URL)).toBe(
      `https://exam.example/assignments/${ASSIGNMENT_ID}/take?sebChallenge=token`,
    )
  })

  it('requires both the configured CK and one allowed BEK', () => {
    const configKeyHash = createSebRequestHash(REQUEST_URL, CONFIG_KEY)
    const browserExamKeyHash = createSebRequestHash(REQUEST_URL, BROWSER_KEY)
    expect(verifySebRequestHashes({
      requestUrl: REQUEST_URL,
      configKeyHash,
      browserExamKeyHash,
      configKey: CONFIG_KEY,
      browserExamKeys: [BROWSER_KEY, 'c'.repeat(64)],
    })).toBe(true)
    expect(verifySebRequestHashes({
      requestUrl: REQUEST_URL,
      configKeyHash,
      browserExamKeyHash: 'd'.repeat(64),
      configKey: CONFIG_KEY,
      browserExamKeys: [BROWSER_KEY],
    })).toBe(false)
  })

  it('preserves the copied key casing while accepting hash hex casing', () => {
    const upperConfigKey = 'A'.repeat(64)
    const configKeyHash = createSebRequestHash(REQUEST_URL, upperConfigKey)
    expect(verifySebRequestHashes({
      requestUrl: REQUEST_URL,
      configKeyHash: configKeyHash.toUpperCase(),
      browserExamKeyHash: createSebRequestHash(REQUEST_URL, BROWSER_KEY),
      configKey: upperConfigKey,
      browserExamKeys: [BROWSER_KEY],
    })).toBe(true)
  })
})

describe('SEB environment and version validation', () => {
  it('rejects incomplete secret/key configuration', () => {
    expect(readSebEnvironment({ SEB_SESSION_SECRET: 'short' })).toBeNull()
    expect(readSebEnvironment({
      SEB_SESSION_SECRET: SECRET,
      SEB_CONFIG_KEY: CONFIG_KEY,
      SEB_BROWSER_EXAM_KEYS: `${BROWSER_KEY},${'c'.repeat(64)}`,
    })?.browserExamKeys).toHaveLength(2)
  })

  it.each([
    ['SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser', 'windows'],
    ['Safe Exam Browser_macOS_3.6.0_123_org.safeexambrowser.SafeExamBrowser', 'macos'],
    ['Safe Exam Browser_iOS_3.6.0_123_org.safeexambrowser.SafeExamBrowser', 'ios'],
  ])('parses the official version format for %s', (version, platform) => {
    expect(parseSebVersion(version)?.platform).toBe(platform)
  })

  it('does not treat a browser user agent as an SEB version', () => {
    expect(parseSebVersion('Mozilla/5.0 Safari')).toBeNull()
  })

  it('reports deployment readiness without returning secret values', () => {
    const readiness = inspectSebReadiness({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'https://exam.example',
      NEXT_PUBLIC_SEB_CONFIG_URL: 'https://exam.example/korkru.seb',
      SEB_SESSION_SECRET: SECRET,
      SEB_CONFIG_KEY: CONFIG_KEY,
      SEB_BROWSER_EXAM_KEYS: `${BROWSER_KEY},${BROWSER_KEY}`,
    })
    expect(readiness).toEqual({
      publishReady: true,
      sessionSecretReady: true,
      configKeyReady: true,
      browserExamKeyCount: 1,
      siteUrlReady: true,
      configFileStatus: 'ready',
    })
    expect(JSON.stringify(readiness)).not.toContain(SECRET)
    expect(JSON.stringify(readiness)).not.toContain(CONFIG_KEY)
  })

  it('requires HTTPS in production but allows distributing the config file manually', () => {
    expect(inspectSebReadiness({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'http://exam.example',
      SEB_SESSION_SECRET: SECRET,
      SEB_CONFIG_KEY: CONFIG_KEY,
      SEB_BROWSER_EXAM_KEYS: BROWSER_KEY,
    })).toMatchObject({ publishReady: false, siteUrlReady: false, configFileStatus: 'manual' })
  })

  it('rejects non-canonical and credential-bearing production URLs', () => {
    for (const siteUrl of [
      'https://exam.example/',
      'https://user:password@exam.example',
      ' https://exam.example',
      'https://exam.example ',
    ]) {
      expect(inspectSebReadiness({
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: siteUrl,
        SEB_SESSION_SECRET: SECRET,
        SEB_CONFIG_KEY: CONFIG_KEY,
        SEB_BROWSER_EXAM_KEYS: BROWSER_KEY,
      })).toMatchObject({ publishReady: false, siteUrlReady: false })
    }

    expect(inspectSebReadiness({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'https://exam.example',
      NEXT_PUBLIC_SEB_CONFIG_URL: 'https://user:password@exam.example/korkru.seb',
      SEB_SESSION_SECRET: SECRET,
      SEB_CONFIG_KEY: CONFIG_KEY,
      SEB_BROWSER_EXAM_KEYS: BROWSER_KEY,
    })).toMatchObject({ configFileStatus: 'invalid' })
  })
})

describe('signed SEB claims', () => {
  it('binds a short-lived challenge to one user and assignment', () => {
    const claims = createSebChallengeClaims(USER_ID, ASSIGNMENT_ID, 'system_check', 1_000)
    const token = signSebClaims(claims, SECRET)
    expect(verifySebClaims(token, SECRET, 2_000)).toMatchObject({
      kind: 'seb_challenge', userId: USER_ID, assignmentId: ASSIGNMENT_ID, purpose: 'system_check',
    })
    expect(verifySebClaims(token, SECRET, claims.expiresAt)).toBeNull()
  })

  it('rejects a challenge without a recognized purpose', () => {
    const claims = createSebChallengeClaims(USER_ID, ASSIGNMENT_ID, 'take', 1_000)
    const token = signSebClaims({ ...claims, purpose: 'other' } as never, SECRET)
    expect(verifySebClaims(token, SECRET, 2_000)).toBeNull()
  })

  it('rejects a changed session token', () => {
    const token = signSebClaims(createSebSessionClaims({
      userId: USER_ID,
      assignmentId: ASSIGNMENT_ID,
      platform: 'windows',
      version: 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser',
      now: 1_000,
    }), SECRET)
    expect(verifySebClaims(token, SECRET, 2_000)?.kind).toBe('seb_session')
    expect(verifySebClaims(`${token}x`, SECRET, 2_000)).toBeNull()
  })
})
