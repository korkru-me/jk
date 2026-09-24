import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingPrivateOperationTicketProviderBlockedError,
  createSebStagingPrivateOperationTicketProvider,
} from './seb-staging-private-operation-ticket-provider.mjs'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const RUN_ID = 'seb-s5-provider-1'
const NAMESPACE = `qa:${RUN_ID}`
const EXPECTED_USER_ID = '00000000-0000-4000-8000-000000000001'
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002'
const TARGET_ID = '00000000-0000-4000-8000-000000000003'
const NOW = '2026-09-24T03:00:00.000Z'

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze))
  if (value === null || typeof value !== 'object') return value
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, freeze(child)]),
  ))
}

function passed() {
  return Object.freeze({ status: 'passed' })
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

function identity(overrides = {}) {
  return freeze({
    runId: RUN_ID,
    sourceRevision: 'a'.repeat(40),
    deploymentId: `dpl_${'A'.repeat(24)}`,
    creationWindow: {
      notBefore: '2026-09-24T02:00:00.000Z',
      notAfter: '2026-09-24T04:00:00.000Z',
    },
    ...overrides,
  })
}

function bindingRequest() {
  return freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    alias: 'teacher-primary',
    role: 'teacher',
  })
}

function prepareRequest(runIdentity) {
  return freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    identity: runIdentity,
    stepId: 'create-subject-classroom',
    alias: 'teacher-primary',
    role: 'teacher',
    expectedUserId: EXPECTED_USER_ID,
  })
}

function attestRequest(runIdentity) {
  return freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    identity: runIdentity,
    stepId: 'create-subject-classroom',
  })
}

function issueRequest(overrides = {}) {
  return freeze({
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    alias: 'teacher-primary',
    expectedUserId: EXPECTED_USER_ID,
    operationId: 'create-subject-classroom',
    ...overrides,
  })
}

function callOptions(controller = new AbortController()) {
  return Object.freeze({ signal: controller.signal })
}

function ticketInput(page, controller = new AbortController()) {
  return Object.freeze({ page, signal: controller.signal })
}

class FakePage {
  constructor({ failConfirm = false } = {}) {
    this.currentUrl = `${SITE_ORIGIN}/classrooms`
    this.events = []
    this.values = new Map()
    this.failConfirm = failConfirm
  }

  url() {
    return this.currentUrl
  }

  async goto(url) {
    this.events.push(['goto', url])
    this.currentUrl = url
  }

  locator(selector) {
    return {
      fill: async value => {
        this.events.push(['fill', selector])
        this.values.set(selector, value)
      },
    }
  }

  getByRole(role, options) {
    if (role === 'heading') {
      return { waitFor: async () => this.events.push(['heading', options.name]) }
    }
    if (role === 'button' && options.name === 'ถัดไป') {
      return { click: async () => this.events.push(['click', options.name]) }
    }
    if (role === 'button' && options.name === 'ยืนยันสร้างห้องเรียน') {
      return {
        click: async () => {
          this.events.push(['click', options.name])
          if (this.failConfirm) throw new Error('private confirm failure sentinel')
          this.currentUrl = `${SITE_ORIGIN}/classrooms`
        },
      }
    }
    throw new Error('unexpected role')
  }

  getByText(value) {
    return {
      waitFor: async () => {
        this.events.push(['text', value])
        if (this.values.get('#cls-name') !== value) throw new Error('missing marker')
      },
    }
  }

  async waitForURL(predicate) {
    this.events.push(['waitForURL'])
    if (!predicate(new URL(this.currentUrl))) throw new Error('wrong URL')
  }
}

