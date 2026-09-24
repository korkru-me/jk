import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingSupabaseNarrowDriverBlockedError,
  createSebStagingSupabaseLedgerReconciliationAttestation,
  createSebStagingSupabaseNarrowDriver,
  createSebStagingSupabaseNarrowDriverFactory,
} from './seb-staging-supabase-narrow-driver.mjs'

const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SITE_ORIGIN = 'https://staging.korkru.com'
const NAMESPACE = 'qa:seb-s5-narrow-driver-1'
const SERVICE_ROLE_SENTINEL = 'service-role-SENTINEL-never-return-1234567890'
const CREATED_AT = '2026-09-23T10:05:00.000Z'
const IDENTITY = Object.freeze({
  runId: 'seb-s5-narrow-driver-1',
  sourceRevision: 'a'.repeat(40),
  deploymentId: 'dpl_1234567890abcdef',
  creationWindow: Object.freeze({
    notBefore: '2026-09-23T10:00:00.000Z',
    notAfter: '2026-09-23T11:00:00.000Z',
  }),
})

function uuid(index) {
  return `${String(index).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`
}

const IDS = Object.freeze({
  teacher: uuid(1),
  organization: uuid(2),
  membership: uuid(3),
  assignment: uuid(4),
  submission: uuid(5),
  student: uuid(6),
  answer: uuid(7),
  upload: uuid(8),
  event: '9223372036854775806',
})

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

function credential(overrides = {}) {
  return {
    schemaVersion: 1,
    targetOrigin: SUPABASE_ORIGIN,
    credentialKind: 'service-role',
    namespace: NAMESPACE,
    serviceRoleKey: SERVICE_ROLE_SENTINEL,
    ...overrides,
  }
}

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function binaryResponse(value, mimeType) {
  return new Response(value, {
    status: 200,
    headers: {
      'content-type': mimeType,
      'content-length': String(value.byteLength),
    },
  })
}

function bindResponseUrl(response, url) {
  if (response instanceof Response && response.url === '') {
    Object.defineProperty(response, 'url', { configurable: true, value: String(url) })
  }
  return response
}

function createHarness({
  environment = validEnvironment(),
  providerResult = credential(),
  fetchImplementation = vi.fn(async () => jsonResponse([])),
  boundaryTimeoutMs = 1_000,
} = {}) {
  const state = { environment }
  const readEnvironment = vi.fn(() => ({ ...state.environment }))
  const serviceRoleCredentialProvider = vi.fn(async () => providerResult)
  const exactFetchImplementation = async (url, init) => bindResponseUrl(
    await fetchImplementation(url, init),
    url,
  )
  const options = {
    readEnvironment,
    namespace: NAMESPACE,
    serviceRoleCredentialProvider,
    fetchImplementation: exactFetchImplementation,
    boundaryTimeoutMs,
  }
  return { state, options, readEnvironment, serviceRoleCredentialProvider, fetchImplementation }
}

function enumerateRequest(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: 'enumerate:proctor-event',
    table: 'exam_proctor_events',
    columns: [
      'id', 'submission_id', 'assignment_id', 'student_id', 'org_id',
      'event_type', 'created_at',
    ],
    predicates: [{ column: 'id', operator: 'eq', value: IDS.event }],
    limit: 9,
    ...overrides,
  }
}

function eventRow(overrides = {}) {
  return {
    id: IDS.event,
    submission_id: IDS.submission,
    assignment_id: IDS.assignment,
    student_id: IDS.student,
    org_id: IDS.organization,
    event_type: 'monitoring_started',
    created_at: CREATED_AT,
    ...overrides,
  }
}

function directDeleteRequest(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: 'delete:proctor-event',
    table: 'exam_proctor_events',
    predicates: [
      { column: 'id', operator: 'eq', value: IDS.event },
      { column: 'student_id', operator: 'eq', value: IDS.student },
      { column: 'org_id', operator: 'eq', value: IDS.organization },
      { column: 'created_at', operator: 'gte', value: IDENTITY.creationWindow.notBefore },
      { column: 'created_at', operator: 'lte', value: IDENTITY.creationWindow.notAfter },
    ],
    maxRows: 1,
    atomicClosure: null,
    ...overrides,
  }
}

