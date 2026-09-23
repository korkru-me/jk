import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingBrowserOperationRuntimeBlockedError,
  createSebStagingBrowserOperationRuntime,
  listSebStagingBrowserOperationContracts,
} from './seb-staging-browser-operation-runtime.mjs'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const NAMESPACE = 'qa:seb-s5-operation-runtime-1'
const USER_IDS = Object.freeze({
  'teacher-primary': '00000000-0000-4000-8000-000000000001',
  'teacher-unrelated': '00000000-0000-4000-8000-000000000002',
  'student-primary': '00000000-0000-4000-8000-000000000003',
  'student-secondary': '00000000-0000-4000-8000-000000000004',
})
const SENTINELS = Object.freeze([
  'cookie-SENTINEL-never-expose',
  'password-SENTINEL-never-expose',
  'ticket-SENTINEL-never-expose',
  'dom-SENTINEL-never-expose',
  'ck-SENTINEL-never-expose',
  'bek-SENTINEL-never-expose',
])
const TICKET_METHODS = Object.freeze([
  'applyMarkers',
  'navigate',
  'applySecrets',
  'applyUploads',
  'beginMutation',
  'finish',
  'abort',
])
const EXPECTED_OPERATION_ALIASES = Object.freeze(new Map([
  ['create-subject-classroom', 'teacher-primary'],
  ['create-synthetic-written-question', 'teacher-primary'],
  ['create-synthetic-upload-question', 'teacher-primary'],
  ['join-synthetic-student-to-classroom', 'student-primary'],
  ['join-secondary-student-to-classroom', 'student-secondary'],
  ['create-seb-assignment-draft-with-quit-password', 'teacher-primary'],
  ['publish-seb-assignment', 'teacher-primary'],
  ['reject-invalid-seb-challenge', 'student-primary'],
  ['verify-seb-system-check', 'student-primary'],
  ['reject-replayed-seb-challenge', 'student-primary'],
  ['reject-invalid-seb-session', 'student-primary'],
  ['start-revision-bound-attempt', 'student-primary'],
  ['reject-replayed-seb-session', 'student-primary'],
  ['autosave-synthetic-answer', 'student-primary'],
  ['retry-autosave-after-transient-failure', 'student-primary'],
  ['resume-same-attempt', 'student-primary'],
  ['upload-synthetic-attachment', 'student-primary'],
  ['retry-upload-after-transient-failure', 'student-primary'],
  ['record-proctor-heartbeat', 'student-primary'],
  ['student-denied-teacher-result', 'student-primary'],
  ['submit-attempt', 'student-primary'],
  ['teacher-read-submitted-result', 'teacher-primary'],
  ['secondary-student-denied-primary-attempt', 'student-secondary'],
  ['unrelated-teacher-denied-assignment-result', 'teacher-unrelated'],
]))

function passed() {
  return Object.freeze({ status: 'passed' })
}

