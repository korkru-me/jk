import { describe, expect, it } from 'vitest'

import { buildSebStagingMockHarnessPlan } from './seb-staging-mock-harness-core.mjs'
import {
  inspectTrustedSebStagingLiveHarnessResult,
  runSebStagingLiveHarness,
} from './seb-staging-live-runner.mjs'

const ARTIFACT_SHA256 = 'a'.repeat(64)

function validEnvironment(overrides = {}) {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://www.korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-long-enough-for-staging',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-long-enough-for-staging',
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
    EXAM_QA_SEB_TIME_CONTROL: 'true',
    ...overrides,
  }
}

function executablePlan() {
  return buildSebStagingMockHarnessPlan({
    environment: validEnvironment(),
    mode: 'execute',
    runId: 'seb-s5-run-20260923',
    writeConfirmation: 'CONFIRM_SYNTHETIC_SEB_STAGING_WRITE',
  })
}

function inspectPlan() {
  return buildSebStagingMockHarnessPlan({
    environment: validEnvironment(),
    mode: 'inspect',
    runId: 'seb-s5-run-20260923',
  })
}

function identity(overrides = {}) {
  return {
    runId: 'seb-s5-run-20260923',
    sourceRevision: 'b'.repeat(40),
    deploymentId: `dpl_${'C'.repeat(24)}`,
    releaseId: `asr-${'1'.repeat(32)}-r3-${ARTIFACT_SHA256.slice(0, 16)}`,
    releaseRevision: 3,
    artifactSha256: ARTIFACT_SHA256,
    ...overrides,
  }
}

function runIdentity(overrides = {}) {
  return {
    runId: 'seb-s5-run-20260923',
    sourceRevision: 'b'.repeat(40),
    deploymentId: `dpl_${'C'.repeat(24)}`,
    ...overrides,
  }
}

function releaseIdentity(overrides = {}) {
  const full = identity()
  return {
    releaseId: full.releaseId,
    releaseRevision: full.releaseRevision,
    artifactSha256: full.artifactSha256,
    ...overrides,
  }
}

function passingAdapter(calls, customize = null) {
  return {
    async executeStep(request) {
      calls.push(request.stepId)
      const customized = customize?.(request)
      const response = customized ?? {
        stepId: request.stepId,
        status: 'passed',
      }
      return request.stepId === 'register-assignment-seb-release'
        && response.status === 'passed'
        && !Object.hasOwn(response, 'releaseIdentity')
        ? { ...response, releaseIdentity: releaseIdentity() }
        : response
    },
  }
}

