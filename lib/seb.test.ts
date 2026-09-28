import { describe, expect, it } from 'vitest'
import {
  createSebChallengeClaims,
  createSebRequestHash,
  createSebSessionClaims,
  inspectSebReadiness,
  normalizeSebRequestUrl,
  parseSebVersion,
  readSebEnvironment,
  readSebSessionSecret,
  selectSebBrowserExamKeys,
  signSebClaims,
  verifySebClaims,
  verifySebRequestHashes,
} from '@/lib/seb'

const CONFIG_KEY = 'a'.repeat(64)
const BROWSER_KEY = 'b'.repeat(64)
const CONFIG_REVISION = `production-v1-${'c'.repeat(64)}`
const SECRET = 'phase-one-seb-session-secret-for-tests'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const ASSIGNMENT_ID = '22222222-2222-4222-8222-222222222222'
const ASSIGNMENT_CONFIG_REVISION = 7
const REQUEST_URL = `https://exam.example/assignments/${ASSIGNMENT_ID}/take?sebChallenge=token#ignored`
const WINDOWS_VERSION = 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser'
const ALL_KEY_ENTRIES = [
  { platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: BROWSER_KEY },
  { platform: 'macos', versionString: '3.7', buildNumber: '100', key: 'c'.repeat(64) },
  { platform: 'ios', versionString: '3.6.2', buildNumber: '101', key: 'd'.repeat(64) },
  { platform: 'ios', versionString: '3.7.1', buildNumber: '102', key: 'e'.repeat(64) },
]

function keyRegistry(entries = [{
  platform: 'windows',
  versionString: '3.10.2',
  buildNumber: '920',
  key: BROWSER_KEY,
}]) {
  return JSON.stringify({ schemaVersion: 1, configRevision: CONFIG_REVISION, entries })
}