function organizationDeleteRequest(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: 'personal-organization:delete-organization',
    table: 'organizations',
    predicates: [
      { column: 'id', operator: 'eq', value: IDS.organization },
      { column: 'is_personal', operator: 'eq', value: true },
      { column: 'subscription_tier', operator: 'eq', value: 'free' },
      { column: 'deleted_at', operator: 'is', value: null },
      { column: 'created_at', operator: 'gte', value: IDENTITY.creationWindow.notBefore },
      { column: 'created_at', operator: 'lte', value: IDENTITY.creationWindow.notAfter },
    ],
    maxRows: 1,
    atomicClosure: {
      schemaVersion: 1,
      isolation: 'serializable-parent-lock',
      requireAbsent: [{
        table: 'org_invitations',
        predicates: [{ column: 'org_id', operator: 'eq', value: IDS.organization }],
        expectedCount: 0,
      }],
      requireExact: [{
        table: 'organization_members',
        predicates: [
          { column: 'id', operator: 'eq', value: IDS.membership },
          { column: 'org_id', operator: 'eq', value: IDS.organization },
          { column: 'user_id', operator: 'eq', value: IDS.teacher },
          { column: 'org_role', operator: 'eq', value: 'owner' },
          { column: 'joined_at', operator: 'gte', value: IDENTITY.creationWindow.notBefore },
          { column: 'joined_at', operator: 'lte', value: IDENTITY.creationWindow.notAfter },
        ],
        expectedCount: 1,
      }],
      allowedCascadeTables: ['organization_members'],
    },
    ...overrides,
  }
}

function storageRequest(bucketName, path, overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: 'assignment-artifact:enumerate',
    bucketName,
    path,
    limit: 9,
    ...overrides,
  }
}

function storageMetadata(bucketName, path, value, overrides = {}) {
  return {
    schemaVersion: 1,
    objects: [{
      bucketName,
      path,
      ownerId: bucketName === 'submission-files' ? IDS.student : null,
      createdAt: CREATED_AT,
      sizeBytes: value.byteLength,
      mimeType: bucketName === 'submission-files' ? 'application/pdf' : 'application/seb',
      ...overrides,
    }],
  }
}

function options() {
  return { signal: new AbortController().signal }
}

function ledgerCriteria(overrides = {}) {
  return {
    schemaVersion: 1,
    targetKey: 'assignment-primary',
    kind: 'assignment',
    identity: structuredClone(IDENTITY),
    namespace: NAMESPACE,
    ownerId: IDS.teacher,
    organizationId: IDS.organization,
    resourceType: 'exam',
    creationWindow: structuredClone(IDENTITY.creationWindow),
    ...overrides,
  }
}

function ledgerCandidate(overrides = {}) {
  return {
    schemaVersion: 1,
    targetKey: 'assignment-primary',
    kind: 'assignment',
    identity: structuredClone(IDENTITY),
    targetId: IDS.assignment,
    namespace: NAMESPACE,
    ownerId: IDS.teacher,
    organizationId: IDS.organization,
    resourceType: 'exam',
    createdAt: CREATED_AT,
    ...overrides,
  }
}