describe('SEB Staging live runner', () => {
  it('executes the issued next step sequence and returns identity-bound coarse evidence', async () => {
    const plan = executablePlan()
    const calls = []
    const output = await runSebStagingLiveHarness({
      plan,
      identity: runIdentity(),
      adapter: passingAdapter(calls),
    })

    expect(calls).toEqual(plan.steps.map(step => step.id))
    expect(output.status).toBe('complete')
    expect(new Set(Object.values(output.stepEvidence))).toEqual(new Set(['passed']))
    expect(output.bindingSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(output.identity).toEqual(identity())
    expect(Object.isFrozen(output)).toBe(true)
    expect(Object.isFrozen(output.identity)).toBe(true)
    expect(Object.isFrozen(output.stepEvidence)).toBe(true)
    expect(inspectTrustedSebStagingLiveHarnessResult(output)).toBe(output)
    expect(inspectTrustedSebStagingLiveHarnessResult({ ...output })).toBeNull()
  })

  it('stops on the first mutating failure and still attempts only exact cleanup', async () => {
    const plan = executablePlan()
    const calls = []
    const output = await runSebStagingLiveHarness({
      plan,
      identity: identity(),
      adapter: passingAdapter(calls, request => (
        request.stepId === 'provision-synthetic-teacher'
          ? { stepId: request.stepId, status: 'failed' }
          : { stepId: request.stepId, status: 'passed' }
      )),
    })

    expect(calls).toEqual([
      'verify-staging-isolation',
      'reserve-unique-run-id',
      'provision-synthetic-teacher',
      'cleanup-synthetic-fixture',
    ])
    expect(output.status).toBe('failed')
    expect(output.stepEvidence['provision-synthetic-teacher']).toBe('failed')
    expect(output.stepEvidence['cleanup-synthetic-fixture']).toBe('passed')
    expect(output.stepEvidence['provision-unrelated-teacher']).toBe('pending')
  })

  it('never executes a premature inspect plan or a forged clone', async () => {
    const calls = []
    const adapter = passingAdapter(calls)
    const readOnly = await runSebStagingLiveHarness({
      plan: inspectPlan(),
      identity: identity(),
      adapter,
    })
    expect(readOnly.status).toBe('inspect-only')
    expect(calls).toEqual([])

    const issued = executablePlan()
    const forged = { ...issued, executionAuthorized: true }
    const blocked = await runSebStagingLiveHarness({
      plan: forged,
      identity: identity(),
      adapter,
    })
    expect(blocked.status).toBe('blocked')
    expect(blocked.identity).toBeNull()
    expect(calls).toEqual([])
  })

  it('redacts an adapter exception payload while stopping and cleaning up', async () => {
    const plan = executablePlan()
    const calls = []
    const secretSentinel = 'SERVICE_ROLE_SECRET_SENTINEL_DO_NOT_PRINT'
    const output = await runSebStagingLiveHarness({
      plan,
      identity: identity(),
      adapter: passingAdapter(calls, request => {
        if (request.stepId === 'authenticate-teacher') throw new Error(secretSentinel)
        return { stepId: request.stepId, status: 'passed' }
      }),
    })

    expect(output.status).toBe('failed')
    expect(calls.at(-1)).toBe('cleanup-synthetic-fixture')
    expect(JSON.stringify(output)).not.toContain(secretSentinel)
    expect(Object.values(output.stepEvidence)).toEqual(expect.arrayContaining(['failed', 'passed', 'pending']))
  })

  it('rejects adapter payload fields instead of copying them into evidence', async () => {
    const secretSentinel = 'ADAPTER_PAYLOAD_SECRET_SENTINEL'
    const output = await runSebStagingLiveHarness({
      plan: executablePlan(),
      identity: identity(),
      adapter: {
        async executeStep(request) {
          return {
            stepId: request.stepId,
            status: 'passed',
            payload: { token: secretSentinel },
            ...(request.stepId === 'register-assignment-seb-release'
              ? { releaseIdentity: releaseIdentity() }
              : {}),
          }
        },
      },
    })

    expect(output.status).toBe('failed')
    expect(JSON.stringify(output)).not.toContain(secretSentinel)
    expect(output.stepEvidence['verify-staging-isolation']).toBe('failed')
    expect(output.stepEvidence['reserve-unique-run-id']).toBe('pending')
  })

  it('rejects a wrong step result without advancing out of order', async () => {
    const plan = executablePlan()
    const calls = []
    const output = await runSebStagingLiveHarness({
      plan,
      identity: identity(),
      adapter: passingAdapter(calls, request => ({
        stepId: plan.steps[1].id,
        status: request.stepId === plan.steps[0].id ? 'passed' : 'failed',
      })),
    })

    expect(calls).toEqual(['verify-staging-isolation'])
    expect(output.status).toBe('failed')
    expect(output.stepEvidence['verify-staging-isolation']).toBe('failed')
    expect(output.stepEvidence['provision-synthetic-teacher']).toBe('pending')
    expect(output.stepEvidence['cleanup-synthetic-fixture']).toBe('pending')
  })

  it('validates the identity schema and cross-field binding before execution', async () => {
    const cases = [
      identity({ sourceRevision: 'B'.repeat(40) }),
      identity({ deploymentId: 'https://staging.korkru.com' }),
      identity({ runId: 'seb-s5-different-run' }),
      identity({ releaseRevision: 4 }),
      identity({
        releaseId: `asr-${'1'.repeat(32)}-r9999999999-${ARTIFACT_SHA256.slice(0, 16)}`,
        releaseRevision: 9_999_999_999,
      }),
      identity({ artifactSha256: 'c'.repeat(64) }),
      { ...identity(), unexpectedSecret: 'IDENTITY_SECRET_SENTINEL' },
    ]

    for (const manifest of cases) {
      const calls = []
      const output = await runSebStagingLiveHarness({
        plan: executablePlan(),
        identity: manifest,
        adapter: passingAdapter(calls),
      })
      expect(output.status).toBe('blocked')
      expect(output.identity).toBeNull()
      expect(calls).toEqual([])
      expect(JSON.stringify(output)).not.toContain('IDENTITY_SECRET_SENTINEL')
    }
  })

  it('fails at release registration when the adapter omits or changes the exact binding', async () => {
    for (const returnedRelease of [
      null,
      releaseIdentity({ artifactSha256: 'c'.repeat(64) }),
      releaseIdentity({ releaseRevision: 4 }),
    ]) {
      const calls = []
      const output = await runSebStagingLiveHarness({
        plan: executablePlan(),
        identity: identity(),
        adapter: passingAdapter(calls, request => {
          if (request.stepId !== 'register-assignment-seb-release') {
            return { stepId: request.stepId, status: 'passed' }
          }
          return {
            stepId: request.stepId,
            status: 'passed',
            releaseIdentity: returnedRelease,
          }
        }),
      })

      expect(output.status).toBe('failed')
      expect(output.stepEvidence['register-assignment-seb-release']).toBe('failed')
      expect(calls.at(-1)).toBe('cleanup-synthetic-fixture')
    }
  })

  it('bounds cleanup retries and records a persistent failure without exposing adapter details', async () => {
    const plan = executablePlan()
    const calls = []
    const output = await runSebStagingLiveHarness({
      plan,
      identity: identity(),
      adapter: passingAdapter(calls, request => (
        request.stepId === plan.cleanupStepId
          ? { stepId: request.stepId, status: 'failed' }
          : { stepId: request.stepId, status: 'passed' }
      )),
    })

    expect(calls.filter(stepId => stepId === plan.cleanupStepId)).toHaveLength(3)
    expect(output.status).toBe('cleanup-failed')
    expect(output.stepEvidence[plan.cleanupStepId]).toBe('failed')
  })

  it('recovers from a transient cleanup failure inside the same run', async () => {
    const plan = executablePlan()
    const calls = []
    let cleanupAttempt = 0
    const output = await runSebStagingLiveHarness({
      plan,
      identity: identity(),
      adapter: passingAdapter(calls, request => {
        if (request.stepId !== plan.cleanupStepId) {
          return { stepId: request.stepId, status: 'passed' }
        }
        cleanupAttempt += 1
        return {
          stepId: request.stepId,
          status: cleanupAttempt === 1 ? 'failed' : 'passed',
        }
      }),
    })

    expect(calls.filter(stepId => stepId === plan.cleanupStepId)).toHaveLength(2)
    expect(output.status).toBe('complete')
    expect(output.stepEvidence[plan.cleanupStepId]).toBe('passed')
  })

  it('does not require or invoke an adapter in inspect-only mode', async () => {
    const plan = inspectPlan()
    const output = await runSebStagingLiveHarness({
      plan,
      identity: identity(),
    })

    expect(output.status).toBe('inspect-only')
    expect(new Set(Object.values(output.stepEvidence))).toEqual(new Set(['pending']))
  })
})
