import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ session: vi.fn(), admin: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
import { authorizeSebPasswordAssignment, getSebPasswordSettings } from '@/lib/seb-password-repository'
import { updateSebPasswordDraft } from '@/lib/actions/seb-password'

const teacher = '11111111-1111-4111-8111-111111111111'
const org = '22222222-2222-4222-8222-222222222222'
const assignment = '33333333-3333-4333-8333-333333333333'
const other = '44444444-4444-4444-8444-444444444444'
const password = 'Synthetic-password-123!'
const summary = { draft: { revision: 1, state: 'saved', updatedAt: '2026-09-05T08:00:00Z', expiresAt: '2026-10-05T08:00:00Z' }, events: [] }
let tableRows: Record<string, unknown>
let queries: { table: string; columns: string; filters: [string, unknown][] }[]
const getUser = vi.fn()
const rpc = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  tableRows = {
    users: { id: teacher, role: 'teacher', status: 'active' },
    assignments: { id: assignment, org_id: org, created_by: teacher, mode: 'online', type: 'exam', secure_browser_mode: 'seb_required', title: 'ข้อสอบสมมติ' },
    organization_members: { org_id: org },
  }
  queries = []
  getUser.mockResolvedValue({ data: { user: { id: teacher } }, error: null })
  mocks.session.mockResolvedValue({
    auth: { getUser },
    from: (table: string) => {
      const query = { table, columns: '', filters: [] as [string, unknown][] }
      queries.push(query)
      const chain = {
        select: (columns: string) => { query.columns = columns; return chain },
        eq: (column: string, value: unknown) => { query.filters.push([column, value]); return chain },
        maybeSingle: async () => ({ data: tableRows[table], error: null }),
      }
      return chain
    },
  })
  rpc.mockImplementation(async (name: string) => ({ data: name === 'read_exam_seb_password_draft' ? { draft: null, events: [] } : summary, error: null }))
  mocks.admin.mockReturnValue({ rpc })
  vi.stubEnv('SEB_PASSWORD_DRAFTS_ENABLED', 'true')
  vi.stubEnv('SEB_PASSWORD_ACTIVE_KEY_ID', 'fixture')
  vi.stubEnv('SEB_PASSWORD_KEYRING', JSON.stringify({ fixture: Buffer.alloc(32, 4).toString('base64') }))
})
afterEach(() => vi.unstubAllEnvs())

describe('session/RLS adapter and Server Action with mocked Supabase (not live Auth)', () => {
  it('resolves exact user, owner and assignment organization before any service-role access', async () => {
    const result = await authorizeSebPasswordAssignment(assignment)
    expect(result.actor.id).toBe(teacher)
    expect(result.memberOrgIds).toEqual([org])
    expect(queries).toEqual([
      { table: 'users', columns: 'id,role,status', filters: [['id', teacher]] },
      { table: 'assignments', columns: 'id,org_id,created_by,type,mode,secure_browser_mode,title', filters: [['id', assignment], ['created_by', teacher]] },
      { table: 'organization_members', columns: 'org_id', filters: [['user_id', teacher], ['org_id', org]] },
    ])
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('does not read private storage when logged out or the RLS-scoped assignment is absent', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(getSebPasswordSettings(assignment)).rejects.toThrow('SEB_PASSWORD_AUTH_REQUIRED')
    expect(queries).toHaveLength(0)
    getUser.mockResolvedValue({ data: { user: { id: teacher } }, error: null })
    tableRows.assignments = null
    await expect(getSebPasswordSettings(assignment)).rejects.toThrow('SEB_PASSWORD_ACCESS_DENIED')
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it.each(['student', 'suspended', 'membership', 'owner'])('rechecks %s before admin creation', async condition => {
    if (condition === 'student') tableRows.users = { id: teacher, role: 'student', status: 'active' }
    if (condition === 'suspended') tableRows.users = { id: teacher, role: 'teacher', status: 'suspended' }
    if (condition === 'membership') tableRows.organization_members = null
    if (condition === 'owner') tableRows.users = { id: other, role: 'teacher', status: 'active' }
    await expect(getSebPasswordSettings(assignment)).rejects.toThrow('SEB_PASSWORD_ACCESS_DENIED')
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('checks session afresh in the action rather than trusting a previous page render', async () => {
    await getSebPasswordSettings(assignment)
    mocks.admin.mockClear()
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const result = await updateSebPasswordDraft({ assignmentId: assignment, operation: 'save', expectedRevision: 0, password, confirmation: password })
    expect(result.ok).toBe(false)
    expect(getUser).toHaveBeenCalledTimes(2)
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('uses a service-only RPC with exact actor/assignment, never plain passwords', async () => {
    const result = await updateSebPasswordDraft({ assignmentId: assignment, operation: 'save', expectedRevision: 0, password, confirmation: password })
    expect(result).toEqual({ ok: true, summary })
    const write = rpc.mock.calls.find(call => call[0] === 'write_exam_seb_password_draft')
    expect(write?.[1]).toMatchObject({ p_assignment_id: assignment, p_actor_id: teacher, p_expected_revision: 0 })
    expect(write?.[1].p_secret.algorithm).toBe('AES-256-GCM')
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(password)
    expect(JSON.stringify(result)).not.toContain(password)
  })
  it('does not report absent migration/key provisioning as an empty saved state', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: password } })
    const result = await getSebPasswordSettings(assignment)
    expect(result.view.kind).toBe('unavailable')
    expect(JSON.stringify(result)).not.toContain(password)
    vi.stubEnv('SEB_PASSWORD_KEYRING', 'invalid')
    mocks.admin.mockClear()
    expect((await getSebPasswordSettings(assignment)).view.kind).toBe('unavailable')
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('a disabled deployment never queries the new schema', async () => {
    vi.stubEnv('SEB_PASSWORD_DRAFTS_ENABLED', 'false')
    expect((await getSebPasswordSettings(assignment)).view.kind).toBe('unavailable')
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it.each([
    { code: '40001', message: 'SEB_PASSWORD_REVISION_CONFLICT' },
    { code: '42501', message: password },
    { code: 'P0001', message: 'SEB_PASSWORD_RATE_LIMITED' },
    { code: 'UNKNOWN', message: password },
  ])('returns sanitized RPC failures without retrying a possibly committed mutation', async error => {
    rpc.mockImplementation(async (name: string) => name === 'read_exam_seb_password_draft'
      ? { data: { draft: null, events: [] }, error: null } : { data: null, error })
    const result = await updateSebPasswordDraft({ assignmentId: assignment, operation: 'save', expectedRevision: 0, password, confirmation: password })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain(password)
    expect(rpc.mock.calls.filter(call => call[0] === 'write_exam_seb_password_draft')).toHaveLength(1)
  })
})