function makeHarness({
  environmentOverrides,
  dataOverrides = {},
  materialOverrides = {},
  boundaryTimeoutMs = 100,
  now = NOW,
} = {}) {
  const runIdentity = identity()
  let currentEnvironment = environment(environmentOverrides)
  const captured = {
    marker: null,
    prepare: null,
    attest: null,
    abort: null,
  }
  const target = freeze({
    schemaVersion: 1,
    targetKey: 'classroom-primary',
    kind: 'classroom',
    ownerId: EXPECTED_USER_ID,
    organizationId: ORGANIZATION_ID,
    resourceType: 'subject',
  })
  const readAccountBinding = vi.fn(async () => freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    alias: 'teacher-primary',
    role: 'teacher',
    expectedUserId: EXPECTED_USER_ID,
  }))
  const prepareOperation = vi.fn(async request => {
    captured.prepare = request
    captured.marker = request.marker
    return freeze({
      schemaVersion: 1,
      targetOrigin: SITE_ORIGIN,
      namespace: NAMESPACE,
      stepId: 'create-subject-classroom',
      alias: 'teacher-primary',
      role: 'teacher',
      expectedUserId: EXPECTED_USER_ID,
      targets: [target],
    })
  })
  const attestOperation = vi.fn(async request => {
    captured.attest = request
    return freeze({
      schemaVersion: 1,
      stepId: 'create-subject-classroom',
      status: 'passed',
      targets: [{
        targetKey: 'classroom-primary',
        kind: 'classroom',
        matches: [{
          targetId: TARGET_ID,
          createdAt: NOW,
          ownerId: EXPECTED_USER_ID,
          organizationId: ORGANIZATION_ID,
          resourceType: 'subject',
          parentId: null,
          relatedIds: [],
        }],
      }],
    })
  })
  const abortOperation = vi.fn(async request => {
    captured.abort = request
    return passed()
  })
  const dataCloseAll = vi.fn(async () => passed())
  const materialCloseAll = vi.fn(async () => passed())
  const dataBoundary = Object.freeze({
    readAccountBinding: dataOverrides.readAccountBinding ?? readAccountBinding,
    prepareOperation: dataOverrides.prepareOperation ?? prepareOperation,
    attestOperation: dataOverrides.attestOperation ?? attestOperation,
    abortOperation: dataOverrides.abortOperation ?? abortOperation,
    closeAll: dataOverrides.closeAll ?? dataCloseAll,
  })
  const materialCapability = Object.freeze({
    applySecretInputs: materialOverrides.applySecretInputs ?? vi.fn(async () => passed()),
    applySyntheticUpload: materialOverrides.applySyntheticUpload ?? vi.fn(async () => passed()),
    closeAll: materialOverrides.closeAll ?? materialCloseAll,
  })
  const provider = createSebStagingPrivateOperationTicketProvider({
    schemaVersion: 1,
    namespace: NAMESPACE,
    identity: runIdentity,
    readEnvironment: () => currentEnvironment,
    privateDataBoundary: dataBoundary,
    privateMaterialCapability: materialCapability,
    clock: () => new Date(now),
    boundaryTimeoutMs,
  })
  return {
    provider,
    runIdentity,
    dataBoundary,
    materialCapability,
    target,
    captured,
    readAccountBinding,
    prepareOperation,
    attestOperation,
    abortOperation,
    dataCloseAll,
    materialCloseAll,
    setEnvironment(value) {
      currentEnvironment = value
    },
  }
}

async function prepareHarness(harness) {
  const binding = await harness.provider.resourcePlanCapability.readAccountBinding(
    bindingRequest(),
    callOptions(),
  )
  const prepared = await harness.provider.resourcePlanCapability.prepareStep(
    prepareRequest(harness.runIdentity),
    callOptions(),
  )
  return { binding, prepared }
}

async function issuePrepared(harness, page = new FakePage()) {
  await prepareHarness(harness)
  const ticket = await harness.provider.operationPlanCapability.issueOperationTicket(
    issueRequest(),
    callOptions(),
  )
  return { ticket, page }
}

async function finishTicket(ticket, page) {
  expect(await ticket.navigate(ticketInput(page))).toEqual({ status: 'passed' })
  expect(await ticket.applyMarkers(ticketInput(page))).toEqual({ status: 'passed' })
  expect(await ticket.applySecrets(ticketInput(page))).toEqual({ status: 'passed' })
  expect(await ticket.applyUploads(ticketInput(page))).toEqual({ status: 'passed' })
  expect(await ticket.beginMutation(ticketInput(page))).toEqual({ status: 'passed' })
  expect(await ticket.finish(ticketInput(page))).toEqual({ status: 'passed' })
}

async function expectBlocked(task) {
  let captured = null
  try {
    await task()
  } catch (error) {
    captured = error
  }
  expect(captured).toBeInstanceOf(SebStagingPrivateOperationTicketProviderBlockedError)
  expect(`${captured?.name}:${captured?.message}`).not.toContain('sentinel')
}

