import { createHash } from 'node:crypto'
import { mkdirSync, renameSync, symlinkSync } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { buildSebStagingMockHarnessPlan } from './seb-staging-mock-harness-core.mjs'
import {
  SebStagingDurableEvidenceSinkBlockedError,
  createSebStagingDurableEvidenceSink,
} from './seb-staging-durable-evidence-sink.mjs'
import { runSebStagingLiveHarness } from './seb-staging-live-runner.mjs'

const roots = []
const sinks = []

function environment(overrides = {}) {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://www.korkru.com',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'staging-anon-key-long-enough',
    SUPABASE_SERVICE_ROLE_KEY: 'staging-service-role-key-long-enough',
    EXAM_QA_SEB_TIME_CONTROL: 'true',
    ...overrides,
  }
}

function plan() {
  return buildSebStagingMockHarnessPlan({
    environment: environment(),
    mode: 'execute',
    runId: 'seb-s5-evidence-20260924',
    writeConfirmation: 'CONFIRM_SYNTHETIC_SEB_STAGING_WRITE',
  })
}

function identity() {
  const artifactSha256 = 'a'.repeat(64)
  return {
    runId: 'seb-s5-evidence-20260924',
    sourceRevision: 'b'.repeat(40),
    deploymentId: 'dpl_1234567890abcdef',
    releaseId: `asr-${'c'.repeat(32)}-r1-${artifactSha256.slice(0, 16)}`,
    releaseRevision: 1,
    artifactSha256,
  }
}

async function finalResult(currentPlan, {
  failStep = null,
  failCleanup = false,
} = {}) {
  return runSebStagingLiveHarness({
    plan: currentPlan,
    identity: identity(),
    adapter: {
      async executeStep(request) {
        if (request.stepId === currentPlan.cleanupStepId && failCleanup) {
          return { stepId: request.stepId, status: 'failed' }
        }
        if (request.stepId === failStep) {
          return { stepId: request.stepId, status: 'failed' }
        }
        return request.stepId === 'register-assignment-seb-release'
          ? {
              stepId: request.stepId,
              status: 'passed',
              releaseIdentity: {
                releaseId: identity().releaseId,
                releaseRevision: identity().releaseRevision,
                artifactSha256: identity().artifactSha256,
              },
            }
          : { stepId: request.stepId, status: 'passed' }
      },
    },
  })
}

async function outputDirectory() {
  const root = await mkdtemp(join(tmpdir(), 'seb-evidence-sink-'))
  roots.push(root)
  return join(root, 'evidence')
}

async function sink(overrides = {}) {
  let currentEnvironment = environment()
  const directory = overrides.outputDirectory ?? await outputDirectory()
  const instance = await createSebStagingDurableEvidenceSink({
    readEnvironment: () => currentEnvironment,
    outputDirectory: directory,
    clock: () => new Date('2026-09-24T08:00:00.000Z'),
    randomBytes: () => new Uint8Array(16).fill(7),
    ...overrides,
  })
  sinks.push(instance)
  return {
    instance,
    directory,
    setEnvironment(value) {
      currentEnvironment = value
    },
  }
}

