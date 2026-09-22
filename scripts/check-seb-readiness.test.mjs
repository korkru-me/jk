import { describe, expect, it } from 'vitest'
import { inspectSebReadiness } from '../lib/seb.ts'
import {
  formatSebReadinessReport,
  inspectEnvFilePermission,
  inspectSebDeploymentReadiness,
  parseEnvFile,
} from './check-seb-readiness-core.mjs'

const CONFIG_KEY = 'a'.repeat(64)
const BROWSER_KEY = 'b'.repeat(64)
const CONFIG_REVISION = `production-v1-${'c'.repeat(64)}`
const SECRET = 'phase-seven-seb-session-secret-for-tests'
const ALL_KEY_ENTRIES = [
  { platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: BROWSER_KEY },
  { platform: 'macos', versionString: '3.7', buildNumber: '100', key: 'c'.repeat(64) },
  { platform: 'ios', versionString: '3.6.2', buildNumber: '101', key: 'd'.repeat(64) },
  { platform: 'ios', versionString: '3.7.1', buildNumber: '102', key: 'e'.repeat(64) },
]

function keyRegistry(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    configRevision: CONFIG_REVISION,
    entries: [{
      platform: 'windows',
      versionString: '3.10.2',
      buildNumber: '920',
      key: BROWSER_KEY,
    }],
    ...overrides,
  })
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

function inspect(environment) {
  return inspectSebDeploymentReadiness(environment, releaseRegistry())
}

function validEnvironment(overrides = {}) {
  return {
    NEXT_PUBLIC_SITE_URL: 'https://exam.example',
    NEXT_PUBLIC_SEB_CONFIG_URL: 'https://exam.example/korkru.seb',
    SEB_SESSION_SECRET: SECRET,
    SEB_CONFIG_KEY: CONFIG_KEY,
    SEB_CONFIG_REVISION: CONFIG_REVISION,
    SEB_BROWSER_EXAM_KEY_REGISTRY: keyRegistry({ entries: ALL_KEY_ENTRIES }),
    ...overrides,
  }
}

describe('SEB readiness env parsing', () => {
  it('supports comments, export, and quoted values without mutating process.env', () => {
    const parsed = parseEnvFile(`
      # comment
      export NEXT_PUBLIC_SITE_URL="https://exam.example" # comment
      SEB_SESSION_SECRET='${SECRET}'
      EMPTY=
    `)
    expect(parsed).toEqual({
      values: {
        NEXT_PUBLIC_SITE_URL: 'https://exam.example',
        SEB_SESSION_SECRET: SECRET,
        EMPTY: '',
      },
      warnings: [],
    })
  })

  it('reports only the line number for unsupported syntax', () => {
    expect(parseEnvFile('not an assignment').warnings).toEqual([
      { line: 1, reason: 'unsupported syntax' },
    ])
  })

  it('matches Next.js comment and variable-expansion behavior without mutating env', () => {
    const baseEnvironment = { DEPLOY_SECRET: SECRET }
    const snapshot = { ...baseEnvironment }
    const parsed = parseEnvFile(`
      EXPANDED=\${DEPLOY_SECRET}
      MISSING=\${MISSING_VARIABLE_WITH_A_NAME_LONG_ENOUGH_FOR_THIRTY_TWO}
      COMMENTED=short#this-comment-must-not-count-toward-readiness
      ESCAPED=\\\$DEPLOY_SECRET
    `, baseEnvironment)

    expect(parsed.values).toMatchObject({
      EXPANDED: SECRET,
      MISSING: '',
      COMMENTED: 'short',
      ESCAPED: '$DEPLOY_SECRET',
    })
    expect(baseEnvironment).toEqual(snapshot)
    expect(inspect(validEnvironment({
      SEB_SESSION_SECRET: parsed.values.MISSING,
    })).appReadiness.sessionSecretReady).toBe(false)
    expect(inspect(validEnvironment({
      SEB_SESSION_SECRET: parsed.values.COMMENTED,
    })).appReadiness.sessionSecretReady).toBe(false)
  })

  it('fails closed on cyclic variable expansion by discarding the env file', () => {
    const parsed = parseEnvFile(`
      NEXT_PUBLIC_SITE_URL=https://exam.example
      SEB_SESSION_SECRET=$SEB_SESSION_SECRET
    `)
    expect(parsed.values).toEqual({})
    expect(parsed.warnings).toEqual([
      { line: 3, reason: 'cyclic variable expansion' },
    ])
  })

  it('resolves nested and self-referencing fallbacks like Next.js', () => {
    const fallback = '1'.repeat(32)
    const parsed = parseEnvFile(`
      NESTED=\${OUTER_MISSING:-\${INNER_MISSING_VARIABLE_NAME_LONG_ENOUGH_FOR_THIRTY_TWO}}
      SEB_SESSION_SECRET=\${SEB_SESSION_SECRET:-${fallback}}
    `)
    expect(parsed.values).toMatchObject({
      NESTED: '',
      SEB_SESSION_SECRET: fallback,
    })
    expect(inspect(validEnvironment({
      SEB_SESSION_SECRET: parsed.values.NESTED,
    })).appReadiness.sessionSecretReady).toBe(false)
    expect(inspect(validEnvironment({
      SEB_SESSION_SECRET: parsed.values.SEB_SESSION_SECRET,
    })).appReadiness.sessionSecretReady).toBe(true)
  })

  it('lets later references observe earlier escaped-dollar expansion', () => {
    const parsed = parseEnvFile(`
      LITERAL=\\\$MISSING_VARIABLE_NAME_LONG_ENOUGH_FOR_THIRTY_TWO
      SEB_SESSION_SECRET=\$LITERAL
    `)
    expect(parsed.values).toMatchObject({
      LITERAL: '$MISSING_VARIABLE_NAME_LONG_ENOUGH_FOR_THIRTY_TWO',
      SEB_SESSION_SECRET: '',
    })
    expect(inspect(validEnvironment({
      SEB_SESSION_SECRET: parsed.values.SEB_SESSION_SECRET,
    })).appReadiness.sessionSecretReady).toBe(false)
  })
})