function validEnvironment(overrides = {}) {
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

class FakePage {
  constructor() {
    this.privateCookie = SENTINELS[0]
    this.privateDom = SENTINELS[3]
    this.closed = false
    this.contextValue = Object.freeze({ pages: () => [this] })
  }

  url() {
    return `${SITE_ORIGIN}/private-${SENTINELS[2]}`
  }

  locator() {
    return Object.freeze({})
  }

  getByRole() {
    return Object.freeze({})
  }

  context() {
    return this.contextValue
  }

  isClosed() {
    return this.closed
  }
}

function exactTicketCall(input, page) {
  expect(Object.isFrozen(input)).toBe(true)
  expect(Object.keys(input).sort()).toEqual(['page', 'signal'])
  expect(input.page).toBe(page)
  expect(input.signal).toBeInstanceOf(AbortSignal)
}

function makeTicket(events, page, overrides = {}) {
  const ticket = {}
  for (const method of TICKET_METHODS) {
    ticket[method] = vi.fn(async input => {
      exactTicketCall(input, page)
      events.push(method)
      if (overrides[method]) return overrides[method](input)
      return passed()
    })
  }
  return Object.freeze(ticket)
}

function makeHarness({
  environmentOverrides,
  ticketFactory,
  native = false,
  issueOverride,
} = {}) {
  const events = []
  const page = new FakePage()
  let environment = validEnvironment(environmentOverrides)
  const issuedTickets = []
  const issueOperationTicket = vi.fn(async (request, options) => {
    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.keys(request).sort()).toEqual([
      'alias',
      'expectedUserId',
      'namespace',
      'operationId',
      'targetOrigin',
    ])
    expect(request.targetOrigin).toBe(SITE_ORIGIN)
    expect(request.namespace).toBe(NAMESPACE)
    expect(Object.isFrozen(options)).toBe(true)
    expect(Object.keys(options)).toEqual(['signal'])
    expect(options.signal).toBeInstanceOf(AbortSignal)
    events.push(`issue:${request.operationId}`)
    if (issueOverride) return issueOverride(request, options)
    const ticket = ticketFactory
      ? ticketFactory({ events, page, request, options })
      : makeTicket(events, page)
    issuedTickets.push(ticket)
    return ticket
  })
  const privateOperationPlanCapability = Object.freeze({ issueOperationTicket })
  const executeNativeOperation = vi.fn(async input => {
    expect(Object.isFrozen(input)).toBe(true)
    expect(Object.keys(input).sort()).toEqual([
      'alias',
      'expectedUserId',
      'namespace',
      'operationId',
      'page',
      'signal',
      'targetOrigin',
    ])
    expect(input.targetOrigin).toBe(SITE_ORIGIN)
    expect(input.namespace).toBe(NAMESPACE)
    expect(input.page).toBe(page)
    expect(input.signal).toBeInstanceOf(AbortSignal)
    events.push(`native:${input.operationId}`)
    return passed()
  })
  const runtime = createSebStagingBrowserOperationRuntime({
    namespace: NAMESPACE,
    readEnvironment: () => environment,
    privateOperationPlanCapability,
    ...(native
      ? { nativeSebCapability: Object.freeze({ executeNativeOperation }) }
      : {}),
  })
  return {
    events,
    page,
    runtime,
    issuedTickets,
    issueOperationTicket,
    executeNativeOperation,
    setEnvironment(value) {
      environment = value
    },
  }
}

function runnerInput(page, operationId, alias, overrides = {}) {
  const controller = new AbortController()
  return Object.freeze({
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    alias,
    expectedUserId: USER_IDS[alias],
    operationId,
    payload: Object.freeze({}),
    page,
    signal: controller.signal,
    ...overrides,
  })
}

function assertNoSentinel(value) {
  const serialized = value instanceof Error
    ? `${value.name}:${value.message}`
    : JSON.stringify(value)
  for (const sentinel of SENTINELS) expect(serialized).not.toContain(sentinel)
}

function deferred() {
  let resolve
  const promise = new Promise(value => {
    resolve = value
  })
  return { promise, resolve }
}