function releaseRegistry() {
  return {
    revisions: [{
      revision: CONFIG_REVISION,
      lifecycle: 'candidate',
      policy: {
        startUrl: 'approved',
        navigationFilters: 'approved',
        uploads: 'approved',
        quitPassword: 'approved',
        adminPassword: 'approved',
        distribution: 'approved',
      },
      builds: [
        { target: 'windows', runtimePlatform: 'windows', versionString: '3.10.2', buildNumber: '920', approval: 'approved' },
        { target: 'macos', runtimePlatform: 'macos', versionString: '3.7', buildNumber: '100', approval: 'approved' },
        { target: 'ipados', runtimePlatform: 'ios', versionString: '3.6.2', buildNumber: '101', approval: 'approved' },
        { target: 'ios', runtimePlatform: 'ios', versionString: '3.7.1', buildNumber: '102', approval: 'approved' },
      ],
    }],
  }
}

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
    expect(readSebSessionSecret({ SEB_SESSION_SECRET: SECRET })).toBe(SECRET)
    expect(readSebSessionSecret({ SEB_SESSION_SECRET: 'short' })).toBeNull()
    expect(readSebEnvironment({ SEB_SESSION_SECRET: 'short' })).toBeNull()
    expect(readSebEnvironment({
      SEB_SESSION_SECRET: SECRET,
      SEB_CONFIG_KEY: CONFIG_KEY,
      SEB_CONFIG_REVISION: CONFIG_REVISION,
      SEB_BROWSER_EXAM_KEY_REGISTRY: keyRegistry(),
    }, releaseRegistry())?.browserExamKeys).toHaveLength(1)
  })

  it('accepts a revision-bound staging candidate without marking it publish-ready', () => {
    const stagingRevision = `staging-v1-${'d'.repeat(64)}`
    const registry = releaseRegistry()
    registry.revisions.push({
      revision: stagingRevision,
      lifecycle: 'candidate',
      policy: {
        startUrl: 'pending',
        navigationFilters: 'pending',
        uploads: 'pending',
        quitPassword: 'pending',
        adminPassword: 'pending',
        distribution: 'pending',
      },
      builds: [
        { target: 'windows', runtimePlatform: 'windows', versionString: '3.10.2', buildNumber: '920', approval: 'pending' },
        { target: 'macos', runtimePlatform: 'macos', versionString: '3.7', buildNumber: 'pending', approval: 'pending' },
        { target: 'ipados', runtimePlatform: 'ios', versionString: '3.6.2', buildNumber: 'pending', approval: 'pending' },
        { target: 'ios', runtimePlatform: 'ios', versionString: '3.7.1', buildNumber: 'pending', approval: 'pending' },
      ],
    })
    const environment = {
      NODE_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'https://staging.example',
      NEXT_PUBLIC_SEB_CONFIG_URL: 'https://staging.example/korkru-staging-v1.seb',
      SEB_SESSION_SECRET: SECRET,
      SEB_CONFIG_KEY: CONFIG_KEY,
      SEB_CONFIG_REVISION: stagingRevision,
      SEB_BROWSER_EXAM_KEY_REGISTRY: JSON.stringify({
        schemaVersion: 1,
        configRevision: stagingRevision,
        entries: [{
          platform: 'windows',
          versionString: '3.10.2',
          buildNumber: '920',
          key: BROWSER_KEY,
        }],
      }),
    }

    expect(readSebEnvironment(environment, registry)).not.toBeNull()
    expect(inspectSebReadiness(environment, registry)).toMatchObject({
      publishReady: false,
      configRevisionReady: true,
      releaseRegistryReady: false,
      browserExamKeyRegistryReady: true,
      browserExamKeyCoverageReady: false,
      browserExamKeyCount: 1,
    })
  })

  it('rejects malformed, duplicate, or revision-mismatched BEK registries', () => {
    const base = {
      SEB_SESSION_SECRET: SECRET,
      SEB_CONFIG_KEY: CONFIG_KEY,
      SEB_CONFIG_REVISION: CONFIG_REVISION,
    }
    expect(readSebEnvironment({
      ...base,
      SEB_BROWSER_EXAM_KEY_REGISTRY: '{invalid',
    }, releaseRegistry())).toBeNull()
    expect(readSebEnvironment({
      ...base,
      SEB_BROWSER_EXAM_KEY_REGISTRY: JSON.stringify({
        schemaVersion: 1,
        configRevision: 'another-revision',
        entries: [],
      }),
    }, releaseRegistry())).toBeNull()
    expect(readSebEnvironment({
      ...base,
      SEB_BROWSER_EXAM_KEY_REGISTRY: keyRegistry([
        { platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: BROWSER_KEY },
        { platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: 'd'.repeat(64) },
      ]),
    }, releaseRegistry())).toBeNull()
  })

  it.each([
    [WINDOWS_VERSION, 'windows'],
    ['Safe Exam Browser_macOS_3.6.0_123_org.safeexambrowser.SafeExamBrowser', 'macos'],
    ['Safe Exam Browser_iOS_3.6.0_123_org.safeexambrowser.SafeExamBrowser', 'ios'],
  ])('parses the official version format for %s', (version, platform) => {
    expect(parseSebVersion(version)).toMatchObject({ platform })
  })

  it('selects a BEK only for the exact SEB platform, version, and build', () => {
    const environment = readSebEnvironment({
      SEB_SESSION_SECRET: SECRET,
      SEB_CONFIG_KEY: CONFIG_KEY,
      SEB_CONFIG_REVISION: CONFIG_REVISION,
      SEB_BROWSER_EXAM_KEY_REGISTRY: keyRegistry(),
    }, releaseRegistry())
    const version = parseSebVersion(WINDOWS_VERSION)
    expect(environment && version
      ? selectSebBrowserExamKeys(environment.browserExamKeys, version)
      : []).toEqual([BROWSER_KEY])
    const wrongBuild = parseSebVersion('SEB_Windows_3.10.2_921_org.safeexambrowser.SafeExamBrowser')
    expect(environment && wrongBuild
      ? selectSebBrowserExamKeys(environment.browserExamKeys, wrongBuild)
      : []).toEqual([])
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
      SEB_CONFIG_REVISION: CONFIG_REVISION,
      SEB_BROWSER_EXAM_KEY_REGISTRY: keyRegistry(ALL_KEY_ENTRIES),
    }, releaseRegistry())
    expect(readiness).toEqual({
      publishReady: true,
      sessionSecretReady: true,
      configKeyReady: true,
      configRevisionReady: true,
      releaseRegistryReady: true,
      browserExamKeyRegistryReady: true,
      browserExamKeyCoverageReady: true,
      browserExamKeyCount: 4,
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
      SEB_CONFIG_REVISION: CONFIG_REVISION,
      SEB_BROWSER_EXAM_KEY_REGISTRY: keyRegistry(),
    }, releaseRegistry())).toMatchObject({ publishReady: false, siteUrlReady: false, configFileStatus: 'manual' })
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
        SEB_CONFIG_REVISION: CONFIG_REVISION,
        SEB_BROWSER_EXAM_KEY_REGISTRY: keyRegistry(),
      }, releaseRegistry())).toMatchObject({ publishReady: false, siteUrlReady: false })
    }

    expect(inspectSebReadiness({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'https://exam.example',
      NEXT_PUBLIC_SEB_CONFIG_URL: 'https://user:password@exam.example/korkru.seb',
      SEB_SESSION_SECRET: SECRET,
      SEB_CONFIG_KEY: CONFIG_KEY,
      SEB_CONFIG_REVISION: CONFIG_REVISION,
      SEB_BROWSER_EXAM_KEY_REGISTRY: keyRegistry(),
    }, releaseRegistry())).toMatchObject({ configFileStatus: 'invalid' })
  })
})