describe('SEB production readiness', () => {
  it('accepts a complete revision-bound production configuration', () => {
    const result = inspect(validEnvironment())
    expect(result.ready).toBe(true)
    expect(result.appReadiness.browserExamKeyCount).toBe(4)
    expect(result.checks).not.toContainEqual(expect.objectContaining({ status: 'blocker' }))
  })

  it('blocks HTTP origins and an invalid configured .seb URL', () => {
    const result = inspect(validEnvironment({
      NEXT_PUBLIC_SITE_URL: 'http://exam.example',
      NEXT_PUBLIC_SEB_CONFIG_URL: 'https://exam.example/config.json',
    }))
    expect(result.ready).toBe(false)
    expect(result.checks.filter(check => check.status === 'blocker')).toHaveLength(2)
  })

  it('rejects non-canonical or credential-bearing public URLs', () => {
    for (const siteUrl of [
      'https://exam.example/',
      'https://user:password@exam.example',
      ' https://exam.example',
      'https://exam.example ',
    ]) {
      expect(inspect(validEnvironment({
        NEXT_PUBLIC_SITE_URL: siteUrl,
      })).appReadiness.siteUrlReady).toBe(false)
    }
    expect(inspect(validEnvironment({
      NEXT_PUBLIC_SEB_CONFIG_URL: 'https://user:password@exam.example/korkru.seb',
    })).appReadiness.configFileStatus).toBe('invalid')
  })

  it('allows manual .seb distribution with a non-blocking warning', () => {
    const result = inspect(validEnvironment({
      NEXT_PUBLIC_SEB_CONFIG_URL: '',
    }))
    expect(result.ready).toBe(true)
    expect(result.appReadiness.configFileStatus).toBe('manual')
    expect(result.checks).toContainEqual(expect.objectContaining({
      field: 'NEXT_PUBLIC_SEB_CONFIG_URL',
      status: 'warning',
    }))
  })

  it('stays in parity with the production rules used by lib/seb.ts', () => {
    const cases = [
      validEnvironment(),
      validEnvironment({ NEXT_PUBLIC_SITE_URL: 'http://exam.example' }),
      validEnvironment({ NEXT_PUBLIC_SEB_CONFIG_URL: '' }),
      validEnvironment({
        SEB_SESSION_SECRET: 'short',
        SEB_CONFIG_KEY: 'not-hex',
        SEB_CONFIG_REVISION: 'bad revision',
        SEB_BROWSER_EXAM_KEY_REGISTRY: keyRegistry({ configRevision: 'another-revision' }),
      }),
    ]

    for (const environment of cases) {
      expect(inspect(environment).appReadiness).toEqual(
        inspectSebReadiness({ ...environment, NODE_ENV: 'production' }, releaseRegistry()),
      )
    }
  })

  it('fails closed when build entries are duplicated or the revision differs', () => {
    const duplicateEntries = [
      { platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: BROWSER_KEY },
      { platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: 'd'.repeat(64) },
    ]
    expect(inspect(validEnvironment({
      SEB_BROWSER_EXAM_KEY_REGISTRY: keyRegistry({ entries: duplicateEntries }),
    })).ready).toBe(false)
    expect(inspect(validEnvironment({
      SEB_BROWSER_EXAM_KEY_REGISTRY: keyRegistry({ configRevision: 'another-revision' }),
    })).ready).toBe(false)
  })

  it('rejects a target mapped to the wrong SEB runtime platform', () => {
    const registry = releaseRegistry()
    registry.revisions[0].builds[2].runtimePlatform = 'macos'

    expect(inspectSebDeploymentReadiness(validEnvironment(), registry).ready).toBe(false)
    expect(inspectSebReadiness(
      { ...validEnvironment(), NODE_ENV: 'production' },
      registry,
    ).publishReady).toBe(false)
  })

  it('never includes configured values in its formatted output', () => {
    const environment = validEnvironment()
    const report = formatSebReadinessReport(
      inspect(environment).checks,
    )
    for (const value of Object.values(environment)) expect(report).not.toContain(value)
  })
})

describe('.env.local permission check', () => {
  it('accepts owner-only POSIX permissions', () => {
    expect(inspectEnvFilePermission({ exists: true, mode: 0o100600, platform: 'darwin' }))
      .toMatchObject({ status: 'pass' })
  })

  it('blocks group/other access and only warns for a missing file', () => {
    expect(inspectEnvFilePermission({ exists: true, mode: 0o100644, platform: 'linux' }))
      .toMatchObject({ status: 'blocker' })
    expect(inspectEnvFilePermission({ exists: false, mode: 0, platform: 'linux' }))
      .toMatchObject({ status: 'warning' })
  })
})