afterEach(async () => {
  await Promise.allSettled(sinks.splice(0).map(instance => instance.closeAll()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('SEB Staging durable evidence sink', () => {
  it('persists one immutable redacted complete result with two verified hashes', async () => {
    const currentPlan = plan()
    const currentResult = await finalResult(currentPlan)
    const { instance, directory } = await sink()

    await expect(instance.persistFinalEvidence({ plan: currentPlan, result: currentResult }))
      .resolves.toEqual({ status: 'passed' })

    const stored = JSON.parse(await readFile(
      join(directory, 'seb-s5-evidence-20260924.json'),
      'utf8',
    ))
    expect(stored).toMatchObject({
      schemaVersion: 1,
      environment: 'staging',
      siteOrigin: 'https://staging.korkru.com',
      supabaseOrigin: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
      completedAt: '2026-09-24T08:00:00.000Z',
      identity: {
        runId: currentResult.identity.runId,
        sourceRevision: currentResult.identity.sourceRevision,
        deploymentId: currentResult.identity.deploymentId,
        releaseRevision: currentResult.identity.releaseRevision,
      },
      status: 'complete',
      stepEvidence: currentResult.stepEvidence,
      bindingSha256: currentResult.bindingSha256,
    })
    const { evidenceSha256, ...core } = stored
    expect(evidenceSha256).toBe(
      createHash('sha256').update(JSON.stringify(core)).digest('hex'),
    )
    expect(JSON.stringify(stored)).not.toContain('settingsPassword')
    expect(JSON.stringify(stored)).not.toContain('quitPasswordHash')
    expect(JSON.stringify(stored)).not.toContain('cookieValue')
    expect(JSON.stringify(stored)).not.toContain('configKey')
    expect(JSON.stringify(stored)).not.toContain('browserExamKey')
    expect(JSON.stringify(stored)).not.toContain(currentResult.identity.releaseId)
    expect(JSON.stringify(stored)).not.toContain(currentResult.identity.artifactSha256)
    expect(JSON.stringify(stored)).not.toContain('c'.repeat(32))
  })

  it('is idempotent for the same bound result but rejects equivocation for one run id', async () => {
    const currentPlan = plan()
    const currentResult = await finalResult(currentPlan)
    const first = await sink()
    expect(await first.instance.persistFinalEvidence({ plan: currentPlan, result: currentResult }))
      .toEqual({ status: 'passed' })

    const second = await sink({
      outputDirectory: first.directory,
      clock: () => new Date('2026-09-24T09:00:00.000Z'),
      randomBytes: () => new Uint8Array(16).fill(8),
    })
    expect(await second.instance.persistFinalEvidence({ plan: currentPlan, result: currentResult }))
      .toEqual({ status: 'passed' })

    const failedResult = await finalResult(currentPlan, {
      failStep: 'teacher-read-submitted-result',
    })
    expect(await second.instance.persistFinalEvidence({ plan: currentPlan, result: failedResult }))
      .toEqual({ status: 'failed' })
  })

  it('rejects forged bindings, unknown evidence, non-terminal status, and mismatched outcome', async () => {
    const currentPlan = plan()
    const currentResult = await finalResult(currentPlan)
    const { instance } = await sink()
    const cases = [
      { ...currentResult },
      { ...currentResult, bindingSha256: 'f'.repeat(64) },
      { ...currentResult, status: 'inspect-only' },
      { ...currentResult, status: 'cleanup-failed' },
      { ...currentResult, extra: true },
      {
        ...currentResult,
        stepEvidence: { ...currentResult.stepEvidence, unknown: 'passed' },
      },
      {
        ...currentResult,
        identity: { ...currentResult.identity, password: 'do-not-persist' },
      },
    ]
    for (const result of cases) {
      await expect(instance.persistFinalEvidence({ plan: currentPlan, result }))
        .resolves.toEqual({ status: 'failed' })
    }
  })

  it('accepts only runner-issued failure evidence with the required cleanup outcome', async () => {
    const currentPlan = plan()

    const mutatedFailure = await finalResult(currentPlan, {
      failStep: 'provision-synthetic-teacher',
    })
    expect(mutatedFailure.status).toBe('failed')
    expect(mutatedFailure.stepEvidence[currentPlan.cleanupStepId]).toBe('passed')
    const cleaned = await sink()
    await expect(cleaned.instance.persistFinalEvidence({
      plan: currentPlan,
      result: mutatedFailure,
    })).resolves.toEqual({ status: 'passed' })

    const cleanupFailure = await finalResult(currentPlan, { failCleanup: true })
    expect(cleanupFailure.status).toBe('cleanup-failed')
    expect(cleanupFailure.stepEvidence[currentPlan.cleanupStepId]).toBe('failed')
    const unresolved = await sink()
    await expect(unresolved.instance.persistFinalEvidence({
      plan: currentPlan,
      result: cleanupFailure,
    })).resolves.toEqual({ status: 'passed' })

    const forgedUnclean = {
      ...mutatedFailure,
      stepEvidence: {
        ...mutatedFailure.stepEvidence,
        [currentPlan.cleanupStepId]: 'pending',
      },
    }
    const rejected = await sink()
    await expect(rejected.instance.persistFinalEvidence({
      plan: currentPlan,
      result: forgedUnclean,
    })).resolves.toEqual({ status: 'failed' })
  })

  it('fails closed if the Staging policy drifts before persistence', async () => {
    const currentPlan = plan()
    const currentResult = await finalResult(currentPlan)
    const current = await sink()
    current.setEnvironment(environment({ KORKRU_DEPLOYMENT_ENV: 'production' }))

    await expect(current.instance.persistFinalEvidence({ plan: currentPlan, result: currentResult }))
      .resolves.toEqual({ status: 'failed' })
  })

  it('does not overwrite malformed or truncated evidence already present', async () => {
    const currentPlan = plan()
    const currentResult = await finalResult(currentPlan)
    const directory = await outputDirectory()
    const current = await sink({ outputDirectory: directory })
    await writeFile(join(directory, 'seb-s5-evidence-20260924.json'), '{"truncated":', 'utf8')

    await expect(current.instance.persistFinalEvidence({ plan: currentPlan, result: currentResult }))
      .resolves.toEqual({ status: 'failed' })
    await expect(readFile(join(directory, 'seb-s5-evidence-20260924.json'), 'utf8'))
      .resolves.toBe('{"truncated":')
  })

  it('rejects a symlink output directory and invalid randomness', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seb-evidence-symlink-'))
    roots.push(root)
    const target = join(root, 'target')
    const linkPath = join(root, 'link')
    const targetSink = await sink({ outputDirectory: target })
    await targetSink.instance.closeAll()
    await symlink(target, linkPath)

    await expect(createSebStagingDurableEvidenceSink({
      readEnvironment: () => environment(),
      outputDirectory: linkPath,
      clock: () => new Date(),
    })).rejects.toBeInstanceOf(SebStagingDurableEvidenceSinkBlockedError)

    const currentPlan = plan()
    const currentResult = await finalResult(currentPlan)
    const badRandom = await sink({ randomBytes: () => new Uint8Array(15) })
    await expect(badRandom.instance.persistFinalEvidence({ plan: currentPlan, result: currentResult }))
      .resolves.toEqual({ status: 'failed' })
  })

  it('rejects an existing output directory writable by group or other users', async () => {
    const directory = await outputDirectory()
    await mkdir(directory, { mode: 0o700 })
    await chmod(directory, 0o777)

    await expect(createSebStagingDurableEvidenceSink({
      readEnvironment: () => environment(),
      outputDirectory: directory,
      clock: () => new Date(),
    })).rejects.toBeInstanceOf(SebStagingDurableEvidenceSinkBlockedError)
  })

  it('fails closed if its output directory is replaced after construction', async () => {
    const currentPlan = plan()
    const currentResult = await finalResult(currentPlan)
    const current = await sink()
    const originalDirectory = `${current.directory}.original`
    const attackerDirectory = join(dirname(current.directory), 'replacement-target')
    await rename(current.directory, originalDirectory)
    await mkdir(attackerDirectory)
    await symlink(attackerDirectory, current.directory)

    await expect(current.instance.persistFinalEvidence({
      plan: currentPlan,
      result: currentResult,
    })).resolves.toEqual({ status: 'failed' })
    await expect(readFile(
      join(attackerDirectory, 'seb-s5-evidence-20260924.json'),
      'utf8',
    )).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(current.instance.closeAll()).resolves.toEqual({ status: 'failed' })
  })

  it('never writes evidence through a directory symlink installed mid-persist', async () => {
    const currentPlan = plan()
    const currentResult = await finalResult(currentPlan)
    const directory = await outputDirectory()
    const originalDirectory = `${directory}.original`
    const attackerDirectory = join(dirname(directory), 'mid-persist-target')
    let swapped = false
    const current = await sink({
      outputDirectory: directory,
      clock: () => {
        if (!swapped) {
          swapped = true
          renameSync(directory, originalDirectory)
          mkdirSync(attackerDirectory)
          symlinkSync(attackerDirectory, directory)
        }
        return new Date('2026-09-24T08:00:00.000Z')
      },
    })

    await expect(current.instance.persistFinalEvidence({
      plan: currentPlan,
      result: currentResult,
    })).resolves.toEqual({ status: 'failed' })
    await expect(readdir(attackerDirectory)).resolves.toEqual([])
    await expect(readdir(originalDirectory)).resolves.toEqual([])
    await expect(current.instance.closeAll()).resolves.toEqual({ status: 'failed' })
  })

  it('never deletes an unowned file after an exclusive temp-name collision', async () => {
    const currentPlan = plan()
    const currentResult = await finalResult(currentPlan)
    const directory = await outputDirectory()
    await mkdir(directory, { mode: 0o700 })
    const temporaryPath = join(
      directory,
      `.seb-s5-evidence-20260924.${'07'.repeat(16)}.tmp`,
    )
    await writeFile(temporaryPath, 'unowned-sentinel', 'utf8')
    const current = await sink({ outputDirectory: directory })

    await expect(current.instance.persistFinalEvidence({
      plan: currentPlan,
      result: currentResult,
    })).resolves.toEqual({ status: 'failed' })
    await expect(readFile(temporaryPath, 'utf8')).resolves.toBe('unowned-sentinel')
    await expect(current.instance.closeAll()).resolves.toEqual({ status: 'passed' })
  })

  it('never accepts or follows a pre-existing final-file symlink', async () => {
    const currentPlan = plan()
    const currentResult = await finalResult(currentPlan)
    const current = await sink()
    const outside = join(dirname(current.directory), 'outside.json')
    await writeFile(outside, 'outside-sentinel', 'utf8')
    await symlink(
      outside,
      join(current.directory, 'seb-s5-evidence-20260924.json'),
    )

    await expect(current.instance.persistFinalEvidence({
      plan: currentPlan,
      result: currentResult,
    })).resolves.toEqual({ status: 'failed' })
    await expect(readFile(outside, 'utf8')).resolves.toBe('outside-sentinel')
  })

  it('closes idempotently and rejects writes after close', async () => {
    const currentPlan = plan()
    const currentResult = await finalResult(currentPlan)
    const { instance } = await sink()
    await expect(instance.closeAll()).resolves.toEqual({ status: 'passed' })
    await expect(instance.closeAll()).resolves.toEqual({ status: 'passed' })
    await expect(instance.persistFinalEvidence({ plan: currentPlan, result: currentResult }))
      .resolves.toEqual({ status: 'failed' })
  })

  it('serializes concurrent same-result publication without equivocation', async () => {
    const currentPlan = plan()
    const currentResult = await finalResult(currentPlan)
    const directory = await outputDirectory()
    const first = await sink({
      outputDirectory: directory,
      randomBytes: () => new Uint8Array(16).fill(10),
    })
    const second = await sink({
      outputDirectory: directory,
      randomBytes: () => new Uint8Array(16).fill(11),
    })

    const outcomes = await Promise.all([
      first.instance.persistFinalEvidence({ plan: currentPlan, result: currentResult }),
      second.instance.persistFinalEvidence({ plan: currentPlan, result: currentResult }),
    ])
    expect(outcomes).toContainEqual({ status: 'passed' })
    await expect(second.instance.persistFinalEvidence({
      plan: currentPlan,
      result: currentResult,
    })).resolves.toEqual({ status: 'passed' })
    const stored = JSON.parse(await readFile(
      join(directory, 'seb-s5-evidence-20260924.json'),
      'utf8',
    ))
    expect(stored.bindingSha256).toBe(currentResult.bindingSha256)
  })
})
