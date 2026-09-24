import { describe, expect, it, vi } from 'vitest'

import { buildSebStagingMockHarnessPlan } from './seb-staging-mock-harness-core.mjs'
import {
  SebStagingPrivateLiveHarnessBlockedError,
  createSebStagingPrivateLiveHarness,
} from './seb-staging-private-live-harness.mjs'

const SOURCE_REVISION = 'a'.repeat(40)
const DEPLOYMENT_ID = `dpl_${'B'.repeat(24)}`
const ARTIFACT_SHA256 = 'c'.repeat(64)
const RELEASE_IDENTITY = Object.freeze({
  releaseId: `asr-${'d'.repeat(32)}-r1-${ARTIFACT_SHA256.slice(0, 16)}`,
  releaseRevision: 1,
  artifactSha256: ARTIFACT_SHA256,
})

function environment() {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging', EXAM_QA_ENVIRONMENT: 'staging', VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://korkru.com',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-key-long-enough',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-long-enough',
    EXAM_QA_DATA_POLICY: 'synthetic-only', EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true', EXAM_QA_SEB_TIME_CONTROL: 'true',
  }
}

function capability(override = null) {
  return Object.freeze({
    executeStep: vi.fn(async request => override
      ? override(request)
      : Object.freeze({ stepId: request.stepId, status: 'passed' })),
  })
}

function harness({ browserOverride, persistStatus = 'passed' } = {}) {
  const runId = 'seb-s5-private-a1'
  const plan = buildSebStagingMockHarnessPlan({
    environment: environment(), mode: 'execute', runId,
    writeConfirmation: 'CONFIRM_SYNTHETIC_SEB_STAGING_WRITE',
  })
  const preflightCapability = Object.freeze({
    attest: vi.fn(async () => Object.freeze({
      siteOrigin: 'https://staging.korkru.com',
      supabaseOrigin: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
      sourceRevision: SOURCE_REVISION,
      deploymentId: DEPLOYMENT_ID,
      branchRef: 'staging',
      readyState: 'READY',
    })),
    closeAll: vi.fn(async () => Object.freeze({ status: 'passed' })),
  })
  const evidenceSink = Object.freeze({
    persistFinalEvidence: vi.fn(async () => Object.freeze({ status: persistStatus })),
    closeAll: vi.fn(async () => Object.freeze({ status: 'passed' })),
  })
  const subject = createSebStagingPrivateLiveHarness({
    plan,
    identity: Object.freeze({ runId, sourceRevision: SOURCE_REVISION, deploymentId: DEPLOYMENT_ID }),
    preflightCapability,
    fixtureAdapter: capability(),
    browserDataCapability: capability(browserOverride),
    nativeOperatorCapability: capability(request => Object.freeze({
      stepId: request.stepId,
      status: 'passed',
      releaseIdentity: RELEASE_IDENTITY,
    })),
    expiryControlCapability: capability(),
    runReservationCapability: capability(),
    evidenceSink,
  })
  return { subject, evidenceSink }
}

describe('SEB Staging private live harness', () => {
  it('runs the canonical composite and persists one terminal redacted record', async () => {
    const { subject, evidenceSink } = harness()
    const publicResult = await subject.run()
    const trustedResult = evidenceSink.persistFinalEvidence.mock.calls[0]?.[0]?.result
    expect(trustedResult.stepEvidence).toEqual(Object.fromEntries(
      evidenceSink.persistFinalEvidence.mock.calls[0][0].plan.steps.map(step => [step.id, 'passed']),
    ))
    expect(trustedResult).toMatchObject({ status: 'complete' })
    expect(publicResult).toEqual({ status: 'passed', runStatus: 'complete' })
    expect(evidenceSink.persistFinalEvidence).toHaveBeenCalledTimes(1)
    expect(evidenceSink.closeAll).toHaveBeenCalledTimes(1)
    await expect(subject.run()).resolves.toEqual({ status: 'failed', runStatus: 'blocked' })
  })

  it('reports failure when the journey or durable evidence fails', async () => {
    const journey = harness({
      browserOverride: request => Object.freeze({ stepId: request.stepId, status: 'failed' }),
    })
    await expect(journey.subject.run()).resolves.toMatchObject({ status: 'failed', runStatus: 'failed' })

    const evidence = harness({ persistStatus: 'failed' })
    await expect(evidence.subject.run()).resolves.toEqual({ status: 'failed', runStatus: 'complete' })
  })

  it('blocks malformed capabilities before issuing any step', () => {
    expect(() => createSebStagingPrivateLiveHarness({}))
      .toThrow(SebStagingPrivateLiveHarnessBlockedError)
  })
})