describe('SEB Staging private operation ticket provider', () => {
  it('executes and attests the exact classroom flow without exposing its marker', async () => {
    const harness = makeHarness()
    const { binding, prepared } = await prepareHarness(harness)
    const page = new FakePage()
    const ticket = await harness.provider.operationPlanCapability.issueOperationTicket(
      issueRequest(),
      callOptions(),
    )

    expect(Object.isFrozen(harness.provider)).toBe(true)
    expect(Object.keys(harness.provider).sort()).toEqual([
      'closeAll', 'operationPlanCapability', 'resourcePlanCapability',
    ])
    expect(Object.keys(harness.provider.resourcePlanCapability).sort()).toEqual([
      'attestStep', 'prepareStep', 'readAccountBinding',
    ])
    expect(Object.keys(ticket).sort()).toEqual([
      'abort', 'applyMarkers', 'applySecrets', 'applyUploads',
      'beginMutation', 'finish', 'navigate',
    ])

    await finishTicket(ticket, page)
    const attested = await harness.provider.resourcePlanCapability.attestStep(
      attestRequest(harness.runIdentity),
      callOptions(),
    )

    expect(binding.expectedUserId).toBe(EXPECTED_USER_ID)
    expect(prepared.targets).toEqual([harness.target])
    expect(attested.status).toBe('passed')
    expect(harness.captured.marker).toMatch(/^SEB S5 seb-s5-provider-1 [a-f0-9]{24}$/)
    expect(page.values.get('#cls-name')).toBe(harness.captured.marker)
    expect(harness.captured.attest.marker).toBe(harness.captured.marker)
    expect(JSON.stringify(harness.provider)).not.toContain(harness.captured.marker)
    expect(JSON.stringify(ticket)).not.toContain(harness.captured.marker)
    expect(await harness.provider.closeAll()).toEqual({ status: 'passed' })
    expect(harness.materialCloseAll).toHaveBeenCalledTimes(1)
    expect(harness.dataCloseAll).toHaveBeenCalledTimes(1)
  })

  it('requires the complete run identity including its creation window', async () => {
    const harness = makeHarness()
    await harness.provider.resourcePlanCapability.readAccountBinding(
      bindingRequest(),
      callOptions(),
    )
    const incompleteIdentity = freeze({
      runId: RUN_ID,
      sourceRevision: 'a'.repeat(40),
      deploymentId: `dpl_${'A'.repeat(24)}`,
    })
    await expectBlocked(() => harness.provider.resourcePlanCapability.prepareStep(
      prepareRequest(incompleteIdentity),
      callOptions(),
    ))
    expect(harness.prepareOperation).not.toHaveBeenCalled()
  })

  it('rejects unsupported operations before issuing a ticket or mutating a page', async () => {
    const harness = makeHarness()
    await prepareHarness(harness)
    const page = new FakePage()
    await expectBlocked(() => harness.provider.operationPlanCapability.issueOperationTicket(
      issueRequest({ operationId: 'publish-seb-required-assignment' }),
      callOptions(),
    ))
    expect(page.events).toEqual([])
  })

  it('pins every ticket call to the original Page and enforces method order', async () => {
    const harness = makeHarness()
    const { ticket, page } = await issuePrepared(harness)
    await expectBlocked(() => ticket.applyMarkers(ticketInput(page)))
    expect(await ticket.navigate(ticketInput(page))).toEqual({ status: 'passed' })
    await expectBlocked(() => ticket.applyMarkers(ticketInput(new FakePage())))
    expect(page.values.size).toBe(0)
  })

  it('reconciles through the private data boundary before abort can pass', async () => {
    let allowAbort = false
    const abortOperation = vi.fn(async () => {
      if (!allowAbort) throw new Error('private abort failure sentinel')
      return passed()
    })
    const harness = makeHarness({ dataOverrides: { abortOperation } })
    const { ticket, page } = await issuePrepared(harness)
    expect(await ticket.navigate(ticketInput(page))).toEqual({ status: 'passed' })
    await expectBlocked(() => ticket.abort(ticketInput(page)))
    allowAbort = true
    expect(await ticket.abort(ticketInput(page))).toEqual({ status: 'passed' })
    expect(abortOperation).toHaveBeenCalledTimes(2)
    expect(await harness.provider.closeAll()).toEqual({ status: 'passed' })
  })

  it('reconciles a finished but unattested plan during closeAll', async () => {
    const harness = makeHarness()
    const { ticket, page } = await issuePrepared(harness)
    await finishTicket(ticket, page)
    expect(await harness.provider.closeAll()).toEqual({ status: 'passed' })
    expect(harness.abortOperation).toHaveBeenCalledTimes(1)
    expect(harness.captured.abort.marker).toBe(harness.captured.marker)
  })

  it('keeps closeAll retryable when reconciliation initially fails', async () => {
    let allowAbort = false
    const abortOperation = vi.fn(async () => (allowAbort ? passed() : freeze({ status: 'failed' })))
    const harness = makeHarness({ dataOverrides: { abortOperation } })
    await prepareHarness(harness)
    expect(await harness.provider.closeAll()).toEqual({ status: 'failed' })
    expect(harness.dataCloseAll).not.toHaveBeenCalled()
    allowAbort = true
    expect(await harness.provider.closeAll()).toEqual({ status: 'passed' })
  })

  it('redacts private browser failures and reconciles the open ticket', async () => {
    const harness = makeHarness()
    const { ticket, page } = await issuePrepared(harness, new FakePage({ failConfirm: true }))
    await ticket.navigate(ticketInput(page))
    await ticket.applyMarkers(ticketInput(page))
    await ticket.applySecrets(ticketInput(page))
    await ticket.applyUploads(ticketInput(page))
    await expectBlocked(() => ticket.beginMutation(ticketInput(page)))
    expect(await ticket.abort(ticketInput(page))).toEqual({ status: 'passed' })
    expect(harness.abortOperation).toHaveBeenCalledTimes(1)
  })

  it('blocks capability expansion and official-environment drift', async () => {
    const base = makeHarness()
    expect(() => createSebStagingPrivateOperationTicketProvider({
      schemaVersion: 1,
      namespace: NAMESPACE,
      identity: base.runIdentity,
      readEnvironment: () => environment(),
      privateDataBoundary: Object.freeze({
        ...base.dataBoundary,
        leak: () => 'forbidden',
      }),
      privateMaterialCapability: base.materialCapability,
      clock: () => new Date(NOW),
    })).toThrow(SebStagingPrivateOperationTicketProviderBlockedError)

    const harness = makeHarness()
    harness.setEnvironment(environment({ NEXT_PUBLIC_SITE_URL: 'https://example.com' }))
    await expectBlocked(() => harness.provider.resourcePlanCapability.readAccountBinding(
      bindingRequest(),
      callOptions(),
    ))
    expect(harness.readAccountBinding).not.toHaveBeenCalled()
  })

  it('blocks expired windows and already-aborted callers before private work', async () => {
    const base = makeHarness()
    expect(() => createSebStagingPrivateOperationTicketProvider({
      schemaVersion: 1,
      namespace: NAMESPACE,
      identity: base.runIdentity,
      readEnvironment: () => environment(),
      privateDataBoundary: base.dataBoundary,
      privateMaterialCapability: base.materialCapability,
      clock: () => new Date('2026-09-24T05:00:00.000Z'),
    })).toThrow(SebStagingPrivateOperationTicketProviderBlockedError)

    const harness = makeHarness()
    const controller = new AbortController()
    controller.abort()
    await expectBlocked(() => harness.provider.resourcePlanCapability.readAccountBinding(
      bindingRequest(),
      callOptions(controller),
    ))
    expect(harness.readAccountBinding).not.toHaveBeenCalled()
  })

  it('times out a stalled private boundary and never returns its late result', async () => {
    const prepareOperation = vi.fn(() => new Promise(() => {}))
    const harness = makeHarness({
      dataOverrides: { prepareOperation },
      boundaryTimeoutMs: 10,
    })
    await harness.provider.resourcePlanCapability.readAccountBinding(
      bindingRequest(),
      callOptions(),
    )
    await expectBlocked(() => harness.provider.resourcePlanCapability.prepareStep(
      prepareRequest(harness.runIdentity),
      callOptions(),
    ))
  })
})
