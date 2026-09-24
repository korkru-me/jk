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
const CONFIG_TARGET_ID = `${TARGET_ID}:r1`
const QUESTION_IDS = Object.freeze([
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
])
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

function bindingRequest(overrides = {}) {
  return freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    alias: 'teacher-primary',
    role: 'teacher',
    ...overrides,
  })
}

function prepareRequest(runIdentity, overrides = {}) {
  return freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    identity: runIdentity,
    stepId: 'create-subject-classroom',
    alias: 'teacher-primary',
    role: 'teacher',
    expectedUserId: EXPECTED_USER_ID,
    ...overrides,
  })
}

function attestRequest(runIdentity, overrides = {}) {
  return freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    identity: runIdentity,
    stepId: 'create-subject-classroom',
    ...overrides,
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
  constructor({ failConfirm = false, flow = 'classroom' } = {}) {
    this.currentUrl = `${SITE_ORIGIN}/classrooms`
    this.events = []
    this.values = new Map()
    this.failConfirm = failConfirm
    this.flow = flow
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
      count: async () => {
        if (selector === 'button[aria-pressed="false"]') return 1
        if (selector === 'input[type="checkbox"]') return 2
        return 1
      },
      first: () => ({
        click: async () => this.events.push(['click', selector, 0]),
      }),
      nth: index => ({
        check: async () => this.events.push(['check', selector, index]),
      }),
      check: async () => this.events.push(['check', selector]),
    }
  }

  getByRole(role, options) {
    if (role === 'heading') {
      return { waitFor: async () => this.events.push(['heading', options.name]) }
    }
    if (role === 'button' && options.name === 'ถัดไป') {
      return { click: async () => this.events.push(['click', options.name]) }
    }
    if (role === 'button' && options.name === 'ข้อสอบ') {
      return { click: async () => this.events.push(['click', options.name]) }
    }
    if (role === 'button' && options.name === 'สร้างชุดข้อสอบ') {
      return { click: async () => this.events.push(['click', options.name]) }
    }
    if (role === 'button' && options.name === 'เผยแพร่') {
      return { click: async () => this.events.push(['click', options.name]) }
    }
    if (role === 'button' && options.name === 'ยังไม่เผยแพร่ (เก็บไว้เป็นร่าง)') {
      return {
        click: async () => {
          this.events.push(['click', options.name])
          this.currentUrl = `${SITE_ORIGIN}/assignments/${TARGET_ID}`
        },
      }
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
    if (role === 'button' && options.name === 'บันทึกโจทย์') {
      return {
        click: async () => {
          this.events.push(['click', options.name])
          if (this.failConfirm) throw new Error('private confirm failure sentinel')
          this.currentUrl = `${SITE_ORIGIN}/questions`
        },
      }
    }
    if (role === 'button' && options.name === 'เข้าร่วม') {
      return {
        click: async () => this.events.push(['click', options.name]),
      }
    }
    throw new Error('unexpected role')
  }

  getByText(value) {
    return {
      waitFor: async () => {
        this.events.push(['text', value])
        if (value === 'เผยแพร่แล้ว'
          && this.events.some(event => event[0] === 'click' && event[1] === 'เผยแพร่')) return
        if (this.values.get('#cls-name') !== value && this.values.get('#title') !== value) {
          throw new Error('missing marker')
        }
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
  operationId = 'create-subject-classroom',
  targetKey = 'classroom-primary',
  targetKind = 'classroom',
  resourceType = 'subject',
  alias = 'teacher-primary',
  role = 'teacher',
  targets,
  supportsPublish = false,
} = {}) {
  const runIdentity = identity()
  let currentEnvironment = environment(environmentOverrides)
  const captured = {
    marker: null,
    prepare: null,
    attest: null,
    abort: null,
  }
  const targetInputs = targets ?? [{ targetKey, kind: targetKind, resourceType }]
  const plannedTargets = freeze(targetInputs.map(value => ({
    schemaVersion: 1,
    targetKey: value.targetKey,
    kind: value.kind,
    ownerId: EXPECTED_USER_ID,
    organizationId: ORGANIZATION_ID,
    resourceType: value.resourceType,
  })))
  const target = plannedTargets[0]
  const readAccountBinding = vi.fn(async () => freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    alias,
    role,
    expectedUserId: EXPECTED_USER_ID,
  }))
  const prepareOperation = vi.fn(async request => {
    captured.prepare = request
    captured.marker = request.marker
    return freeze({
      schemaVersion: 1,
      targetOrigin: SITE_ORIGIN,
      namespace: NAMESPACE,
      stepId: request.stepId,
      alias,
      role,
      expectedUserId: alias === null ? null : EXPECTED_USER_ID,
      targets: supportsPublish && request.stepId === 'publish-seb-assignment'
        ? []
        : plannedTargets,
    })
  })
  const attestOperation = vi.fn(async request => {
    captured.attest = request
    if (supportsPublish && request.stepId === 'publish-seb-assignment') {
      return freeze({
        schemaVersion: 1,
        stepId: request.stepId,
        status: 'passed',
        targets: [],
      })
    }
    return freeze({
      schemaVersion: 1,
      stepId: request.stepId,
      status: 'passed',
      targets: plannedTargets.map((planned, index) => ({
        targetKey: planned.targetKey,
        kind: planned.kind,
        matches: [{
          targetId: planned.kind === 'configRevision' ? CONFIG_TARGET_ID : TARGET_ID,
          createdAt: NOW,
          ownerId: EXPECTED_USER_ID,
          organizationId: ORGANIZATION_ID,
          resourceType: planned.resourceType,
          parentId: planned.kind === 'configRevision' ? TARGET_ID : null,
          relatedIds: index === 0 && planned.kind === 'assignment' ? QUESTION_IDS : [],
        }],
      })),
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
    targets: plannedTargets,
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

  it.each([
    {
      operationId: 'create-synthetic-written-question',
      targetKey: 'question-written',
      resourceType: 'essay',
      route: '/questions/new/essay',
      heading: 'สร้างโจทย์อัตนัย',
      editorSelector: '[contenteditable="true"][data-placeholder="พิมพ์เนื้อหาโจทย์ที่นี่..."]',
    },
    {
      operationId: 'create-synthetic-upload-question',
      targetKey: 'question-upload',
      resourceType: 'file_upload',
      route: '/questions/new/file-upload',
      heading: 'สร้างโจทย์ส่งไฟล์งาน',
      editorSelector: '[contenteditable="true"][data-placeholder^="พิมพ์คำสั่งงานที่นักเรียนต้องทำ"]',
    },
  ])('executes the audited $operationId selector flow', async ({
    operationId,
    targetKey,
    resourceType,
    route,
    heading,
    editorSelector,
  }) => {
    const harness = makeHarness({
      operationId,
      targetKey,
      targetKind: 'question',
      resourceType,
    })
    await harness.provider.resourcePlanCapability.readAccountBinding(
      bindingRequest(),
      callOptions(),
    )
    await harness.provider.resourcePlanCapability.prepareStep(
      prepareRequest(harness.runIdentity, { stepId: operationId }),
      callOptions(),
    )
    const ticket = await harness.provider.operationPlanCapability.issueOperationTicket(
      issueRequest({ operationId }),
      callOptions(),
    )
    const page = new FakePage({ flow: 'question' })
    await finishTicket(ticket, page)
    const attested = await harness.provider.resourcePlanCapability.attestStep(
      attestRequest(harness.runIdentity, { stepId: operationId }),
      callOptions(),
    )

    expect(attested.status).toBe('passed')
    expect(page.events).toContainEqual(['goto', `${SITE_ORIGIN}${route}`])
    expect(page.events).toContainEqual(['heading', heading])
    expect(page.values.get('#title')).toBe(harness.captured.marker)
    expect(page.values.get('input[placeholder="พิมพ์ชื่อวิชา เช่น ฟิสิกส์, เคมี"]')).toBe('วิทยาศาสตร์')
    expect(page.values.get(editorSelector)).toContain(harness.captured.marker)
    expect(page.events).toContainEqual(['click', 'บันทึกโจทย์'])
    expect(await harness.provider.closeAll()).toEqual({ status: 'passed' })
  })

  it.each([
    ['join-synthetic-student-to-classroom', 'student-primary', 'membership-primary'],
    ['join-secondary-student-to-classroom', 'student-secondary', 'membership-secondary'],
  ])('keeps the classroom code private while executing %s', async (
    operationId,
    alias,
    targetKey,
  ) => {
    const applySecretInputs = vi.fn(async request => {
      const input = request.page.locator('input[placeholder="รหัส 6 หลัก เช่น AB3X7Y"]')
      await input.fill('ABC123')
      return passed()
    })
    const harness = makeHarness({
      operationId,
      targetKey,
      targetKind: 'classroomMembership',
      resourceType: 'student',
      alias,
      role: 'student',
      materialOverrides: { applySecretInputs },
    })
    await harness.provider.resourcePlanCapability.readAccountBinding(
      bindingRequest({ alias, role: 'student' }),
      callOptions(),
    )
    await harness.provider.resourcePlanCapability.prepareStep(
      prepareRequest(harness.runIdentity, {
        stepId: operationId,
        alias,
        role: 'student',
      }),
      callOptions(),
    )
    const ticket = await harness.provider.operationPlanCapability.issueOperationTicket(
      issueRequest({ alias, operationId }),
      callOptions(),
    )
    const page = new FakePage()
    await finishTicket(ticket, page)
    expect(page.values.get('input[placeholder="รหัส 6 หลัก เช่น AB3X7Y"]')).toBe('ABC123')
    expect(page.events).toContainEqual(['click', 'เข้าร่วม'])
    expect(applySecretInputs).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(ticket)).not.toContain('ABC123')
  })

  it('creates and attests one SEB draft with a private per-assignment quit password', async () => {
    const operationId = 'create-seb-assignment-draft-with-quit-password'
    let privatePassword = null
    const applySecretInputs = vi.fn(async request => {
      privatePassword = 'OnlyInsidePrivateClosure_123456'
      await request.page.locator('#create-seb-quit-password').fill(privatePassword)
      await request.page.locator('#create-seb-quit-confirmation').fill(privatePassword)
      return passed()
    })
    const harness = makeHarness({
      operationId,
      targets: [
        { targetKey: 'assignment-primary', kind: 'assignment', resourceType: 'exam' },
        { targetKey: 'config-primary', kind: 'configRevision', resourceType: 'seb_required' },
      ],
      materialOverrides: { applySecretInputs },
      supportsPublish: true,
    })
    await harness.provider.resourcePlanCapability.readAccountBinding(
      bindingRequest(),
      callOptions(),
    )
    const prepared = await harness.provider.resourcePlanCapability.prepareStep(
      prepareRequest(harness.runIdentity, { stepId: operationId }),
      callOptions(),
    )
    const ticket = await harness.provider.operationPlanCapability.issueOperationTicket(
      issueRequest({ operationId }),
      callOptions(),
    )
    const page = new FakePage({ flow: 'assignment' })
    await finishTicket(ticket, page)
    const attested = await harness.provider.resourcePlanCapability.attestStep(
      attestRequest(harness.runIdentity, { stepId: operationId }),
      callOptions(),
    )

    expect(prepared.targets).toEqual(harness.targets)
    expect(attested.targets.map(target => target.targetKey)).toEqual([
      'assignment-primary',
      'config-primary',
    ])
    expect(page.values.get('#title')).toBe(harness.captured.marker)
    expect(page.values.get('#create-seb-quit-password')).toBe(privatePassword)
    expect(page.values.get('#create-seb-quit-confirmation')).toBe(privatePassword)
    expect(page.events).toContainEqual(['check', '#create-seb-required'])
    expect(page.events).toContainEqual(['click', 'สร้างชุดข้อสอบ'])
    expect(page.events).toContainEqual(['click', 'ยังไม่เผยแพร่ (เก็บไว้เป็นร่าง)'])
    expect(harness.captured.attest.targets).toEqual(harness.targets)
    expect(JSON.stringify(ticket)).not.toContain(privatePassword)
    expect(JSON.stringify(attested)).not.toContain(privatePassword)

    const publishStep = 'publish-seb-assignment'
    const publishPrepared = await harness.provider.resourcePlanCapability.prepareStep(
      prepareRequest(harness.runIdentity, { stepId: publishStep }),
      callOptions(),
    )
    expect(publishPrepared.targets).toEqual([])
    const publishTicket = await harness.provider.operationPlanCapability.issueOperationTicket(
      issueRequest({ operationId: publishStep }),
      callOptions(),
    )
    const publishPage = new FakePage({ flow: 'publish' })
    await finishTicket(publishTicket, publishPage)
    const published = await harness.provider.resourcePlanCapability.attestStep(
      attestRequest(harness.runIdentity, { stepId: publishStep }),
      callOptions(),
    )
    expect(published.targets).toEqual([])
    expect(publishPage.events).toContainEqual([
      'goto',
      `${SITE_ORIGIN}/assignments/${TARGET_ID}`,
    ])
    expect(publishPage.events).toContainEqual(['click', 'เผยแพร่'])
    expect(publishPage.events).toContainEqual(['text', 'เผยแพร่แล้ว'])
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

  it('attests the browser-broker cross-account probes without issuing a page ticket', async () => {
    const operationId = 'verify-cross-account-boundaries'
    const harness = makeHarness({
      operationId,
      alias: null,
      role: null,
      targets: [],
      supportsPublish: true,
    })
    const prepared = await harness.provider.resourcePlanCapability.prepareStep(
      prepareRequest(harness.runIdentity, {
        stepId: operationId,
        alias: null,
        role: null,
        expectedUserId: null,
      }),
      callOptions(),
    )
    expect(prepared.targets).toEqual([])
    const attested = await harness.provider.resourcePlanCapability.attestStep(
      attestRequest(harness.runIdentity, { stepId: operationId }),
      callOptions(),
    )
    expect(attested).toMatchObject({ stepId: operationId, status: 'passed', targets: [] })
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
