import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingPrivateNativeOperatorCapabilityBlockedError,
  createSebStagingPrivateNativeOperatorCapability,
} from './seb-staging-private-native-operator-capability.mjs'

const IDS = Object.freeze({
  assignment: '11111111-1111-4111-8111-111111111111',
  teacher: '22222222-2222-4222-8222-222222222222',
  organization: '33333333-3333-4333-8333-333333333333',
})
const ARTIFACT_SHA256 = 'a'.repeat(64)
const RELEASE_ID = `asr-${'b'.repeat(32)}-r1-${ARTIFACT_SHA256.slice(0, 16)}`
const identity = Object.freeze({
  runId: 'seb-s5-operator-a1',
  sourceRevision: 'c'.repeat(40),
  deploymentId: 'dpl_1234567890abcdef',
  creationWindow: Object.freeze({
    notBefore: '2026-09-24T00:00:00.000Z',
    notAfter: '2026-09-25T00:00:00.000Z',
  }),
})

function environment(overrides = {}) {
  return Object.freeze({
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-for-staging-tests',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-for-staging-tests',
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
    SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS: 'true',
    ...overrides,
  })
}

function makeLedger() {
  const states = new Map([
    ['assignment-primary', {
      kind: 'assignment',
      state: 'committed',
      snapshot: Object.freeze({
        targetKey: 'assignment-primary',
        kind: 'assignment',
        targetId: IDS.assignment,
        ownerId: IDS.teacher,
        organizationId: IDS.organization,
      }),
    }],
    ['config-primary', {
      kind: 'configRevision',
      state: 'committed',
      snapshot: Object.freeze({
        targetKey: 'config-primary',
        kind: 'configRevision',
        targetId: `${IDS.assignment}:r1`,
      }),
    }],
  ])
  const publicResult = status => Object.freeze({ status })
  const methods = {
    planTarget: vi.fn(plan => {
      if (states.has(plan.targetKey)) return publicResult('failed')
      states.set(plan.targetKey, { kind: plan.kind, state: 'planned', snapshot: null })
      return publicResult('passed')
    }),
    adoptDerivedTarget: vi.fn(),
    markUncertain: vi.fn(reference => {
      const entry = states.get(reference.targetKey)
      if (!entry || entry.kind !== reference.kind || entry.state !== 'planned') {
        return publicResult('failed')
      }
      entry.state = 'uncertain'
      return publicResult('passed')
    }),
    commitTarget: vi.fn((reference, candidate) => {
      const entry = states.get(reference.targetKey)
      if (!entry || entry.kind !== reference.kind || entry.state !== 'uncertain') {
        return publicResult('failed')
      }
      entry.state = 'committed'
      entry.snapshot = candidate
      return publicResult('passed')
    }),
    reconcileTarget: vi.fn(),
    readCleanupTarget: vi.fn(reference => {
      const entry = states.get(reference.targetKey)
      if (!entry || entry.kind !== reference.kind) {
        return Object.freeze({ status: 'passed', state: 'unplanned', snapshots: Object.freeze([]) })
      }
      return Object.freeze({
        status: 'passed',
        state: entry.state,
        snapshots: Object.freeze(entry.snapshot ? [entry.snapshot] : []),
      })
    }),
    markDeleted: vi.fn(),
  }
  return { ledger: Object.freeze(methods), states }
}

function request() {
  return Object.freeze({
    schemaVersion: 1,
    stepId: 'register-assignment-seb-release',
    phase: 'teacher-setup',
    actor: 'native-operator',
    mutates: true,
    identity: Object.freeze({
      runId: identity.runId,
      sourceRevision: identity.sourceRevision,
      deploymentId: identity.deploymentId,
    }),
  })
}

