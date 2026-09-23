import { describe, expect, it } from 'vitest'
import {
  buildSebStagingMockHarnessPlan,
  formatSebStagingMockHarnessReport,
  inspectSebStagingMockHarnessEvidence,
} from './seb-staging-mock-harness-core.mjs'

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
    ...overrides,
  }
}

function executablePlan(overrides = {}) {
  return buildSebStagingMockHarnessPlan({
    environment: validEnvironment({ EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true' }),
    mode: 'execute',
    runId: 'seb-s5-run-20260923',
    writeConfirmation: 'CONFIRM_SYNTHETIC_SEB_STAGING_WRITE',
    ...overrides,
  })
}

function passedEvidenceThrough(plan, lastStepId) {
  const evidence = {}
  for (const current of plan.steps) {
    evidence[current.id] = 'passed'
    if (current.id === lastStepId) break
  }
  return evidence
}

describe('SEB Staging synthetic mock harness', () => {
  it('is read-only by default even when the environment permits synthetic writes', () => {
    const plan = buildSebStagingMockHarnessPlan({
      environment: validEnvironment({ EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true' }),
    })

    expect(plan.ready).toBe(true)
    expect(plan.mode).toBe('inspect')
    expect(plan.readOnly).toBe(true)
    expect(plan.executionAuthorized).toBe(false)
    expect(plan.fixture.namespace).toBe('qa:seb-s5-preview')
  })

  it('requires isolated official Staging plus a two-part explicit write opt-in', () => {
    expect(executablePlan().executionAuthorized).toBe(true)

    for (const override of [
      { writeConfirmation: '' },
      { runId: 'seb-s5-preview' },
      { environment: validEnvironment() },
    ]) {
      const plan = executablePlan(override)
      expect(plan.ready).toBe(false)
      expect(plan.executionAuthorized).toBe(false)
      expect(plan.readOnly).toBe(true)
    }
  })

  it('does not trust a cloned or mutated inspect plan as write authorization', () => {
    const inspectPlan = buildSebStagingMockHarnessPlan({ environment: validEnvironment() })
    expect(Object.isFrozen(inspectPlan)).toBe(true)
    expect(() => {
      inspectPlan.executionAuthorized = true
    }).toThrow()

    const forged = {
      ...inspectPlan,
      mode: 'execute',
      readOnly: false,
      ready: true,
      executionAuthorized: true,
    }
    const allPassed = Object.fromEntries(inspectPlan.steps.map(value => [value.id, 'passed']))
    const state = inspectSebStagingMockHarnessEvidence(forged, allPassed)
    expect(state.status).toBe('blocked')
    expect(state.ready).toBe(false)
    expect(state.nextStepIds).toEqual([])
  })

  it('fails closed for Production, a non-official site, or a reused project', () => {
    const environments = [
      validEnvironment({
        KORKRU_DEPLOYMENT_ENV: 'production',
        VERCEL_ENV: 'production',
      }),
      validEnvironment({ NEXT_PUBLIC_SITE_URL: 'https://preview.example.test' }),
      validEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'https://production-project.supabase.co' }),
      validEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: 'https://production-project.supabase.co',
        EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://decoy-project.supabase.co',
      }),
    ]

    for (const environment of environments) {
      const plan = buildSebStagingMockHarnessPlan({ environment })
      expect(plan.ready).toBe(false)
      expect(plan.executionAuthorized).toBe(false)
      expect(plan.readOnly).toBe(true)
    }
  })

  it('requires an explicit synthetic-only policy and a QA-scoped run id', () => {
    for (const input of [
      { environment: validEnvironment({ EXAM_QA_DATA_POLICY: '' }) },
      { environment: validEnvironment({ EXAM_QA_COPY_PRODUCTION_DATA: 'true' }) },
    ]) {
      const plan = buildSebStagingMockHarnessPlan(input)
      expect(plan.ready).toBe(false)
      expect(plan.executionAuthorized).toBe(false)
    }

    for (const runId of ['seb-s5-production-copy', 'teacher@example.com']) {
      const plan = buildSebStagingMockHarnessPlan({
        environment: validEnvironment(),
        runId,
      })
      expect(plan.ready).toBe(false)
      expect(plan.fixture.namespace).toBeNull()
    }
  })

  it('plans isolated owner and outsider accounts plus one classroom and SEB assignment', () => {
    const plan = buildSebStagingMockHarnessPlan({ environment: validEnvironment() })
    expect(plan.fixture.policy).toBe('synthetic-only')
    expect(plan.fixture.credentials).toBe('runtime-only')
    expect(plan.fixture.entities.map(value => [value.kind, value.count])).toEqual([
      ['teacher', 2],
      ['student', 2],
      ['classroom', 1],
      ['assignment', 1],
    ])
    expect(plan.fixture.entities[0].aliases).toEqual(['teacher-primary', 'teacher-unrelated'])
    expect(plan.fixture.entities[1].aliases).toEqual(['student-primary', 'student-secondary'])
    expect(Object.isFrozen(plan.fixture.entities[0].aliases)).toBe(true)
    expect(Object.isFrozen(plan.fixture.entities[1].aliases)).toBe(true)
    expect(plan.fixture.entities.at(-1)).toMatchObject({
      secureBrowserMode: 'seb_required',
      initialStatus: 'draft',
      entryPassword: 'forbidden',
      quitPassword: 'teacher-owned-runtime-secret',
    })
  })

  it('covers the authenticated journey and both authorization directions', () => {
    const plan = buildSebStagingMockHarnessPlan({ environment: validEnvironment() })
    const ids = plan.steps.map(value => value.id)

    expect(ids).toEqual(expect.arrayContaining([
      'authenticate-student',
      'reject-invalid-seb-challenge',
      'reject-expired-seb-challenge',
      'verify-seb-system-check',
      'reject-replayed-seb-challenge',
      'reject-invalid-seb-session',
      'reject-expired-seb-session',
      'start-revision-bound-attempt',
      'reject-replayed-seb-session',
      'autosave-synthetic-answer',
      'retry-autosave-after-transient-failure',
      'resume-same-attempt',
      'upload-synthetic-attachment',
      'retry-upload-after-transient-failure',
      'record-proctor-heartbeat',
      'submit-attempt',
      'teacher-read-submitted-result',
      'student-denied-teacher-result',
      'authenticate-secondary-student',
      'secondary-student-denied-primary-attempt',
      'authenticate-unrelated-teacher',
      'unrelated-teacher-denied-assignment-result',
      'verify-cross-account-boundaries',
      'cleanup-synthetic-fixture',
    ]))
    expect(new Set(ids).size).toBe(ids.length)
    expect(plan.steps.at(-1)).toMatchObject({
      id: 'cleanup-synthetic-fixture',
      runOnFailure: true,
    })
  })

  it('never returns or reports configured values and secret sentinels', () => {
    const sentinels = {
      NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
      EXAM_QA_PRODUCTION_SITE_URL: 'https://production-secret.example',
      NEXT_PUBLIC_SUPABASE_URL: 'https://staging-secret-ref.supabase.co',
      EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-secret-ref.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-SENTINEL-never-print-this',
      SUPABASE_SERVICE_ROLE_KEY: 'service-SENTINEL-never-print-this',
    }
    const plan = buildSebStagingMockHarnessPlan({
      environment: validEnvironment(sentinels),
      writeConfirmation: 'confirmation-SENTINEL-never-print-this',
    })
    const serialized = JSON.stringify(plan)
    const report = formatSebStagingMockHarnessReport(plan)

    for (const [field, value] of Object.entries(sentinels)) {
      if (field === 'NEXT_PUBLIC_SITE_URL') continue
      expect(serialized).not.toContain(value)
      expect(report).not.toContain(value)
    }
    expect(serialized).not.toContain('confirmation-SENTINEL-never-print-this')
    expect(report).not.toContain('confirmation-SENTINEL-never-print-this')
  })

  it('advances only to the first dependency-ready step', () => {
    const plan = executablePlan()
    const initial = inspectSebStagingMockHarnessEvidence(plan)
    expect(initial.status).toBe('ready')
    expect(initial.nextStepIds).toEqual(['verify-staging-isolation'])

    const partial = inspectSebStagingMockHarnessEvidence(
      plan,
      passedEvidenceThrough(plan, 'provision-synthetic-student'),
    )
    expect(partial.ready).toBe(true)
    expect(partial.nextStepIds).toEqual(['provision-secondary-student'])
  })

  it('blocks malformed or out-of-order evidence without echoing unknown values', () => {
    const plan = executablePlan()
    const cases = [
      { 'unknown-secret-step': 'passed' },
      { 'verify-staging-isolation': 'sentinel-secret-state' },
      { 'authenticate-teacher': 'passed' },
    ]

    for (const evidence of cases) {
      const state = inspectSebStagingMockHarnessEvidence(plan, evidence)
      const serialized = JSON.stringify(state)
      expect(state.status).toBe('blocked')
      expect(state.nextStepIds).toEqual([])
      expect(serialized).not.toContain('unknown-secret-step')
      expect(serialized).not.toContain('sentinel-secret-state')
    }
  })

  it('stops a failed journey and exposes only scoped cleanup after data exists', () => {
    const plan = executablePlan()
    const evidence = passedEvidenceThrough(plan, 'create-subject-classroom')
    evidence['enrol-synthetic-student'] = 'failed'

    const state = inspectSebStagingMockHarnessEvidence(plan, evidence)
    expect(state.ready).toBe(false)
    expect(state.status).toBe('cleanup-required')
    expect(state.nextStepIds).toEqual(['cleanup-synthetic-fixture'])
    expect(state.failedStepIds).toEqual(['enrol-synthetic-student'])
  })

  it('does not report an inspect-only all-passed snapshot as complete', () => {
    const plan = buildSebStagingMockHarnessPlan({ environment: validEnvironment() })
    const evidence = Object.fromEntries(plan.steps.map(value => [value.id, 'passed']))

    const state = inspectSebStagingMockHarnessEvidence(plan, evidence)
    expect(state.ready).toBe(false)
    expect(state.status).toBe('inspect-only')
    expect(state.nextStepIds).toEqual([])
  })

  it('blocks cleanup recorded before the journey and never exposes a later mutation', () => {
    const plan = executablePlan()
    const evidence = { 'cleanup-synthetic-fixture': 'passed' }

    const beforeJourney = inspectSebStagingMockHarnessEvidence(plan, evidence)
    expect(beforeJourney.ready).toBe(false)
    expect(beforeJourney.status).toBe('blocked')
    expect(beforeJourney.nextStepIds).toEqual([])

    evidence['verify-staging-isolation'] = 'passed'
    const afterReadOnlyPreflight = inspectSebStagingMockHarnessEvidence(plan, evidence)
    expect(afterReadOnlyPreflight.ready).toBe(false)
    expect(afterReadOnlyPreflight.status).toBe('blocked')
    expect(afterReadOnlyPreflight.nextStepIds).toEqual([])
  })

  it('finishes only after every journey step and cleanup have passed', () => {
    const plan = executablePlan()
    const journeyEvidence = passedEvidenceThrough(plan, 'verify-cross-account-boundaries')
    const beforeCleanup = inspectSebStagingMockHarnessEvidence(plan, journeyEvidence)
    expect(beforeCleanup.status).toBe('ready')
    expect(beforeCleanup.nextStepIds).toEqual(['cleanup-synthetic-fixture'])

    journeyEvidence['cleanup-synthetic-fixture'] = 'passed'
    const complete = inspectSebStagingMockHarnessEvidence(plan, journeyEvidence)
    expect(complete.status).toBe('complete')
    expect(complete.ready).toBe(true)
    expect(complete.pendingStepCount).toBe(0)
    expect(complete.nextStepIds).toEqual([])
  })
})