describe('SEB Staging browser operation runtime', () => {
  it('exposes an exact frozen two-method API and frozen contracts', () => {
    const harness = makeHarness()
    expect(Object.isFrozen(harness.runtime)).toBe(true)
    expect(Object.keys(harness.runtime).sort()).toEqual(['closeAll', 'sessionOperationRunner'])
    expect(typeof harness.runtime.sessionOperationRunner).toBe('function')
    expect(typeof harness.runtime.closeAll).toBe('function')

    const contracts = listSebStagingBrowserOperationContracts()
    expect(Object.isFrozen(contracts)).toBe(true)
    expect(contracts).toHaveLength(24)
    expect(contracts.every(value => Object.isFrozen(value))).toBe(true)
    expect(contracts.map(value => [value.operationId, value.alias])).toEqual(
      [...EXPECTED_OPERATION_ALIASES.entries()],
    )
    expect(contracts.every(value => (
      Object.keys(value).sort().join(',')
        === 'alias,allowsRetry,mutates,operationId,requiresNative'
    ))).toBe(true)
  })

  it.each([
    ['unsafe namespace', { namespace: 'qa:seb-s5-production' }],
    ['preview placeholder', { namespace: 'qa:seb-s5-preview' }],
    ['wrong site', { environmentOverrides: { NEXT_PUBLIC_SITE_URL: 'https://www.korkru.com' } }],
    ['wrong Supabase project', { environmentOverrides: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' } }],
    ['production Vercel', { environmentOverrides: { VERCEL_ENV: 'production' } }],
  ])('fails closed at construction for %s', (_label, value) => {
    const capability = Object.freeze({ issueOperationTicket: vi.fn() })
    expect(() => createSebStagingBrowserOperationRuntime({
      namespace: value.namespace ?? NAMESPACE,
      readEnvironment: () => validEnvironment(value.environmentOverrides),
      privateOperationPlanCapability: capability,
    })).toThrow(SebStagingBrowserOperationRuntimeBlockedError)
  })

  it('requires an exact frozen private capability and rejects prepare/attest expansion', () => {
    const issueOperationTicket = vi.fn()
    const expanded = Object.freeze({
      issueOperationTicket,
      prepareStep: vi.fn(),
      attestStep: vi.fn(),
    })
    expect(() => createSebStagingBrowserOperationRuntime({
      namespace: NAMESPACE,
      readEnvironment: validEnvironment,
      privateOperationPlanCapability: expanded,
    })).toThrow(SebStagingBrowserOperationRuntimeBlockedError)
    expect(issueOperationTicket).not.toHaveBeenCalled()
    expect(expanded.prepareStep).not.toHaveBeenCalled()
    expect(expanded.attestStep).not.toHaveBeenCalled()
  })

  it.each([
    ['create-subject-classroom', 'teacher-primary'],
    ['resume-same-attempt', 'student-primary'],
    ['teacher-read-submitted-result', 'teacher-primary'],
    ['secondary-student-denied-primary-attempt', 'student-secondary'],
    ['unrelated-teacher-denied-assignment-result', 'teacher-unrelated'],
  ])('binds %s to its exact alias and one empty payload', async (operationId, alias) => {
    const harness = makeHarness()
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, operationId, alias),
    )).resolves.toEqual({ status: 'passed' })
    expect(harness.issueOperationTicket).toHaveBeenCalledTimes(1)

    const wrongAlias = alias === 'teacher-primary' ? 'student-primary' : 'teacher-primary'
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, operationId, wrongAlias),
    )).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    expect(harness.issueOperationTicket).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['wrong origin', input => Object.freeze({ ...input, targetOrigin: 'https://www.korkru.com' })],
    ['wrong namespace', input => Object.freeze({ ...input, namespace: 'qa:seb-s5-other' })],
    ['invalid UUID', input => Object.freeze({ ...input, expectedUserId: 'student-primary' })],
    ['unknown operation', input => Object.freeze({ ...input, operationId: 'read-production' })],
    ['non-empty payload', input => Object.freeze({ ...input, payload: Object.freeze({ id: 'caller-controlled' }) })],
    ['unfrozen payload', input => Object.freeze({ ...input, payload: {} })],
    ['extra field', input => Object.freeze({ ...input, cookie: SENTINELS[0] })],
  ])('rejects %s before issuing a ticket', async (_label, mutate) => {
    const harness = makeHarness()
    const input = runnerInput(harness.page, 'create-subject-classroom', 'teacher-primary')
    await expect(harness.runtime.sessionOperationRunner(mutate(input)))
      .rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    expect(harness.issueOperationTicket).not.toHaveBeenCalled()
  })

  it('uses an exact one-shot ticket and detects reuse', async () => {
    const events = []
    const page = new FakePage()
    const reusedTicket = makeTicket(events, page)
    const harness = makeHarness({
      ticketFactory: () => reusedTicket,
    })
    // The harness page must be the ticket-bound page.
    for (const method of TICKET_METHODS) {
      reusedTicket[method].mockImplementation(async input => {
        exactTicketCall(input, harness.page)
        events.push(method)
        return passed()
      })
    }

    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'resume-same-attempt', 'student-primary'),
    )).resolves.toEqual({ status: 'passed' })
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'resume-same-attempt', 'student-primary'),
    )).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    expect(harness.issueOperationTicket).toHaveBeenCalledTimes(2)
    expect(reusedTicket.navigate).toHaveBeenCalledTimes(1)
  })

  it('runs preparation before one immediately-adjacent mutation boundary', async () => {
    const harness = makeHarness()
    await harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'create-subject-classroom', 'teacher-primary'),
    )
    expect(harness.events).toEqual([
      'issue:create-subject-classroom',
      'navigate',
      'applyMarkers',
      'applySecrets',
      'applyUploads',
      'beginMutation',
      'finish',
    ])
    expect(harness.events.at(-2)).toBe('beginMutation')
    expect(harness.events.at(-1)).toBe('finish')
  })

  it('never opens a mutation boundary for a read-only operation', async () => {
    const harness = makeHarness()
    await harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'resume-same-attempt', 'student-primary'),
    )
    expect(harness.events).toEqual([
      'issue:resume-same-attempt',
      'navigate',
      'applyMarkers',
      'applySecrets',
      'applyUploads',
      'finish',
    ])
    expect(harness.events).not.toContain('beginMutation')
  })

  it('fails native-required operations before ticket issue when native capability is absent', async () => {
    const harness = makeHarness()
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'verify-seb-system-check', 'student-primary'),
    )).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    expect(harness.issueOperationTicket).not.toHaveBeenCalled()
  })

  it('uses the exact native capability once when present', async () => {
    const harness = makeHarness({ native: true })
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'verify-seb-system-check', 'student-primary'),
    )).resolves.toEqual({ status: 'passed' })
    expect(harness.executeNativeOperation).toHaveBeenCalledTimes(1)
    expect(harness.events).toEqual([
      'issue:verify-seb-system-check',
      'navigate',
      'applyMarkers',
      'applySecrets',
      'applyUploads',
      'beginMutation',
      'native:verify-seb-system-check',
      'finish',
    ])
  })

  it('does not perform transparent retries; retry IDs receive distinct one-shot tickets', async () => {
    let ticketNumber = 0
    const harness = makeHarness({
      ticketFactory: ({ events, page }) => {
        ticketNumber += 1
        return makeTicket(events, page, ticketNumber === 1
          ? { finish: async () => { throw new Error('ambiguous transient failure') } }
          : {})
      },
    })
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'autosave-synthetic-answer', 'student-primary'),
    )).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    expect(harness.issueOperationTicket).toHaveBeenCalledTimes(1)

    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'retry-autosave-after-transient-failure', 'student-primary'),
    )).resolves.toEqual({ status: 'passed' })
    expect(harness.issueOperationTicket).toHaveBeenCalledTimes(2)
    expect(harness.issueOperationTicket.mock.calls.map(([value]) => value.operationId)).toEqual([
      'autosave-synthetic-answer',
      'retry-autosave-after-transient-failure',
    ])
  })

  it('aborts an ambiguous ticket once and redacts the underlying failure', async () => {
    const harness = makeHarness({
      ticketFactory: ({ events, page }) => makeTicket(events, page, {
        finish: async () => { throw new Error(SENTINELS.join('|')) },
      }),
    })
    let failure
    try {
      await harness.runtime.sessionOperationRunner(
        runnerInput(harness.page, 'submit-attempt', 'student-primary'),
      )
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    assertNoSentinel(failure)
    expect(harness.issuedTickets[0].abort).toHaveBeenCalledTimes(1)
    expect(harness.issuedTickets[0].finish).toHaveBeenCalledTimes(1)
  })

  it('uses a fresh non-aborted cleanup signal after the parent signal aborts', async () => {
    const controller = new AbortController()
    let cleanupSignal = null
    const harness = makeHarness({
      ticketFactory: ({ events, page }) => makeTicket(events, page, {
        finish: async () => {
          controller.abort()
          return passed()
        },
        abort: async input => {
          cleanupSignal = input.signal
          return passed()
        },
      }),
    })
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'submit-attempt', 'student-primary', {
        signal: controller.signal,
      }),
    )).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    expect(controller.signal.aborted).toBe(true)
    expect(cleanupSignal).toBeInstanceOf(AbortSignal)
    expect(cleanupSignal).not.toBe(controller.signal)
    expect(cleanupSignal.aborted).toBe(false)
    expect(harness.issuedTickets[0].abort).toHaveBeenCalledTimes(1)
  })

  it('rechecks the write gate after uploads and aborts before beginMutation', async () => {
    let disableWrites = () => {}
    const harness = makeHarness({
      ticketFactory: ({ events, page }) => makeTicket(events, page, {
        applyUploads: async () => {
          disableWrites()
          return passed()
        },
      }),
    })
    disableWrites = () => harness.setEnvironment(validEnvironment({
      EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'false',
    }))
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'upload-synthetic-attachment', 'student-primary'),
    )).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    expect(harness.issuedTickets[0].beginMutation).not.toHaveBeenCalled()
    expect(harness.issuedTickets[0].finish).not.toHaveBeenCalled()
    expect(harness.issuedTickets[0].abort).toHaveBeenCalledTimes(1)
    expect(harness.events).toEqual([
      'issue:upload-synthetic-attachment',
      'navigate',
      'applyMarkers',
      'applySecrets',
      'applyUploads',
      'abort',
    ])
  })

  it('sanitizes a sentinel-bearing ticket issuance failure', async () => {
    const harness = makeHarness({
      issueOverride: async () => {
        throw new Error(SENTINELS.join('|'))
      },
    })
    let failure
    try {
      await harness.runtime.sessionOperationRunner(
        runnerInput(harness.page, 'create-subject-classroom', 'teacher-primary'),
      )
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    assertNoSentinel(failure)
    expect(harness.issueOperationTicket).toHaveBeenCalledTimes(1)
    expect(harness.issuedTickets).toHaveLength(0)
  })

  it('keeps an abort-failed ticket open until a later closeAll retry succeeds', async () => {
    let abortCalls = 0
    const harness = makeHarness({
      ticketFactory: ({ events, page }) => makeTicket(events, page, {
        finish: async () => {
          throw new Error('ambiguous mutation')
        },
        abort: async () => {
          abortCalls += 1
          if (abortCalls <= 2) throw new Error('cleanup temporarily unavailable')
          return passed()
        },
      }),
    })
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'submit-attempt', 'student-primary'),
    )).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    expect(abortCalls).toBe(1)
    await expect(harness.runtime.closeAll()).resolves.toEqual({ status: 'failed' })
    expect(abortCalls).toBe(2)
    await expect(harness.runtime.closeAll()).resolves.toEqual({ status: 'passed' })
    expect(abortCalls).toBe(3)
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'resume-same-attempt', 'student-primary'),
    )).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
  })

  it('times out an unsettled abort, blocks new work, and permits cleanup only after settlement', async () => {
    vi.useFakeTimers()
    try {
      const abortEntered = deferred()
      const settleOldAbort = deferred()
      let abortCalls = 0
      const harness = makeHarness({
        ticketFactory: ({ events, page }) => makeTicket(events, page, {
          finish: async () => {
            throw new Error('ambiguous mutation')
          },
          abort: async () => {
            abortCalls += 1
            if (abortCalls === 1) {
              abortEntered.resolve()
              return settleOldAbort.promise
            }
            return passed()
          },
        }),
      })
      const operation = harness.runtime.sessionOperationRunner(
        runnerInput(harness.page, 'submit-attempt', 'student-primary'),
      )
      await abortEntered.promise
      let operationSettled = false
      const observedOperation = operation.then(
        value => ({ value, error: null }),
        error => ({ value: null, error }),
      ).finally(() => {
        operationSettled = true
      })
      await vi.advanceTimersByTimeAsync(4_999)
      expect(operationSettled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      const observed = await observedOperation
      expect(observed.value).toBeNull()
      expect(observed.error).toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
      expect(abortCalls).toBe(1)

      await expect(harness.runtime.sessionOperationRunner(
        runnerInput(harness.page, 'resume-same-attempt', 'student-primary'),
      )).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
      expect(harness.issueOperationTicket).toHaveBeenCalledTimes(1)

      await expect(harness.runtime.closeAll()).resolves.toEqual({ status: 'failed' })
      expect(abortCalls).toBe(1)

      settleOldAbort.resolve(passed())
      await vi.advanceTimersByTimeAsync(0)
      await expect(harness.runtime.closeAll()).resolves.toEqual({ status: 'passed' })
      expect(abortCalls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('blocks mutation when closeAll starts while applyUploads is still pending', async () => {
    const uploadsEntered = deferred()
    const releaseUploads = deferred()
    const harness = makeHarness({
      ticketFactory: ({ events, page }) => makeTicket(events, page, {
        applyUploads: async () => {
          uploadsEntered.resolve()
          await releaseUploads.promise
          return passed()
        },
      }),
    })
    const operation = harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'upload-synthetic-attachment', 'student-primary'),
    )
    await uploadsEntered.promise
    await expect(harness.runtime.closeAll()).resolves.toEqual({ status: 'failed' })
    releaseUploads.resolve()
    await expect(operation).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    expect(harness.issuedTickets[0].beginMutation).not.toHaveBeenCalled()
    expect(harness.issuedTickets[0].finish).not.toHaveBeenCalled()
    expect(harness.issuedTickets[0].abort).toHaveBeenCalledTimes(1)
    await expect(harness.runtime.closeAll()).resolves.toEqual({ status: 'passed' })
  })

  it('serializes concurrent closeAll calls while retrying an open-ticket abort', async () => {
    const retryAbortEntered = deferred()
    const releaseRetryAbort = deferred()
    let abortCalls = 0
    const harness = makeHarness({
      ticketFactory: ({ events, page }) => makeTicket(events, page, {
        finish: async () => {
          throw new Error('ambiguous mutation')
        },
        abort: async () => {
          abortCalls += 1
          if (abortCalls === 1) throw new Error('initial abort unavailable')
          retryAbortEntered.resolve()
          await releaseRetryAbort.promise
          return passed()
        },
      }),
    })
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'submit-attempt', 'student-primary'),
    )).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    expect(abortCalls).toBe(1)

    const firstClose = harness.runtime.closeAll()
    await retryAbortEntered.promise
    await expect(harness.runtime.closeAll()).resolves.toEqual({ status: 'failed' })
    expect(abortCalls).toBe(2)
    releaseRetryAbort.resolve()
    await expect(firstClose).resolves.toEqual({ status: 'passed' })
    expect(abortCalls).toBe(2)
  })

  it('fails close while busy, blocks new work, then closes after outer abort quiesces', async () => {
    const entered = deferred()
    const release = deferred()
    const controller = new AbortController()
    const harness = makeHarness({
      ticketFactory: ({ events, page }) => makeTicket(events, page, {
        navigate: async input => {
          entered.resolve()
          await release.promise
          if (input.signal.aborted) throw new Error('aborted')
          return passed()
        },
      }),
    })
    const operation = harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'create-subject-classroom', 'teacher-primary', {
        signal: controller.signal,
      }),
    )
    await entered.promise
    await expect(harness.runtime.closeAll()).resolves.toEqual({ status: 'failed' })
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'resume-same-attempt', 'student-primary'),
    )).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    controller.abort()
    release.resolve()
    await expect(operation).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    await expect(harness.runtime.closeAll()).resolves.toEqual({ status: 'passed' })
    await expect(harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'resume-same-attempt', 'student-primary'),
    )).rejects.toBeInstanceOf(SebStagingBrowserOperationRuntimeBlockedError)
    expect(harness.issueOperationTicket).toHaveBeenCalledTimes(1)
  })

  it('returns only a coarse frozen pass result with no page, URL, ID, DOM, cookie, CK or BEK leak', async () => {
    const harness = makeHarness()
    const result = await harness.runtime.sessionOperationRunner(
      runnerInput(harness.page, 'create-seb-assignment-draft-with-quit-password', 'teacher-primary'),
    )
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.keys(result)).toEqual(['status'])
    expect(result).toEqual({ status: 'passed' })
    assertNoSentinel(result)
    assertNoSentinel(harness.runtime)
    const issueRequest = harness.issueOperationTicket.mock.calls[0][0]
    expect(issueRequest).not.toHaveProperty('page')
    expect(issueRequest).not.toHaveProperty('payload')
    expect(issueRequest).not.toHaveProperty('cookie')
    expect(issueRequest).not.toHaveProperty('url')
    expect(issueRequest).not.toHaveProperty('ck')
    expect(issueRequest).not.toHaveProperty('bek')
  })
})
