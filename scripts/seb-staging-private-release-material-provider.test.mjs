import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingPrivateReleaseMaterialProviderBlockedError,
  createSebStagingPrivateReleaseMaterialProvider,
} from './seb-staging-private-release-material-provider.mjs'

const assignmentId = '11111111-1111-4111-8111-111111111111'
const artifact = 'b'.repeat(64)
const releaseId = `asr-${'a'.repeat(32)}-r1-${artifact.slice(0, 16)}`
const identity = Object.freeze({
  runId: 'seb-s5-material-a1',
  sourceRevision: 'c'.repeat(40),
  deploymentId: 'dpl_1234567890abcdef',
  creationWindow: Object.freeze({
    notBefore: '2026-09-24T00:00:00.000Z',
    notAfter: '2026-09-25T00:00:00.000Z',
  }),
})

function environment(overrides = {}) {
  return Object.freeze({
    KORKRU_DEPLOYMENT_ENV: 'staging', EXAM_QA_ENVIRONMENT: 'staging', VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    EXAM_QA_DATA_POLICY: 'synthetic-only', EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true', ...overrides,
  })
}

function request() {
  return Object.freeze({
    targetOrigin: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    namespace: `qa:${identity.runId}`,
    assignmentId,
    releaseId,
    releaseRevision: 1,
    platform: 'windows',
    versionString: '3.10.2',
    buildNumber: '920',
  })
}

function harness(overrides = {}) {
  const fetchImplementation = vi.fn(async () => ({
    status: 200,
    json: async () => [{
      assignment_id: assignmentId,
      revision: 1,
      release_id: releaseId,
      config_key: 'd'.repeat(64),
      browser_exam_keys: [{
        platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: 'e'.repeat(64),
      }],
    }],
  }))
  const provider = createSebStagingPrivateReleaseMaterialProvider({
    runIdentity: identity,
    readEnvironment: () => environment(),
    serviceRoleCredentialProvider: vi.fn(async input => Object.freeze({
      schemaVersion: 1,
      targetOrigin: input.targetOrigin,
      credentialKind: 'service-role',
      namespace: input.namespace,
      serviceRoleKey: 'secret-service-role-key-value',
    })),
    fetchImplementation,
    ...overrides,
  })
  return { provider, fetchImplementation }
}

describe('SEB Staging private release material provider', () => {
  it('reads one exact Windows release and caches it without a second credential request', async () => {
    const { provider, fetchImplementation } = harness()
    const options = Object.freeze({ signal: new AbortController().signal })
    const first = await provider.readReleaseMaterial(request(), options)
    const second = await provider.readReleaseMaterial(request(), options)
    expect(first).toEqual({
      releaseId,
      releaseRevision: 1,
      configKey: 'd'.repeat(64),
      browserExamKey: 'e'.repeat(64),
      version: 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser',
    })
    expect(second).toBe(first)
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    const [, init] = fetchImplementation.mock.calls[0]
    expect(init.headers.Authorization).not.toContain('d'.repeat(64))
    expect(init.headers.Authorization).not.toContain('e'.repeat(64))
  })

  it('fails closed on duplicate rows or missing exact build material', async () => {
    const duplicate = harness({
      fetchImplementation: vi.fn(async () => ({ status: 200, json: async () => [{}, {}] })),
    }).provider
    await expect(duplicate.readReleaseMaterial(
      request(), Object.freeze({ signal: new AbortController().signal }),
    )).rejects.toThrow(SebStagingPrivateReleaseMaterialProviderBlockedError)
  })

  it('blocks construction outside isolated Staging', () => {
    expect(() => harness({
      readEnvironment: () => environment({ VERCEL_ENV: 'production' }),
    })).toThrow(SebStagingPrivateReleaseMaterialProviderBlockedError)
  })
})