function harness(overrides = {}) {
  const ledgerHarness = makeLedger()
  const admin = Object.freeze({ marker: 'admin' })
  const createClient = vi.fn(() => admin)
  const readContext = vi.fn(async () => Object.freeze({ marker: 'context' }))
  const enrollArtifact = vi.fn(async () => Object.freeze({
    release: Object.freeze({
      assignmentId: IDS.assignment,
      revision: 1,
      releaseId: RELEASE_ID,
      artifactSha256: ARTIFACT_SHA256,
      securityMode: 'test_plaintext',
      createdAt: '2026-09-24T12:00:00.000Z',
    }),
  }))
  const artifactProvider = Object.freeze({
    readNativeArtifact: vi.fn(async () => Object.freeze({
      artifactBytes: Buffer.from('synthetic-seb'),
      evidence: Object.freeze({ marker: 'native-evidence' }),
    })),
  })
  const capability = createSebStagingPrivateNativeOperatorCapability({
    runIdentity: identity,
    readEnvironment: () => environment(),
    privateRunLedger: ledgerHarness.ledger,
    serviceRoleCredentialProvider: vi.fn(async input => Object.freeze({
      schemaVersion: 1,
      targetOrigin: input.targetOrigin,
      credentialKind: 'service-role',
      namespace: input.namespace,
      serviceRoleKey: 'synthetic-service-role-secret',
    })),
    nativeArtifactProvider: artifactProvider,
    createClient,
    readContext,
    enrollArtifact,
    ...overrides,
  })
  return {
    capability,
    ledgerHarness,
    artifactProvider,
    createClient,
    readContext,
    enrollArtifact,
  }
}

describe('SEB Staging private native operator capability', () => {
  it('enrolls one exact Windows artifact and records only redacted release targets', async () => {
    const subject = harness()
    await expect(subject.capability.executeStep(request())).resolves.toEqual({
      stepId: 'register-assignment-seb-release',
      status: 'passed',
      releaseIdentity: {
        releaseId: RELEASE_ID,
        releaseRevision: 1,
        artifactSha256: ARTIFACT_SHA256,
      },
    })
    expect(subject.artifactProvider.readNativeArtifact).toHaveBeenCalledWith(
      {
        targetOrigin: 'https://staging.korkru.com',
        namespace: `qa:${identity.runId}`,
        assignmentId: IDS.assignment,
        revision: 1,
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(subject.readContext).toHaveBeenCalledWith(
      expect.objectContaining({ marker: 'admin' }), IDS.assignment, 1,
    )
    expect(subject.enrollArtifact).toHaveBeenCalledTimes(1)
    expect(subject.ledgerHarness.states.get('release-primary')).toMatchObject({
      state: 'committed',
      snapshot: { targetId: RELEASE_ID },
    })
    expect(subject.ledgerHarness.states.get('assignment-artifact')).toMatchObject({
      state: 'committed',
      snapshot: {
        targetId: `assignments/${IDS.assignment}/r1/${ARTIFACT_SHA256}.seb`,
      },
    })
    expect(JSON.stringify(await subject.capability.executeStep(request())))
      .not.toContain('synthetic-service-role-secret')
  })

  it('fails closed and leaves both targets uncertain when native evidence is unavailable', async () => {
    const subject = harness({
      nativeArtifactProvider: Object.freeze({
        readNativeArtifact: vi.fn(async () => Object.freeze({ artifactBytes: Buffer.alloc(0), evidence: null })),
      }),
    })
    await expect(subject.capability.executeStep(request())).resolves.toEqual({
      stepId: 'register-assignment-seb-release',
      status: 'failed',
    })
    expect(subject.ledgerHarness.states.get('release-primary').state).toBe('uncertain')
    expect(subject.ledgerHarness.states.get('assignment-artifact').state).toBe('uncertain')
    expect(subject.enrollArtifact).not.toHaveBeenCalled()
  })

  it('is single-use and rejects malformed requests', async () => {
    const subject = harness()
    await expect(subject.capability.executeStep(Object.freeze({}))).resolves.toEqual({
      stepId: 'register-assignment-seb-release',
      status: 'failed',
    })
    await expect(subject.capability.executeStep(request())).resolves.toMatchObject({
      stepId: 'register-assignment-seb-release',
      status: 'passed',
    })
    await expect(subject.capability.executeStep(request())).resolves.toEqual({
      stepId: 'register-assignment-seb-release',
      status: 'failed',
    })
  })

  it('blocks construction outside the exact isolated Staging policy', () => {
    expect(() => harness({
      readEnvironment: () => environment({ VERCEL_ENV: 'production' }),
    })).toThrow(SebStagingPrivateNativeOperatorCapabilityBlockedError)
  })
})