describe('signed SEB claims', () => {
  it('binds a short-lived challenge to one user and assignment', () => {
    const claims = createSebChallengeClaims(
      USER_ID,
      ASSIGNMENT_ID,
      CONFIG_REVISION,
      ASSIGNMENT_CONFIG_REVISION,
      'system_check',
      1_000,
    )
    const token = signSebClaims(claims, SECRET)
    expect(verifySebClaims(token, SECRET, 2_000)).toMatchObject({
      kind: 'seb_challenge', userId: USER_ID, assignmentId: ASSIGNMENT_ID, purpose: 'system_check',
    })
    expect(verifySebClaims(token, SECRET, claims.expiresAt)).toBeNull()
  })

  it('rejects a challenge without a recognized purpose', () => {
    const claims = createSebChallengeClaims(
      USER_ID,
      ASSIGNMENT_ID,
      CONFIG_REVISION,
      ASSIGNMENT_CONFIG_REVISION,
      'take',
      1_000,
    )
    const token = signSebClaims({ ...claims, purpose: 'other' } as never, SECRET)
    expect(verifySebClaims(token, SECRET, 2_000)).toBeNull()
  })

  it('rejects a changed session token', () => {
    const token = signSebClaims(createSebSessionClaims({
      userId: USER_ID,
      assignmentId: ASSIGNMENT_ID,
      configRevision: CONFIG_REVISION,
      assignmentConfigRevision: ASSIGNMENT_CONFIG_REVISION,
      platform: 'windows',
      version: WINDOWS_VERSION,
      now: 1_000,
    }), SECRET)
    expect(verifySebClaims(token, SECRET, 2_000)).toMatchObject({
      kind: 'seb_session',
      configRevision: CONFIG_REVISION,
      assignmentConfigRevision: ASSIGNMENT_CONFIG_REVISION,
    })
    expect(verifySebClaims(`${token}x`, SECRET, 2_000)).toBeNull()
  })

  it('rejects a legacy session that is not bound to a config revision', () => {
    const claims = createSebSessionClaims({
      userId: USER_ID,
      assignmentId: ASSIGNMENT_ID,
      configRevision: CONFIG_REVISION,
      assignmentConfigRevision: ASSIGNMENT_CONFIG_REVISION,
      platform: 'windows',
      version: WINDOWS_VERSION,
      now: 1_000,
    })
    const token = signSebClaims({ ...claims, configRevision: undefined } as never, SECRET)
    expect(verifySebClaims(token, SECRET, 2_000)).toBeNull()
  })
})
