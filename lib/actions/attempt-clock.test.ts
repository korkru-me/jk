import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/auth/session-user', () => import('@/lib/auth/session-user-test-double'))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
import { readAttemptClock } from './attempt-clock'

const SUBMISSION = '10000000-0000-4000-8000-000000000001'
const ASSIGNMENT = '30000000-0000-4000-8000-000000000001'
const STUDENT = '20000000-0000-4000-8000-000000000001'

let rows: Record<string, { data: unknown; error: unknown }>
const filters: Array<[string, string, unknown]> = []

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-25T03:30:00.000Z'))
  filters.length = 0
  mocks.getUser.mockResolvedValue({ data: { user: { id: STUDENT } }, error: null })
  rows = {
    submissions: { data: {
      assignment_id: ASSIGNMENT, status: 'in_progress', started_at: '2026-11-25T03:00:00.000Z', closed_at: null,
      assignments: { duration_minutes: 60, end_at: null },
    }, error: null },
    assignment_extensions: { data: null, error: null },
  }
  mocks.from.mockImplementation((table: string) => {
    const builder = {
      select: () => builder,
      eq: (field: string, value: unknown) => { filters.push([table, field, value]); return builder },
      maybeSingle: async () => rows[table],
    }
    return builder
  })
})

describe('readAttemptClock', () => {
  it('reads only the signed-in student’s own round', async () => {
    await expect(readAttemptClock(SUBMISSION)).resolves.toEqual({
      open: true, expiresAt: '2026-11-25T04:00:00.000Z', serverNow: '2026-11-25T03:30:00.000Z',
    })
    expect(filters).toContainEqual(['submissions', 'student_id', STUDENT])
    expect(filters).toContainEqual(['assignment_extensions', 'student_id', STUDENT])
    expect(filters).toContainEqual(['assignment_extensions', 'assignment_id', ASSIGNMENT])
  })

  it('applies an extension', async () => {
    rows.submissions.data = { ...(rows.submissions.data as object), assignments: [{ duration_minutes: 60, end_at: '2026-11-25T03:40:00.000Z' }] }
    rows.assignment_extensions.data = { extended_end_at: '2026-11-25T03:50:00.000Z' }
    await expect(readAttemptClock(SUBMISSION)).resolves.toMatchObject({ open: true, expiresAt: '2026-11-25T03:50:00.000Z' })
  })

  it('reports someone else’s or a missing round as not open', async () => {
    rows.submissions.data = null
    await expect(readAttemptClock(SUBMISSION)).resolves.toEqual({ open: false })
  })

  it('answers "unknown" without a session, a valid id, or a database read', async () => {
    await expect(readAttemptClock('not-a-uuid')).resolves.toEqual({ error: true })
    rows.submissions.error = { code: 'XX000' }
    await expect(readAttemptClock(SUBMISSION)).resolves.toEqual({ error: true })
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(readAttemptClock(SUBMISSION)).resolves.toEqual({ error: true })
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })
})
