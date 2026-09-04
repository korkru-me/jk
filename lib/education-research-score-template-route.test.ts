import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  createClient: vi.fn(),
  buildWorkbook: vi.fn(),
  workbookFileName: vi.fn(() => 'research.xlsx'),
}))

vi.mock('@/lib/auth/server', () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/education-research-excel', () => ({
  buildEducationResearchScoreWorkbook: mocks.buildWorkbook,
  educationResearchWorkbookFileName: mocks.workbookFileName,
}))

import { POST } from '@/app/api/research/[id]/score-template/route'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const TEMPLATE_ID = '22222222-2222-4222-8222-222222222222'
const PRETEST_ID = '33333333-3333-4333-8333-333333333333'
const POSTTEST_ID = '44444444-4444-4444-8444-444444444444'

interface QueryState {
  from: number
  to: number
}

interface QueryResult {
  data: unknown
  error: null | { message: string }
}

function queryChain(resolve: (state: QueryState) => QueryResult) {
  const state: QueryState = { from: 0, to: 999 }
  const chain: Record<string, unknown> & Partial<PromiseLike<QueryResult>> = {}
  chain.eq = () => chain
  chain.order = () => chain
  chain.range = (from: number, to: number) => {
    state.from = from
    state.to = to
    return chain
  }
  chain.maybeSingle = async () => resolve(state)
  chain.single = async () => resolve(state)
  chain.then = (onFulfilled, onRejected) => Promise.resolve(resolve(state)).then(onFulfilled, onRejected)
  return chain as Record<string, unknown> & PromiseLike<QueryResult>
}

function paged<T>(rows: T[], state: QueryState): T[] {
  return rows.slice(state.from, state.to + 1)
}

function buildLargeSessionClient(options: { canManage?: boolean } = {}) {
  const templateRows = Array.from({ length: 1_250 }, (_, index) => ({
    participant_id: `participant-${index}`,
    row_token: `token-${index}`,
    roster_order_snapshot: index + 1,
    student_code_snapshot: `STU-${index + 1}`,
    full_name_snapshot: `นักเรียน ${index + 1}`,
  }))
  const scores = templateRows.flatMap((row, index) => [
    { participant_id: row.participant_id, measurement_id: PRETEST_ID, raw_score: index % 20 },
    { participant_id: row.participant_id, measurement_id: POSTTEST_ID, raw_score: (index % 20) + 1 },
  ])
  const rpc = vi.fn(async (name: string) => {
    if (name === 'can_manage_education_research_project') {
      return { data: options.canManage ?? true, error: null }
    }
    if (name === 'create_education_research_import_template') {
      return { data: TEMPLATE_ID, error: null }
    }
    throw new Error(`Unexpected RPC: ${name}`)
  })

  return {
    rpc,
    from(table: string) {
      return {
        select() {
          return queryChain(state => {
            if (table === 'education_research_projects') {
              return {
                data: {
                  id: PROJECT_ID,
                  org_id: 'org-1',
                  title: 'โครงการจริง',
                  topic: 'แรงและการเคลื่อนที่',
                  classrooms: { name: 'ม.4/1' },
                },
                error: null,
              }
            }
            if (table === 'education_research_import_templates') {
              return { data: { id: TEMPLATE_ID, version: 1 }, error: null }
            }
            if (table === 'education_research_import_template_rows') {
              return { data: paged(templateRows, state), error: null }
            }
            if (table === 'education_research_measurements') {
              return {
                data: [
                  { id: PRETEST_ID, measurement_type: 'pretest', source_type: 'excel', max_score: 20 },
                  { id: POSTTEST_ID, measurement_type: 'posttest', source_type: 'excel', max_score: 20 },
                ],
                error: null,
              }
            }
            if (table === 'education_research_scores') {
              return { data: paged(scores, state), error: null }
            }
            throw new Error(`Unexpected table: ${table}`)
          })
        },
      }
    },
  }
}

describe('education research score-template route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAuthUser.mockResolvedValue({ id: 'teacher-1' })
    mocks.buildWorkbook.mockResolvedValue(Buffer.from('xlsx'))
  })

  it('includes every participant and current score beyond the 1,000-row response cap', async () => {
    const client = buildLargeSessionClient()
    mocks.createClient.mockResolvedValue(client)

    const response = await POST(new Request('https://korkru.test'), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(mocks.buildWorkbook).toHaveBeenCalledOnce()
    const input = mocks.buildWorkbook.mock.calls[0][0]
    expect(input.rows).toHaveLength(1_250)
    expect(input.rows[1_249]).toMatchObject({
      student_code: 'STU-1250',
      current_pretest: 9,
      current_posttest: 10,
    })
  })

  it('does not create an import template without manage permission', async () => {
    const client = buildLargeSessionClient({ canManage: false })
    mocks.createClient.mockResolvedValue(client)

    const response = await POST(new Request('https://korkru.test'), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })

    expect(response.status).toBe(403)
    expect(client.rpc).not.toHaveBeenCalledWith(
      'create_education_research_import_template',
      expect.anything(),
    )
    expect(mocks.buildWorkbook).not.toHaveBeenCalled()
  })

  it('returns 401 before querying project data when no session exists', async () => {
    mocks.getAuthUser.mockResolvedValue(null)

    const response = await POST(new Request('https://korkru.test'), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })

    expect(response.status).toBe(401)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
})
