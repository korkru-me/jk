import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  createClient: vi.fn(),
  parseWorkbook: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/education-research-excel', () => ({
  EducationResearchWorkbookError: class EducationResearchWorkbookError extends Error {},
  parseEducationResearchScoreWorkbook: mocks.parseWorkbook,
}))

import { POST } from '@/app/api/research/[id]/score-import/route'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const TEMPLATE_ID = '33333333-3333-4333-8333-333333333333'
const BATCH_ID = '44444444-4444-4444-8444-444444444444'

function queryChain(result: { data: unknown; error: null }) {
  const chain: Record<string, unknown> & Partial<PromiseLike<typeof result>> = {}
  chain.eq = () => chain
  chain.maybeSingle = async () => result
  chain.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected)
  return chain as Record<string, unknown> & PromiseLike<typeof result>
}

function sessionClient(options: { canManage?: boolean } = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'can_manage_education_research_project') {
      return { data: options.canManage ?? true, error: null }
    }
    if (name === 'create_education_research_import_batch') {
      return { data: BATCH_ID, error: null }
    }
    throw new Error(`Unexpected RPC: ${name}`)
  })
  return {
    rpc,
    from(table: string) {
      return {
        select() {
          if (table === 'education_research_projects') {
            return queryChain({ data: { id: PROJECT_ID, org_id: 'org-1' }, error: null })
          }
          if (table === 'education_research_import_templates') {
            return queryChain({ data: { id: TEMPLATE_ID, version: 1, project_id: PROJECT_ID }, error: null })
          }
          throw new Error(`Unexpected table: ${table}`)
        },
      }
    },
  }
}

function uploadRequest(fileName = 'scores.xlsx') {
  const formData = new FormData()
  formData.set('file', new File([Buffer.from('xlsx')], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
  return new Request('https://korkru.test/api/research/score-import', {
    method: 'POST',
    body: formData,
  })
}

function parsedWorkbook(projectId = PROJECT_ID) {
  return {
    project_id: projectId,
    template_id: TEMPLATE_ID,
    template_version: 1,
    rows: [{
      row_number: 9,
      row_token: 'opaque-token',
      student_code: 'STU-001',
      full_name: 'นักเรียน หนึ่ง',
      note: null,
      pretest: 10,
      posttest: 18,
      parse_errors: [],
    }],
  }
}

describe('education research score-import route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAuthUser.mockResolvedValue({ id: 'teacher-1' })
    mocks.parseWorkbook.mockResolvedValue(parsedWorkbook())
  })

  it('returns 401 before reading an upload when no session exists', async () => {
    mocks.getAuthUser.mockResolvedValue(null)

    const response = await POST(new Request('https://korkru.test'), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })

    expect(response.status).toBe(401)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.parseWorkbook).not.toHaveBeenCalled()
  })

  it('returns 403 before reading workbook contents without manage permission', async () => {
    const client = sessionClient({ canManage: false })
    mocks.createClient.mockResolvedValue(client)

    const response = await POST(uploadRequest(), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })

    expect(response.status).toBe(403)
    expect(mocks.parseWorkbook).not.toHaveBeenCalled()
    expect(client.rpc).not.toHaveBeenCalledWith('create_education_research_import_batch', expect.anything())
  })

  it('rejects a workbook bound to another research project', async () => {
    const client = sessionClient()
    mocks.createClient.mockResolvedValue(client)
    mocks.parseWorkbook.mockResolvedValue(parsedWorkbook(OTHER_PROJECT_ID))

    const response = await POST(uploadRequest(), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'ไฟล์นี้เป็นของโครงการวิจัยอื่น กรุณาดาวน์โหลดแม่แบบจากโครงการนี้',
    })
    expect(client.rpc).not.toHaveBeenCalledWith('create_education_research_import_batch', expect.anything())
  })

  it('creates a preview batch only after the project and template version match', async () => {
    const client = sessionClient()
    mocks.createClient.mockResolvedValue(client)

    const response = await POST(uploadRequest(), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      batch_id: BATCH_ID,
      preview_url: `/research/${PROJECT_ID}/data/import/${BATCH_ID}`,
    })
    expect(client.rpc).toHaveBeenCalledWith('create_education_research_import_batch', {
      p_project_id: PROJECT_ID,
      p_template_id: TEMPLATE_ID,
      p_file_name: 'scores.xlsx',
      p_rows: parsedWorkbook().rows,
    })
  })

  it('rejects non-xlsx uploads before parsing workbook content', async () => {
    mocks.createClient.mockResolvedValue(sessionClient())

    const response = await POST(uploadRequest('scores.xlsm'), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })

    expect(response.status).toBe(400)
    expect(mocks.parseWorkbook).not.toHaveBeenCalled()
  })
})
