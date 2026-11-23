import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn(), access: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/exam-access-session', () => ({ getExamAccessSession: mocks.access }))
import { recordProctorSignal } from './exam-proctor'

const SUBMISSION_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const input = { submissionId: SUBMISSION_ID, clientInstanceId: CLIENT_ID, tabVisible: true, fullscreen: true, events: [] }

function adminFor(secureBrowserMode: string) {
  const selects: string[] = []
  const rpc = vi.fn(async () => ({ data: 1, error: null }))
  const from = vi.fn(() => {
    let fields = ''
    const query = {
      select: vi.fn((value: string) => { fields = value; selects.push(value); return query }),
      eq: vi.fn(() => query),
      maybeSingle: async () => fields.includes('seb_config_revision')
        ? { data: null, error: { code: '42703', message: 'column submissions.seb_config_revision does not exist' } }
        : {
            data: {
              id: SUBMISSION_ID, student_id: 'student', status: 'in_progress', assignment_id: 'assignment', exam_access_mode: 'browser',
              assignments: { proctoring_enabled: true, mode: 'online', secure_browser_mode: secureBrowserMode, android_exam_mode: 'off' },
            },
            error: null,
          },
    }
    return query
  })
  return { admin: { from, rpc }, rpc, selects }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'student' } } }) } })
})

describe('proctor signal on a schema without SEB revisions', () => {
  it('records an ordinary browser exam through the legacy projection', async () => {
    const { admin, rpc, selects } = adminFor('off')
    mocks.admin.mockReturnValue(admin)
    await expect(recordProctorSignal(input)).resolves.toMatchObject({ success: true })
    expect(selects).toHaveLength(2)
    expect(selects[1]).not.toContain('seb_config_revision')
    expect(rpc).toHaveBeenCalledOnce()
  })

  it('fails closed for an SEB-required exam', async () => {
    const { admin, rpc } = adminFor('seb_required')
    mocks.admin.mockReturnValue(admin)
    await expect(recordProctorSignal(input)).resolves.toEqual({ error: 'ข้อสอบนี้ยังไม่พร้อมให้เข้า กรุณาแจ้งครูผู้สอน' })
    expect(mocks.access).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
})
