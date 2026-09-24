import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingPrivateSetupMaterialCapabilityBlockedError,
  createSebStagingPrivateSetupMaterialCapability,
} from './seb-staging-private-setup-material-capability.mjs'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const RUN_ID = 'seb-s5-material-1'
const NAMESPACE = `qa:${RUN_ID}`
const CLASSROOM_ID = '00000000-0000-4000-8000-000000000001'
const TEACHER_ID = '00000000-0000-4000-8000-000000000002'
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000003'
const STUDENT_ID = '00000000-0000-4000-8000-000000000004'

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze))
  if (value === null || typeof value !== 'object') return value
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, freeze(child)]),
  ))
}

function environment(overrides = {}) {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: SITE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN,
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
    ...overrides,
  }
}

function identity() {
  return freeze({
    runId: RUN_ID,
    sourceRevision: 'a'.repeat(40),
    deploymentId: `dpl_${'A'.repeat(24)}`,
    creationWindow: {
      notBefore: '2026-09-24T02:00:00.000Z',
      notAfter: '2026-09-24T04:00:00.000Z',
    },
  })
}

function makeHarness(rowOverrides = {}) {
  let currentEnvironment = environment()
  const snapshot = freeze({
    schemaVersion: 1,
    targetKey: 'classroom-primary',
    kind: 'classroom',
    identity: identity(),
    targetId: CLASSROOM_ID,
    namespace: NAMESPACE,
    ownerId: TEACHER_ID,
    organizationId: ORGANIZATION_ID,
    resourceType: 'subject',
    createdAt: '2026-09-24T03:00:00.000Z',
  })
  const privateRunLedger = Object.freeze({
    planTarget: vi.fn(),
    adoptDerivedTarget: vi.fn(),
    markUncertain: vi.fn(),
    commitTarget: vi.fn(),
    reconcileTarget: vi.fn(),
    readCleanupTarget: vi.fn(() => freeze({
      status: 'passed', state: 'committed', snapshots: [snapshot],
    })),
    markDeleted: vi.fn(),
  })
  const enumerateDatabase = vi.fn(async () => freeze({
    rows: [{
      id: CLASSROOM_ID,
      teacher_id: TEACHER_ID,
      org_id: ORGANIZATION_ID,
      classroom_type: 'subject',
      class_code: 'ABC123',
      ...rowOverrides,
    }],
  }))
  const close = vi.fn(async () => freeze({ status: 'passed' }))
  const supabaseDriver = Object.freeze({
    supabaseUrl: SUPABASE_ORIGIN,
    credentialKind: 'service-role',
    enumerateDatabase,
    deleteDatabase: vi.fn(),
    enumerateStorage: vi.fn(),
    deleteStorage: vi.fn(),
    close,
  })
  const capability = createSebStagingPrivateSetupMaterialCapability({
    namespace: NAMESPACE,
    identity: identity(),
    readEnvironment: () => currentEnvironment,
    privateRunLedger,
    supabaseDriver,
  })
  return {
    capability,
    enumerateDatabase,
    close,
    setEnvironment(value) { currentEnvironment = value },
  }
}

function request(page, overrides = {}) {
  return freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    identity: identity(),
    operationId: 'join-synthetic-student-to-classroom',
    alias: 'student-primary',
    expectedUserId: STUDENT_ID,
    page,
    ...overrides,
  })
}

function options() {
  return Object.freeze({ signal: new AbortController().signal })
}

describe('SEB Staging private setup material capability', () => {
  it('fills the committed classroom code without returning it', async () => {
    const values = new Map()
    const page = {
      locator: vi.fn(selector => ({ fill: vi.fn(async value => values.set(selector, value)) })),
    }
    const harness = makeHarness()
    const result = await harness.capability.applySecretInputs(request(page), options())
    expect(result).toEqual({ status: 'passed' })
    expect(values.get('input[placeholder="รหัส 6 หลัก เช่น AB3X7Y"]')).toBe('ABC123')
    expect(JSON.stringify(result)).not.toContain('ABC123')
    expect(harness.enumerateDatabase.mock.calls[0][0]).toMatchObject({
      table: 'classrooms',
      limit: 1,
    })
    expect(await harness.capability.closeAll()).toEqual({ status: 'passed' })
  })

  it('generates one strong assignment-scoped quit password without returning it', async () => {
    const values = new Map()
    const page = {
      locator: vi.fn(selector => ({ fill: vi.fn(async value => values.set(selector, value)) })),
    }
    const harness = makeHarness()
    const result = await harness.capability.applySecretInputs(request(page, {
      operationId: 'create-seb-assignment-draft-with-quit-password',
      alias: 'teacher-primary',
      expectedUserId: TEACHER_ID,
    }), options())
    const password = values.get('#create-seb-quit-password')
    expect(password).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(values.get('#create-seb-quit-confirmation')).toBe(password)
    expect(result).toEqual({ status: 'passed' })
    expect(JSON.stringify(result)).not.toContain(password)
    expect(JSON.stringify(harness.capability)).not.toContain(password)
    expect(harness.enumerateDatabase).not.toHaveBeenCalled()
  })

  it('injects one in-memory PDF for the synthetic student without exposing bytes or a path', async () => {
    let uploaded = null
    const page = {
      locator: vi.fn(selector => {
        expect(selector).toBe('input[aria-label="เลือกไฟล์คำตอบ"]')
        return { setInputFiles: vi.fn(async value => { uploaded = value }) }
      }),
    }
    const harness = makeHarness()
    const result = await harness.capability.applySyntheticUpload(request(page, {
      operationId: 'upload-synthetic-attachment',
    }), options())

    expect(result).toEqual({ status: 'passed' })
    expect(uploaded).toMatchObject({
      name: 'seb-s5-synthetic-answer.pdf',
      mimeType: 'application/pdf',
    })
    expect(Buffer.isBuffer(uploaded.buffer)).toBe(true)
    expect(uploaded.buffer.length).toBeGreaterThan(0)
    expect(JSON.stringify(result)).not.toContain('seb-s5-synthetic-answer.pdf')
    expect(JSON.stringify(harness.capability)).not.toContain('seb-s5-synthetic-answer.pdf')
  })

  it('blocks malformed codes and environment drift', async () => {
    const page = { locator: vi.fn(() => ({ fill: vi.fn() })) }
    const malformed = makeHarness({ class_code: 'wrong' })
    await expect(malformed.capability.applySecretInputs(request(page), options()))
      .rejects.toBeInstanceOf(SebStagingPrivateSetupMaterialCapabilityBlockedError)

    const drift = makeHarness()
    drift.setEnvironment(environment({ NEXT_PUBLIC_SITE_URL: 'https://www.korkru.com' }))
    await expect(drift.capability.applySecretInputs(request(page), options()))
      .rejects.toBeInstanceOf(SebStagingPrivateSetupMaterialCapabilityBlockedError)
  })
})
