import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getManagedAssignment: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock('@/lib/exam-proctor-report-server', () => ({
  getManagedProctorReportAssignment: mocks.getManagedAssignment,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { POST } from '@/app/api/assignments/[id]/proctor-report/route'

const ASSIGNMENT_ID = '25fc8f03-b2a8-45a7-8718-c14132af8320'
const SUBMISSION_ID = '1de7655d-2c4c-42a6-8340-0813cc098c62'
const STUDENT_ID = 'd8f57df1-7fbf-4ac3-86ec-d384045838c3'
const OTHER_STUDENT_ID = 'e7c3559f-e509-4bbb-8fef-56e5e333acaa'

interface EventRow {
  id: number
  submission_id: string
  student_id: string
  event_type: string
  occurred_at_client: string | null
  created_at: string
  acknowledged_at: string | null
}

interface SessionIdentity {
  submission_id: string
  student_id: string
}

interface SubmissionRow {
  id: string
  student_id: string
  attempt_number: number
  exam_access_mode: string
}

interface UserRow {
  id: string
  full_name: string | null
}

interface QueryState {
  equals: Map<string, unknown>
  included: Map<string, readonly string[]>
  greaterThan: Map<string, number>
  lessThanOrEqual: Map<string, number>
  limit: number | null
}

interface QueryResult {
  data: unknown
  error: null
  count?: number
}

function queryChain(
  resolve: (state: QueryState) => QueryResult,
): Record<string, unknown> & PromiseLike<QueryResult> {
  const state: QueryState = {
    equals: new Map(),
    included: new Map(),
    greaterThan: new Map(),
    lessThanOrEqual: new Map(),
    limit: null,
  }
  const chain: Record<string, unknown> & Partial<PromiseLike<QueryResult>> = {}
  chain.eq = (column: string, value: unknown) => {
    state.equals.set(column, value)
    return chain
  }
  chain.in = (column: string, values: readonly string[]) => {
    state.included.set(column, values)
    return chain
  }
  chain.is = () => chain
  chain.not = () => chain
  chain.gt = (column: string, value: number) => {
    state.greaterThan.set(column, value)
    return chain
  }
  chain.lte = (column: string, value: number) => {
    state.lessThanOrEqual.set(column, value)
    return chain
  }
  chain.order = () => chain
  chain.limit = (value: number) => {
    state.limit = value
    return chain
  }
  chain.maybeSingle = async () => resolve(state)
  chain.then = (onFulfilled, onRejected) => (
    Promise.resolve(resolve(state)).then(onFulfilled, onRejected)
  )
  return chain as Record<string, unknown> & PromiseLike<QueryResult>
}

function baseEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: 919,
    submission_id: SUBMISSION_ID,
    student_id: STUDENT_ID,
    event_type: 'tab_hidden',
    occurred_at_client: '2026-08-30T07:59:59.000Z',
    created_at: '2026-08-30T08:00:00.000Z',
    acknowledged_at: null,
    ...overrides,
  }
}

function sessionClient(
  events: EventRow[],
  sessions: SessionIdentity[],
  callOrder: string[],
) {
  return {
    from(table: string) {
      return {
        select(_columns: string, options?: { count?: string }) {
          if (table === 'exam_proctor_events' && options?.count === 'exact') {
            return queryChain(() => ({
              data: events.length > 0
                ? { id: Math.max(...events.map(event => event.id)) }
                : null,
              error: null,
              count: events.length,
            }))
          }
          if (table === 'exam_proctor_events') {
            return queryChain(state => {
              const after = state.greaterThan.get('id') ?? 0
              const through = state.lessThanOrEqual.get('id') ?? Number.MAX_SAFE_INTEGER
              const limit = state.limit ?? events.length
              return {
                data: events
                  .filter(event => event.id > after && event.id <= through)
                  .sort((left, right) => left.id - right.id)
                  .slice(0, limit),
                error: null,
              }
            })
          }
          if (table === 'exam_proctor_sessions') {
            return queryChain(state => {
              callOrder.push('session:retained')
              const selectedIds = new Set(state.included.get('submission_id') ?? [])
              return {
                data: sessions.filter(session => selectedIds.has(session.submission_id)),
                error: null,
              }
            })
          }
          throw new Error(`Unexpected session table: ${table}`)
        },
      }
    },
  }
}

function adminClient(
  submissions: SubmissionRow[],
  users: UserRow[],
) {
  return {
    from(table: string) {
      return {
        select() {
          return queryChain(state => {
            if (table === 'submissions') {
              const ids = new Set(state.included.get('id') ?? [])
              return {
                data: submissions.filter(submission => ids.has(submission.id)),
                error: null,
              }
            }
            if (table === 'users') {
              const ids = new Set(state.included.get('id') ?? [])
              return { data: users.filter(user => ids.has(user.id)), error: null }
            }
            throw new Error(`Unexpected admin table: ${table}`)
          })
        },
      }
    },
  }
}

function exportRequest(): Request {
  return new Request(`https://korkru.test/api/assignments/${ASSIGNMENT_ID}/proctor-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: null,
      submissionId: null,
      kind: 'all',
      review: 'all',
    }),
  })
}

async function runExport(request = exportRequest()) {
  return POST(request, { params: Promise.resolve({ id: ASSIGNMENT_ID }) })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getAuthUser.mockResolvedValue({ id: 'teacher-id' })
  mocks.getManagedAssignment.mockResolvedValue({
    id: ASSIGNMENT_ID,
    title: 'ปลายภาค',
    created_by: 'teacher-id',
    status: 'published',
    mode: 'online',
    type: 'exam',
    proctoring_enabled: true,
    classrooms: { name: 'ม.1/1' },
  })
})

describe('proctor report export route', () => {
  it('revalidates retained sessions before admin and returns private CSV headers', async () => {
    const callOrder: string[] = []
    const events = [baseEvent()]
    mocks.createClient.mockResolvedValue(sessionClient(events, [{
      submission_id: SUBMISSION_ID,
      student_id: STUDENT_ID,
    }], callOrder))
    mocks.createAdminClient.mockImplementation(() => {
      callOrder.push('admin:create')
      return adminClient([{
        id: SUBMISSION_ID,
        student_id: STUDENT_ID,
        attempt_number: 1,
        exam_access_mode: 'seb',
      }], [{ id: STUDENT_ID, full_name: 'นักเรียน ทดสอบ' }])
    })

    const response = await runExport()
    const csv = await response.text()

    expect(response.status).toBe(200)
    expect(callOrder).toEqual(['session:retained', 'admin:create'])
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
    expect(response.headers.get('Content-Disposition')).toContain('attachment;')
    expect(response.headers.get('Content-Disposition')).toContain("filename*=UTF-8''")
    expect(csv).toContain('นักเรียน ทดสอบ')
    expect(csv).toContain('Safe Exam Browser')
    expect(csv).not.toContain(SUBMISSION_ID)
    expect(csv).not.toContain(STUDENT_ID)
  })

  it('fails closed before admin when an event no longer matches its retained session', async () => {
    const callOrder: string[] = []
    mocks.createClient.mockResolvedValue(sessionClient([baseEvent()], [{
      submission_id: SUBMISSION_ID,
      student_id: OTHER_STUDENT_ID,
    }], callOrder))

    const response = await runExport()

    expect(response.status).toBe(409)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects more than 2,000 distinct attempts before session or admin lookups', async () => {
    const callOrder: string[] = []
    const events = Array.from({ length: 2_001 }, (_, index) => baseEvent({
      id: index + 1,
      submission_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    }))
    mocks.createClient.mockResolvedValue(sessionClient(events, [], callOrder))

    const response = await runExport()
    const body = await response.json() as { error: string }

    expect(response.status).toBe(413)
    expect(body.error).toContain('2,000')
    expect(callOrder).toEqual([])
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects a partial user lookup instead of exporting an invented identity', async () => {
    const callOrder: string[] = []
    mocks.createClient.mockResolvedValue(sessionClient([baseEvent()], [{
      submission_id: SUBMISSION_ID,
      student_id: STUDENT_ID,
    }], callOrder))
    mocks.createAdminClient.mockReturnValue(adminClient([{
      id: SUBMISSION_ID,
      student_id: STUDENT_ID,
      attempt_number: 1,
      exam_access_mode: 'seb',
    }], []))

    const response = await runExport()

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
  })
})
