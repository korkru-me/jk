import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn(), access: vi.fn() }))
vi.mock('@/lib/auth/session-user', () => import('@/lib/auth/session-user-test-double'))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('sharp', () => ({ default: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/exam-access-session', () => ({ getExamAccessSession: mocks.access }))
import { prepareStudentWorkArtifactUpload } from './math-work'

const ANSWER_ID = '11111111-1111-4111-8111-111111111111'
const input = {
  submissionAnswerId: ANSWER_ID,
  partKey: 'answer',
  sourceType: 'photo',
  includeScene: false,
  formatVersion: 1,
  previewFormat: 'webp',
}

function adminFor(secureBrowserMode: string) {
  const selects: string[] = []
  const from = vi.fn(() => {
    let fields = ''
    const query = {
      select: vi.fn((value: string) => { fields = value; selects.push(value); return query }),
      eq: vi.fn(() => query),
      maybeSingle: async () => fields.includes('seb_config_revision')
        ? { data: null, error: { code: '42703', message: 'column submissions_1.seb_config_revision does not exist' } }
        : {
            data: {
              id: ANSWER_ID, org_id: 'org', submission_id: 'submission',
              questions: { question_type: 'written', answer_parts: [] },
              submissions: {
                id: 'submission', org_id: 'org', student_id: 'student', status: 'in_progress',
                started_at: new Date().toISOString(), assignment_id: 'assignment', exam_access_mode: 'browser',
                assignments: {
                  id: 'assignment', org_id: 'org', mode: 'online', duration_minutes: null, end_at: null,
                  require_work_image: true, scratchpad_enabled: true, secure_browser_mode: secureBrowserMode,
                  android_exam_mode: 'off',
                },
              },
            },
            error: null,
          },
    }
    return query
  })
  return { admin: { from }, selects }
}

beforeEach(() => {
  vi.clearAllMocks()
  // A missing receipt secret stops immediately after the access checks pass.
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'student' } } }) } })
})

afterEach(() => vi.unstubAllEnvs())

describe('student work upload on a schema without SEB revisions', () => {
  it('passes the access checks for an ordinary browser exam', async () => {
    const { admin, selects } = adminFor('off')
    mocks.admin.mockReturnValue(admin)
    await expect(prepareStudentWorkArtifactUpload(input)).resolves.toEqual({ error: 'ระบบยืนยันการอัปโหลดยังไม่พร้อมใช้งาน' })
    expect(selects).toHaveLength(2)
    expect(selects[1]).not.toContain('seb_config_revision')
  })

  it('fails closed for an SEB-required exam', async () => {
    const { admin } = adminFor('seb_required')
    mocks.admin.mockReturnValue(admin)
    await expect(prepareStudentWorkArtifactUpload(input)).resolves.toEqual({ error: 'ข้อสอบนี้ยังไม่พร้อมให้เข้า กรุณาแจ้งครูผู้สอน' })
    expect(mocks.access).not.toHaveBeenCalled()
  })
})