describe('SEB Staging Supabase narrow driver', () => {
  it('provides the exact two callbacks needed by the cleanup runtime', async () => {
    const harness = createHarness({
      fetchImplementation: vi.fn(async () => jsonResponse([eventRow()])),
    })
    const { namespace: _namespace, ...boundaryOptions } = harness.options
    const boundary = createSebStagingSupabaseNarrowDriverFactory(boundaryOptions)
    expect(Object.keys(boundary).sort()).toEqual([
      'createServiceRoleClient', 'serviceRoleCredentialProvider',
    ])

    const controller = new AbortController()
    const providerRequest = Object.freeze({
      schemaVersion: 1,
      targetOrigin: SUPABASE_ORIGIN,
      credentialKind: 'service-role',
      namespace: NAMESPACE,
      signal: controller.signal,
    })
    await expect(boundary.serviceRoleCredentialProvider(providerRequest))
      .resolves.toEqual(credential())
    const driver = await boundary.createServiceRoleClient(Object.freeze({
      ...providerRequest,
      serviceRoleKey: SERVICE_ROLE_SENTINEL,
    }))
    expect(Object.keys(driver).sort()).toEqual([
      'close', 'credentialKind', 'deleteDatabase', 'deleteStorage',
      'enumerateDatabase', 'enumerateStorage', 'supabaseUrl',
    ])
    await expect(driver.enumerateDatabase(enumerateRequest(), options()))
      .resolves.toEqual({ rows: [eventRow()] })
    // The wrapped driver uses only the credential already attested by the
    // runtime; the original provider is not invoked a second time.
    expect(harness.serviceRoleCredentialProvider).toHaveBeenCalledTimes(1)
  })

  it('returns only the frozen raw driver shape and keeps credential acquisition closure-private', async () => {
    const harness = createHarness({
      fetchImplementation: vi.fn(async () => jsonResponse([eventRow()])),
    })
    const driver = await createSebStagingSupabaseNarrowDriver(harness.options)

    expect(Object.keys(driver).sort()).toEqual([
      'close', 'credentialKind', 'deleteDatabase', 'deleteStorage',
      'enumerateDatabase', 'enumerateStorage', 'supabaseUrl',
    ])
    expect(Object.isFrozen(driver)).toBe(true)
    expect(driver.supabaseUrl).toBe(SUPABASE_ORIGIN)
    expect(driver.credentialKind).toBe('service-role')
    expect(JSON.stringify(driver)).not.toContain(SERVICE_ROLE_SENTINEL)
    expect(harness.serviceRoleCredentialProvider).not.toHaveBeenCalled()

    await driver.enumerateDatabase(enumerateRequest(), options())
    expect(harness.serviceRoleCredentialProvider).toHaveBeenCalledTimes(1)
    const providerRequest = harness.serviceRoleCredentialProvider.mock.calls[0][0]
    expect(Object.keys(providerRequest).sort()).toEqual([
      'credentialKind', 'namespace', 'schemaVersion', 'signal', 'targetOrigin',
    ])
    expect(providerRequest.targetOrigin).toBe(SUPABASE_ORIGIN)
    expect(providerRequest.credentialKind).toBe('service-role')
    expect(providerRequest.namespace).toBe(NAMESPACE)
  })

  it('selects only fixed safe columns and preserves bigint identifiers as decimal strings', async () => {
    const fetchImplementation = vi.fn(async (url, init) => {
      const parsed = new URL(url)
      expect(parsed.pathname).toBe('/rest/v1/exam_proctor_events')
      expect(parsed.searchParams.get('select')).toBe(
        'id::text,submission_id,assignment_id,student_id,org_id,event_type,created_at',
      )
      expect(parsed.searchParams.get('id')).toBe(`eq.${IDS.event}`)
      expect(parsed.searchParams.get('limit')).toBe('9')
      expect(init.headers.Authorization).toBe(`Bearer ${SERVICE_ROLE_SENTINEL}`)
      expect(init.redirect).toBe('error')
      expect(init.cache).toBe('no-store')
      return jsonResponse([eventRow()])
    })
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation }).options,
    )

    const response = await driver.enumerateDatabase(enumerateRequest(), options())
    expect(response).toEqual({ rows: [eventRow()] })
    expect(typeof response.rows[0].id).toBe('string')
    expect(Object.isFrozen(response.rows[0])).toBe(true)
  })

  it('allows only the non-secret classroom marker fields needed for exact attestation', async () => {
    const marker = 'SEB S5 seb-s5-narrow-driver-1 aaaaaaaaaaaaaaaaaaaaaaaa'
    const row = {
      id: uuid(9),
      teacher_id: IDS.teacher,
      org_id: IDS.organization,
      classroom_type: 'subject',
      name: marker,
      description: `Synthetic-only SEB Staging fixture ${marker}`,
      created_at: CREATED_AT,
    }
    const fetchImplementation = vi.fn(async url => {
      const parsed = new URL(url)
      expect(parsed.pathname).toBe('/rest/v1/classrooms')
      expect(parsed.searchParams.get('select')).toBe(
        'id,teacher_id,org_id,classroom_type,name,description,created_at',
      )
      expect(parsed.searchParams.get('name')).toBe(`eq.${marker}`)
      return jsonResponse([row])
    })
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation }).options,
    )

    await expect(driver.enumerateDatabase({
      schemaVersion: 1,
      operationId: 'attest:create-subject-classroom',
      table: 'classrooms',
      columns: [
        'id', 'teacher_id', 'org_id', 'classroom_type', 'name', 'description',
        'created_at',
      ],
      predicates: [
        { column: 'teacher_id', operator: 'eq', value: IDS.teacher },
        { column: 'org_id', operator: 'eq', value: IDS.organization },
        { column: 'classroom_type', operator: 'eq', value: 'subject' },
        { column: 'name', operator: 'eq', value: marker },
        { column: 'created_at', operator: 'gte', value: IDENTITY.creationWindow.notBefore },
        { column: 'created_at', operator: 'lte', value: IDENTITY.creationWindow.notAfter },
      ],
      limit: 2,
    }, options())).resolves.toEqual({ rows: [row] })
  })

  it('normalizes only safe numeric bigint values and rejects precision loss', async () => {
    for (const id of [42, Number.MAX_SAFE_INTEGER + 1]) {
      const fetchImplementation = vi.fn(async () => jsonResponse([eventRow({ id })]))
      const driver = await createSebStagingSupabaseNarrowDriver(
        createHarness({ fetchImplementation }).options,
      )
      if (Number.isSafeInteger(id)) {
        await expect(driver.enumerateDatabase(enumerateRequest(), options()))
          .resolves.toMatchObject({ rows: [{ id: '42' }] })
      } else {
        await expect(driver.enumerateDatabase(enumerateRequest(), options()))
          .rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
      }
    }
  })

  it('rejects secret-derived columns, extra request fields, extra row fields, and over-bounded results', async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse([eventRow()]))
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation }).options,
    )

    await expect(driver.enumerateDatabase(enumerateRequest({
      table: 'assignment_seb_config_revisions',
      columns: ['assignment_id', 'hashed_quit_password'],
      predicates: [{ column: 'assignment_id', operator: 'eq', value: IDS.assignment }],
    }), options())).rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
    await expect(driver.enumerateDatabase({ ...enumerateRequest(), leak: true }, options()))
      .rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
    expect(fetchImplementation).not.toHaveBeenCalled()

    const extraRowDriver = await createSebStagingSupabaseNarrowDriver(createHarness({
      fetchImplementation: vi.fn(async () => jsonResponse([eventRow({ config_key: 'never' })])),
    }).options)
    await expect(extraRowDriver.enumerateDatabase(enumerateRequest(), options()))
      .rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)

    const manyRowsDriver = await createSebStagingSupabaseNarrowDriver(createHarness({
      fetchImplementation: vi.fn(async () => jsonResponse(
        Array.from({ length: 9 }, (_, index) => eventRow({ id: String(index + 1) })),
      )),
    }).options)
    await expect(manyRowsDriver.enumerateDatabase(enumerateRequest(), options()))
      .rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
  })

  it('rejects redirected/final-URL drift and non-JSON database responses', async () => {
    const redirectedResponse = jsonResponse([eventRow()])
    Object.defineProperty(redirectedResponse, 'url', {
      configurable: true,
      value: 'https://attacker.example/leak',
    })
    const redirected = await createSebStagingSupabaseNarrowDriver(createHarness({
      fetchImplementation: vi.fn(async () => redirectedResponse),
    }).options)
    await expect(redirected.enumerateDatabase(enumerateRequest(), options()))
      .rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)

    const wrongType = await createSebStagingSupabaseNarrowDriver(createHarness({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify([eventRow()]), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })),
    }).options)
    await expect(wrongType.enumerateDatabase(enumerateRequest(), options()))
      .rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
  })

  it('encodes fixed UUID-array containment predicates without permitting arbitrary operators', async () => {
    const fetchImplementation = vi.fn(async url => {
      const parsed = new URL(url)
      expect(parsed.searchParams.get('question_ids')).toBe(`cs.{${IDS.answer}}`)
      return jsonResponse([])
    })
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation }).options,
    )
    await expect(driver.enumerateDatabase({
      schemaVersion: 1,
      operationId: 'question-closure:assignments:question_ids',
      table: 'assignments',
      columns: ['id'],
      predicates: [{ column: 'question_ids', operator: 'contains', value: [IDS.answer] }],
      limit: 9,
    }, options())).resolves.toEqual({ rows: [] })
    await expect(driver.enumerateDatabase({
      ...enumerateRequest(),
      predicates: [{ column: 'id', operator: 'or', value: IDS.event }],
    }, options())).rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
  })

  it('bounds a direct leaf delete with exact preflight and exact returned identifiers', async () => {
    const methods = []
    const fetchImplementation = vi.fn(async (url, init) => {
      methods.push(init.method)
      const parsed = new URL(url)
      expect(parsed.pathname).toBe('/rest/v1/exam_proctor_events')
      expect(parsed.searchParams.get('select')).toBe('id::text')
      return jsonResponse([{ id: IDS.event }])
    })
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation }).options,
    )

    await expect(driver.deleteDatabase(directDeleteRequest(), options())).resolves.toEqual({
      status: 'passed',
      deletedCount: 1,
    })
    expect(methods).toEqual(['GET', 'DELETE'])
  })

  it('routes parent/cascade deletion only through the fixed serializable RPC', async () => {
    const fetchImplementation = vi.fn(async (url, init) => {
      const parsed = new URL(url)
      expect(parsed.pathname).toBe('/rest/v1/rpc/seb_s5_delete_exact_cleanup_target')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body)
      expect(Object.keys(body).sort()).toEqual(['p_qa_namespace', 'p_request'])
      expect(body.p_qa_namespace).toBe(NAMESPACE)
      expect(body.p_request.atomicClosure.isolation).toBe('serializable-parent-lock')
      expect(body.p_request.atomicClosure.allowedCascadeTables).toEqual(['organization_members'])
      return jsonResponse({
        schemaVersion: 1,
        status: 'passed',
        deletedCount: 1,
        atomicClosureVerified: true,
      })
    })
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation }).options,
    )

    await expect(driver.deleteDatabase(organizationDeleteRequest(), options())).resolves.toEqual({
      status: 'passed',
      deletedCount: 1,
      atomicClosureVerified: true,
    })
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
  })

  it('fails closed when a parent delete omits the atomic closure or the RPC omits its proof', async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      schemaVersion: 1,
      status: 'passed',
      deletedCount: 1,
    }))
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation }).options,
    )

    await expect(driver.deleteDatabase(
      organizationDeleteRequest({ atomicClosure: null }),
      options(),
    )).rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
    expect(fetchImplementation).not.toHaveBeenCalled()

    await expect(driver.deleteDatabase(organizationDeleteRequest(), options()))
      .rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
  })

  it('rejects malformed closure proof tables, counts, cascades, and extra fields before RPC', async () => {
    const fetchImplementation = vi.fn()
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation }).options,
    )
    const base = organizationDeleteRequest()
    for (const atomicClosure of [
      { ...base.atomicClosure, isolation: 'read-committed' },
      { ...base.atomicClosure, extra: true },
      {
        ...base.atomicClosure,
        requireAbsent: [{ ...base.atomicClosure.requireAbsent[0], expectedCount: 1 }],
      },
      { ...base.atomicClosure, allowedCascadeTables: ['organizations'] },
    ]) {
      await expect(driver.deleteDatabase(
        organizationDeleteRequest({ atomicClosure }),
        options(),
      )).rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
    }
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('attests exact storage path, owner, size, MIME, and downloaded SHA-256', async () => {
    const bytes = Buffer.from('synthetic exact SEB artifact')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const path = `assignments/${IDS.assignment}/r1/${sha256}.seb`
    const fetchImplementation = vi.fn(async (url, init) => {
      const parsed = new URL(url)
      if (parsed.pathname === '/rest/v1/rpc/seb_s5_attest_storage_object') {
        expect(JSON.parse(init.body)).toEqual({
          p_schema_version: 1,
          p_qa_namespace: NAMESPACE,
          p_bucket_name: 'assignment-seb-configs',
          p_path: path,
        })
        return jsonResponse(storageMetadata('assignment-seb-configs', path, bytes))
      }
      expect(parsed.pathname).toBe(`/storage/v1/object/assignment-seb-configs/${path}`)
      return binaryResponse(bytes, 'application/seb')
    })
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation }).options,
    )

    await expect(driver.enumerateStorage(
      storageRequest('assignment-seb-configs', path),
      options(),
    )).resolves.toEqual({
      objects: [{
        bucketName: 'assignment-seb-configs',
        path,
        ownerId: null,
        createdAt: CREATED_AT,
        sizeBytes: bytes.byteLength,
        mimeType: 'application/seb',
        sha256,
      }],
    })
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it('does not accept filename-only storage matches or metadata/hash drift', async () => {
    const bytes = Buffer.from('actual bytes')
    const wrongSha = 'c'.repeat(64)
    const path = `assignments/${IDS.assignment}/r1/${wrongSha}.seb`
    const cases = [
      storageMetadata('assignment-seb-configs', path, bytes, { path: `other/${path}` }),
      storageMetadata('assignment-seb-configs', path, bytes, { sizeBytes: bytes.byteLength + 1 }),
      storageMetadata('assignment-seb-configs', path, bytes, { mimeType: 'application/octet-stream' }),
      {
        ...storageMetadata('assignment-seb-configs', path, bytes),
        objects: [{ ...storageMetadata('assignment-seb-configs', path, bytes).objects[0], extra: true }],
      },
    ]
    for (const metadata of cases) {
      const driver = await createSebStagingSupabaseNarrowDriver(createHarness({
        fetchImplementation: vi.fn(async url => (
          new URL(url).pathname.includes('/rpc/')
            ? jsonResponse(metadata)
            : binaryResponse(bytes, 'application/seb')
        )),
      }).options)
      await expect(driver.enumerateStorage(
        storageRequest('assignment-seb-configs', path),
        options(),
      )).rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
    }

    const hashDriver = await createSebStagingSupabaseNarrowDriver(createHarness({
      fetchImplementation: vi.fn(async url => (
        new URL(url).pathname.includes('/rpc/')
          ? jsonResponse(storageMetadata('assignment-seb-configs', path, bytes))
          : binaryResponse(bytes, 'application/seb')
      )),
    }).options)
    await expect(hashDriver.enumerateStorage(
      storageRequest('assignment-seb-configs', path),
      options(),
    )).rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
  })

  it('requires submission storage ownership to match the student encoded in the full path', async () => {
    const bytes = Buffer.from('synthetic PDF')
    const path = `${IDS.student}/${IDS.submission}/${IDS.answer}/${IDS.upload}.pdf`
    const fetchImplementation = vi.fn(async url => (
      new URL(url).pathname.includes('/rpc/')
        ? jsonResponse(storageMetadata('submission-files', path, bytes, { ownerId: IDS.teacher }))
        : binaryResponse(bytes, 'application/pdf')
    ))
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation }).options,
    )
    await expect(driver.enumerateStorage(
      storageRequest('submission-files', path),
      options(),
    )).rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
  })

  it('deletes one exact storage object only after full attestation and verifies absence', async () => {
    const bytes = Buffer.from('synthetic PDF')
    const path = `${IDS.student}/${IDS.submission}/${IDS.answer}/${IDS.upload}.pdf`
    let attestations = 0
    const fetchImplementation = vi.fn(async (url, init) => {
      const parsed = new URL(url)
      if (parsed.pathname.includes('/rpc/seb_s5_attest_storage_object')) {
        attestations += 1
        return jsonResponse(attestations === 1
          ? storageMetadata('submission-files', path, bytes)
          : { schemaVersion: 1, objects: [] })
      }
      if (init.method === 'DELETE') {
        expect(JSON.parse(init.body)).toEqual({ prefixes: [path] })
        return jsonResponse([])
      }
      return binaryResponse(bytes, 'application/pdf')
    })
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation }).options,
    )
    await expect(driver.deleteStorage({
      schemaVersion: 1,
      operationId: 'delete:answer-storage',
      bucketName: 'submission-files',
      path,
      maxObjects: 1,
    }, options())).resolves.toEqual({ status: 'passed', deletedCount: 1 })
    expect(attestations).toBe(2)
  })

  it('fails closed on credential attestation extras and official environment drift', async () => {
    const badCredentialDriver = await createSebStagingSupabaseNarrowDriver(createHarness({
      providerResult: credential({ extra: true }),
    }).options)
    await expect(badCredentialDriver.enumerateDatabase(enumerateRequest(), options()))
      .rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)

    const harness = createHarness({
      fetchImplementation: vi.fn(async () => jsonResponse([eventRow()])),
    })
    const driver = await createSebStagingSupabaseNarrowDriver(harness.options)
    harness.state.environment = validEnvironment({ NEXT_PUBLIC_SITE_URL: 'https://example.test' })
    await expect(driver.enumerateDatabase(enumerateRequest(), options()))
      .rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
    expect(harness.fetchImplementation).not.toHaveBeenCalled()
  })

  it('cooperatively aborts pending requests and close waits for quiescence', async () => {
    let started
    const startedPromise = new Promise(resolve => { started = resolve })
    const fetchImplementation = vi.fn((url, init) => new Promise((resolve, reject) => {
      started()
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
        once: true,
      })
    }))
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation, boundaryTimeoutMs: 5_000 }).options,
    )
    const operation = driver.enumerateDatabase(enumerateRequest(), options())
    await startedPromise
    const closeResult = await driver.close(options())
    expect(closeResult).toEqual({ status: 'passed' })
    await expect(operation).rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
    await expect(driver.enumerateDatabase(enumerateRequest(), options()))
      .rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
  })

  it('returns an exact separate ledger attestation backed by the fixed service-only RPC', async () => {
    const fetchImplementation = vi.fn(async (url, init) => {
      const parsed = new URL(url)
      expect(parsed.pathname).toBe('/rest/v1/rpc/seb_s5_find_exact_run_targets')
      expect(JSON.parse(init.body)).toEqual({ p_criteria: ledgerCriteria() })
      return jsonResponse({
        schemaVersion: 1,
        authoritative: true,
        matches: [ledgerCandidate()],
      })
    })
    const attestation = createSebStagingSupabaseLedgerReconciliationAttestation(
      createHarness({ fetchImplementation }).options,
    )
    expect(Object.keys(attestation).sort()).toEqual(['client', 'credentialKind', 'targetOrigin'])
    expect(Object.keys(attestation.client).sort()).toEqual(['findExactRunTargets', 'supabaseUrl'])
    expect(attestation.targetOrigin).toBe(SUPABASE_ORIGIN)
    expect(attestation.credentialKind).toBe('service-role')
    expect(JSON.stringify(attestation)).not.toContain(SERVICE_ROLE_SENTINEL)

    await expect(attestation.client.findExactRunTargets(
      ledgerCriteria(),
      options(),
    )).resolves.toEqual({
      schemaVersion: 1,
      authoritative: true,
      matches: [ledgerCandidate()],
    })
  })

  it('rejects non-authoritative, mismatched, duplicate, over-bounded, or extra ledger results', async () => {
    const responses = [
      { schemaVersion: 1, authoritative: false, matches: [] },
      { schemaVersion: 1, authoritative: true, matches: [ledgerCandidate({ targetKey: 'other' })] },
      { schemaVersion: 1, authoritative: true, matches: [ledgerCandidate(), ledgerCandidate()] },
      {
        schemaVersion: 1,
        authoritative: true,
        matches: Array.from({ length: 9 }, (_, index) => ledgerCandidate({ targetId: uuid(index + 20) })),
      },
      { schemaVersion: 1, authoritative: true, matches: [], extra: true },
    ]
    for (const response of responses) {
      const attestation = createSebStagingSupabaseLedgerReconciliationAttestation(createHarness({
        fetchImplementation: vi.fn(async () => jsonResponse(response)),
      }).options)
      await expect(attestation.client.findExactRunTargets(ledgerCriteria(), options()))
        .rejects.toBeInstanceOf(SebStagingSupabaseNarrowDriverBlockedError)
    }
  })

  it('never sends forbidden SEB secret column names over the transport', async () => {
    const requests = []
    const fetchImplementation = vi.fn(async (url, init) => {
      requests.push(`${url}\n${init.body ?? ''}`)
      return jsonResponse([])
    })
    const driver = await createSebStagingSupabaseNarrowDriver(
      createHarness({ fetchImplementation }).options,
    )
    await driver.enumerateDatabase({
      schemaVersion: 1,
      operationId: 'enumerate:config-primary',
      table: 'assignment_seb_config_revisions',
      columns: ['assignment_id', 'revision', 'org_id', 'owner_id', 'created_at'],
      predicates: [{ column: 'assignment_id', operator: 'eq', value: IDS.assignment }],
      limit: 9,
    }, options())
    expect(requests.join('\n')).not.toMatch(/hashed_quit_password|config_key|browser_exam_keys/i)
  })
})
