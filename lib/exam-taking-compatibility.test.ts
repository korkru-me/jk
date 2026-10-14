import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn(), access: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/exam-access-session', () => ({ getExamAccessSession: mocks.access }))
import { getExamTakingData } from './exam-taking'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'student' } } }) } })
  mocks.access.mockResolvedValue({ mode: 'seb' })
})

describe('legacy-schema attempt resume', () => {
  it.each(['browser', 'seb_required'])('reads only an authorized attempt and preserves secure mode: %s', async mode => {
    const selects: string[] = []
    const from = vi.fn((table: string) => {
      let fields = ''
      const query = {
        select: (value: string) => { fields = value; selects.push(value); return query },
        eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
        maybeSingle: async () => fields.includes('seb_config_revision')
          ? { data: null, error: { code: '42703', message: 'column submissions.seb_config_revision does not exist' } }
          : { data: { id: 'attempt', status: 'in_progress', student_id: 'student', started_at: new Date().toISOString(), assignment_id: 'assignment', users: { full_name: 'Synthetic' }, assignments: { secure_browser_mode: mode, type: 'exam' } }, error: null },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      }
      if (table === 'submissions') {
        query.eq.mockImplementation((_key: string, _value: string) => query)
      }
      return query
    })
    mocks.admin.mockReturnValue({ from })
    const result = await getExamTakingData('attempt')
    expect(selects[0]).toContain('seb_config_revision')
    expect(selects[1]).not.toContain('seb_config_revision')
    expect(mocks.access).not.toHaveBeenCalled()
    if (mode === 'browser') expect(result).toHaveProperty('submission.id', 'attempt')
    else {
      expect(result).toBeNull()
      expect(from).not.toHaveBeenCalledWith('submission_answers')
    }
  })
})
