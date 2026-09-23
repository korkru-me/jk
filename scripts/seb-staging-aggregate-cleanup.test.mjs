import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingAggregateCleanupBlockedError,
  createSebStagingAggregateCleanupCapability,
} from './seb-staging-aggregate-cleanup.mjs'

const PARTICIPANT_NAMES = [
  'answerStorage',
  'artifactStorage',
  'databaseFixture',
  'personalOrganizations',
  'runReservation',
]
const ARTIFACT_SHA256 = 'a'.repeat(64)

function validEnvironment(overrides = {}) {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
    ...overrides,
  }
}

function cleanupRequest(overrides = {}) {
  const runId = overrides.runId ?? 'seb-s5-aggregate-1'
  const namespace = `qa:${runId}`
  const request = {
    schemaVersion: 1,
    runId,
    namespace,
    identity: {
      runId,
      sourceRevision: 'b'.repeat(40),
      deploymentId: `dpl_${'C'.repeat(24)}`,
      releaseId: `asr-${'1'.repeat(32)}-r3-${ARTIFACT_SHA256.slice(0, 16)}`,
      releaseRevision: 3,
      artifactSha256: ARTIFACT_SHA256,
    },
    accounts: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        alias: 'teacher-primary',
        role: 'teacher',
        namespace,
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        alias: 'student-primary',
        role: 'student',
        namespace,
      },
    ],
  }
  return { ...request, ...overrides }
}

function participantSet(implementations = {}) {
  return Object.fromEntries(PARTICIPANT_NAMES.map(name => [
    name,
    {
      cleanupRun: vi.fn(implementations[name] ?? (async () => ({ status: 'passed' }))),
    },
  ]))
}

function createCapability({
  environmentState = { current: validEnvironment() },
  participants = participantSet(),
  readEnvironment,
} = {}) {
  const resolvedReader = readEnvironment ?? vi.fn(() => environmentState.current)
  const capability = createSebStagingAggregateCleanupCapability({
    readEnvironment: resolvedReader,
    ...participants,
  })
  return { capability, environmentState, participants, readEnvironment: resolvedReader }
}

describe('SEB Staging aggregate cleanup capability', () => {
  it('fails closed at construction when the environment or any participant is missing', () => {
    const participants = participantSet()
    for (const name of PARTICIPANT_NAMES) {
      expect(() => createSebStagingAggregateCleanupCapability({
        readEnvironment: () => validEnvironment(),
        ...participants,
        [name]: undefined,
      })).toThrow(SebStagingAggregateCleanupBlockedError)
    }

    expect(() => createSebStagingAggregateCleanupCapability({
      readEnvironment: () => validEnvironment({ NEXT_PUBLIC_SITE_URL: 'https://www.korkru.com' }),
      ...participants,
    })).toThrow(SebStagingAggregateCleanupBlockedError)
    expect(() => createSebStagingAggregateCleanupCapability({
      readEnvironment: () => { throw new Error('ENV_SECRET_SENTINEL') },
      ...participants,
    })).toThrow(/SEB Staging aggregate cleanup blocked/)
  })

  it('runs every participant in the fixed safe order with one frozen credential-free manifest', async () => {
    const events = []
    const captured = []
    const participants = participantSet(Object.fromEntries(PARTICIPANT_NAMES.map(name => [
      name,
      async request => {
        events.push(name)
        captured.push(request)
        return { status: 'passed' }
      },
    ])))
    let environmentRead = 0
    const readEnvironment = vi.fn(() => {
      environmentRead += 1
      if (environmentRead > 1) events.push('environment')
      return validEnvironment()
    })
    const { capability } = createCapability({ participants, readEnvironment })

    const result = await capability.cleanupRun(cleanupRequest())

    expect(result).toEqual({ status: 'passed' })
    expect(Object.isFrozen(result)).toBe(true)
    expect(events).toEqual([
      'environment', 'answerStorage',
      'environment', 'artifactStorage',
      'environment', 'databaseFixture',
      'environment', 'personalOrganizations',
      'environment', 'runReservation',
    ])
    expect(new Set(captured).size).toBe(1)
    const manifest = captured[0]
    expect(Object.isFrozen(manifest)).toBe(true)
    expect(Object.isFrozen(manifest.identity)).toBe(true)
    expect(Object.isFrozen(manifest.accounts)).toBe(true)
    expect(manifest.accounts.every(account => Object.isFrozen(account))).toBe(true)
    expect(Object.keys(manifest)).toEqual([
      'schemaVersion', 'runId', 'namespace', 'identity', 'accounts',
    ])
    expect(JSON.stringify(manifest)).not.toMatch(/password|credential|token|secret|@/i)
  })

  it('stops at the first unresolved participant and never leaks thrown details', async () => {
    const calls = []
    const participants = participantSet({
      answerStorage: async () => {
        calls.push('answerStorage')
        throw new Error('ANSWER_STORAGE_SECRET_SENTINEL')
      },
      artifactStorage: async () => {
        calls.push('artifactStorage')
        return { status: 'failed', secret: 'ARTIFACT_SECRET_SENTINEL' }
      },
      databaseFixture: async () => {
        calls.push('databaseFixture')
        return { status: 'passed', extra: 'not-exact' }
      },
      personalOrganizations: async () => {
        calls.push('personalOrganizations')
        return null
      },
      runReservation: async () => {
        calls.push('runReservation')
        return { status: 'passed' }
      },
    })
    const { capability } = createCapability({ participants })

    const result = await capability.cleanupRun(cleanupRequest())

    expect(calls).toEqual(['answerStorage'])
    expect(result).toEqual({ status: 'failed' })
    expect(Object.keys(result)).toEqual(['status'])
    expect(JSON.stringify(result)).not.toMatch(/SECRET_SENTINEL|not-exact/i)
  })

  it('remembers exact passes and retries only unresolved participants', async () => {
    const calls = []
    const attempts = new Map()
    const participants = participantSet(Object.fromEntries(PARTICIPANT_NAMES.map(name => [
      name,
      async () => {
        calls.push(name)
        const attempt = (attempts.get(name) ?? 0) + 1
        attempts.set(name, attempt)
        if (name === 'artifactStorage' && attempt === 1) return { status: 'failed' }
        if (name === 'personalOrganizations' && attempt === 1) throw new Error('retry me')
        return { status: 'passed' }
      },
    ])))
    const { capability } = createCapability({ participants })
    const request = cleanupRequest()

    expect(await capability.cleanupRun(request)).toEqual({ status: 'failed' })
    expect(calls).toEqual(['answerStorage', 'artifactStorage'])

    calls.length = 0
    expect(await capability.cleanupRun(structuredClone(request))).toEqual({ status: 'failed' })
    expect(calls).toEqual(['artifactStorage', 'databaseFixture', 'personalOrganizations'])

    calls.length = 0
    expect(await capability.cleanupRun(structuredClone(request))).toEqual({ status: 'passed' })
    expect(calls).toEqual(['personalOrganizations', 'runReservation'])

    calls.length = 0
    expect(await capability.cleanupRun(structuredClone(request))).toEqual({ status: 'passed' })
    expect(calls).toEqual([])
  })

  it('re-reads exact Staging policy before each participant and resumes only after the failed gate', async () => {
    let environmentRead = 0
    const readEnvironment = vi.fn(() => {
      environmentRead += 1
      return environmentRead === 3
        ? validEnvironment({ EXAM_QA_COPY_PRODUCTION_DATA: 'true' })
        : validEnvironment()
    })
    const participants = participantSet()
    const { capability } = createCapability({ participants, readEnvironment })

    expect(await capability.cleanupRun(cleanupRequest())).toEqual({ status: 'failed' })
    expect(participants.answerStorage.cleanupRun).toHaveBeenCalledTimes(1)
    expect(participants.artifactStorage.cleanupRun).not.toHaveBeenCalled()
    expect(participants.databaseFixture.cleanupRun).not.toHaveBeenCalled()
    expect(participants.personalOrganizations.cleanupRun).not.toHaveBeenCalled()
    expect(participants.runReservation.cleanupRun).not.toHaveBeenCalled()

    expect(await capability.cleanupRun(cleanupRequest())).toEqual({ status: 'passed' })
    expect(participants.answerStorage.cleanupRun).toHaveBeenCalledTimes(1)
    expect(participants.artifactStorage.cleanupRun).toHaveBeenCalledTimes(1)
    expect(participants.databaseFixture.cleanupRun).toHaveBeenCalledTimes(1)
    expect(participants.personalOrganizations.cleanupRun).toHaveBeenCalledTimes(1)
    expect(participants.runReservation.cleanupRun).toHaveBeenCalledTimes(1)
    expect(readEnvironment).toHaveBeenCalledTimes(7)
  })

  it('rejects manifests with credentials, extra fields, or a changed retry target', async () => {
    const { capability, participants } = createCapability()
    const credentialBearing = cleanupRequest({
      accounts: [{
        id: '00000000-0000-4000-8000-000000000001',
        alias: 'teacher-primary',
        role: 'teacher',
        namespace: 'qa:seb-s5-aggregate-1',
        password: 'MUST_NOT_ENTER_CLEANUP',
      }],
    })
    expect(await capability.cleanupRun(credentialBearing)).toEqual({ status: 'failed' })
    expect(participants.answerStorage.cleanupRun).not.toHaveBeenCalled()

    const request = cleanupRequest({ runId: 'seb-s5-bound-1' })
    participants.answerStorage.cleanupRun
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValue({ status: 'passed' })
    expect(await capability.cleanupRun(request)).toEqual({ status: 'failed' })

    const changed = cleanupRequest({ runId: 'seb-s5-bound-2' })
    expect(await capability.cleanupRun(changed)).toEqual({ status: 'failed' })
    expect(participants.answerStorage.cleanupRun).toHaveBeenCalledTimes(1)

    expect(await capability.cleanupRun(structuredClone(request))).toEqual({ status: 'passed' })
    expect(participants.answerStorage.cleanupRun).toHaveBeenCalledTimes(2)
  })

  it('accepts run-bound cleanup before a release exists and remains coarse under concurrency', async () => {
    let releaseFirst
    const gate = new Promise(resolve => { releaseFirst = resolve })
    const participants = participantSet({
      answerStorage: async () => {
        await gate
        return { status: 'passed' }
      },
    })
    const { capability } = createCapability({ participants })
    const request = cleanupRequest()
    request.identity = {
      runId: request.runId,
      sourceRevision: 'b'.repeat(40),
      deploymentId: `dpl_${'C'.repeat(24)}`,
    }

    const first = capability.cleanupRun(request)
    expect(await capability.cleanupRun(structuredClone(request))).toEqual({ status: 'failed' })
    releaseFirst()
    expect(await first).toEqual({ status: 'passed' })
  })
})
