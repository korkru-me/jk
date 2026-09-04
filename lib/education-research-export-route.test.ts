import ExcelJS from 'exceljs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { POST } from '@/app/api/research/[id]/data-export/route'

const PROJECT_ID = '25fc8f03-b2a8-45a7-8718-c14132af8320'
const USER_ID = 'd8f57df1-7fbf-4ac3-86ec-d384045838c3'
const STUDENT_ID = 'e7c3559f-e509-4bbb-8fef-56e5e333acaa'
const PARTICIPANT_ID = 'd223d308-b8d1-4ed4-8fca-76f52a58a641'
const PRETEST_ID = 'a1a9f2c6-96c8-445b-9ddb-efc726c3f813'
const POSTTEST_ID = '33a327fb-35f4-4335-a675-70ab1e121011'

interface QueryState {
  selected: string
  equals: Map<string, unknown>
  included: Map<string, readonly string[]>
  from: number
  to: number
}

interface QueryResult {
  data: unknown
  error: null | { message: string }
}

function queryChain(
  selected: string,
  resolve: (state: QueryState) => QueryResult,
): Record<string, unknown> & PromiseLike<QueryResult> {
  const state: QueryState = {
    selected,
    equals: new Map(),
    included: new Map(),
    from: 0,
    to: 999,
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
  chain.order = () => chain
  chain.range = (from: number, to: number) => {
    state.from = from
    state.to = to
    return chain
  }
  chain.maybeSingle = async () => resolve(state)
  chain.then = (onFulfilled, onRejected) => Promise.resolve(resolve(state)).then(onFulfilled, onRejected)
  return chain as Record<string, unknown> & PromiseLike<QueryResult>
}

function project() {
  return {
    id: PROJECT_ID,
    org_id: '6c41aa93-2f9a-4d27-8f7c-5a54bbf25356',
    title: 'โครงการจริง',
    topic: 'แรงและการเคลื่อนที่',
    passing_threshold_percent: 70,
    classrooms: { name: 'ม.4/1' },
  }
}

function measurements() {
  return [
    { id: PRETEST_ID, project_id: PROJECT_ID, measurement_type: 'pretest', max_score: 20 },
    { id: POSTTEST_ID, project_id: PROJECT_ID, measurement_type: 'posttest', max_score: 20 },
  ]
}

function scores() {
  return [
    { participant_id: PARTICIPANT_ID, measurement_id: PRETEST_ID, raw_score: 10, updated_at: '2026-09-04T06:00:00.000Z' },
    { participant_id: PARTICIPANT_ID, measurement_id: POSTTEST_ID, raw_score: 18, updated_at: '2026-09-04T07:00:00.000Z' },
  ]
}

function sessionClient(options: { canManage?: boolean; selectedColumns: string[]; requestedTables: string[] }) {
  return {
    rpc: vi.fn(async (name: string) => {
      if (name !== 'can_manage_education_research_project') throw new Error(`Unexpected RPC: ${name}`)
      return { data: options.canManage ?? true, error: null }
    }),
    from(table: string) {
      options.requestedTables.push(table)
      return {
        select(selected: string) {
          options.selectedColumns.push(`${table}:${selected}`)
          return queryChain(selected, state => {
            if (table === 'education_research_projects') return { data: project(), error: null }
            if (table === 'education_research_measurements') return { data: measurements(), error: null }
            if (table === 'education_research_participants') {
              return {
                data: [{
                  id: PARTICIPANT_ID,
                  student_id: STUDENT_ID,
                  roster_order: 1,
                  created_at: '2026-09-01T00:00:00.000Z',
                  users: { id: STUDENT_ID, full_name: 'นักเรียนจริง' },
                }].slice(state.from, state.to + 1),
                error: null,
              }
            }
            if (table === 'education_research_scores') {
              return { data: scores().slice(state.from, state.to + 1), error: null }
            }
            if (table === 'student_profiles') {
              return { data: [{ student_id: STUDENT_ID, student_code: 'STU-001', class_number: 1 }], error: null }
            }
            throw new Error(`Unexpected table: ${table}`)
          })
        },
      }
    },
  }
}

function request(mode: string) {
  return new Request(`https://korkru.test/api/research/${PROJECT_ID}/data-export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
}

async function workbookText(response: Response) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const values: string[] = []
  workbook.eachSheet(sheet => sheet.eachRow(row => row.eachCell(cell => values.push(String(cell.value ?? '')))))
  return values.join('\n')
}

describe('education research data-export route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAuthUser.mockResolvedValue({ id: USER_ID })
  })

  it('exports anonymous data without querying student identity fields', async () => {
    const selectedColumns: string[] = []
    const requestedTables: string[] = []
    const session = sessionClient({ selectedColumns, requestedTables })
    const audit = vi.fn().mockResolvedValue({ data: 19, error: null })
    mocks.createClient.mockResolvedValue(session)
    mocks.createAdminClient.mockReturnValue({ rpc: audit })

    const response = await POST(request('anonymous'), { params: Promise.resolve({ id: PROJECT_ID }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(response.headers.get('Content-Type')).toContain('spreadsheetml.sheet')
    expect(selectedColumns.find(value => value.startsWith('education_research_participants:')))
      .toBe('education_research_participants:id, roster_order, created_at')
    expect(requestedTables).not.toContain('student_profiles')

    const text = await workbookText(response)
    expect(text).toContain('P001')
    expect(text).not.toContain('นักเรียนจริง')
    expect(text).not.toContain('STU-001')
    expect(text).not.toContain(STUDENT_ID)
    expect(audit).toHaveBeenCalledWith('record_education_research_export_event', {
      p_project_id: PROJECT_ID,
      p_actor_id: USER_ID,
      p_export_mode: 'anonymous',
      p_row_count: 1,
      p_source_score_updated_at: '2026-09-04T07:00:00.000Z',
    })
  })

  it('exports names and student codes only for the identified choice', async () => {
    const selectedColumns: string[] = []
    const requestedTables: string[] = []
    mocks.createClient.mockResolvedValue(sessionClient({ selectedColumns, requestedTables }))
    mocks.createAdminClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: 20, error: null }) })

    const response = await POST(request('identified'), { params: Promise.resolve({ id: PROJECT_ID }) })
    expect(response.status).toBe(200)
    expect(requestedTables).toContain('student_profiles')
    const text = await workbookText(response)
    expect(text).toContain('นักเรียนจริง')
    expect(text).toContain('STU-001')
    expect(text).not.toContain(STUDENT_ID)
  })

  it('does not query or audit individual data without manage permission', async () => {
    const selectedColumns: string[] = []
    const requestedTables: string[] = []
    mocks.createClient.mockResolvedValue(sessionClient({
      canManage: false,
      selectedColumns,
      requestedTables,
    }))
    const audit = vi.fn()
    mocks.createAdminClient.mockReturnValue({ rpc: audit })

    const response = await POST(request('identified'), { params: Promise.resolve({ id: PROJECT_ID }) })
    expect(response.status).toBe(403)
    expect(requestedTables).toEqual(['education_research_projects'])
    expect(audit).not.toHaveBeenCalled()
  })

  it('withholds the workbook when append-only audit recording fails', async () => {
    mocks.createClient.mockResolvedValue(sessionClient({ selectedColumns: [], requestedTables: [] }))
    mocks.createAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'audit failed' } }),
    })

    const response = await POST(request('anonymous'), { params: Promise.resolve({ id: PROJECT_ID }) })
    expect(response.status).toBe(500)
    expect(response.headers.get('Content-Type')).toContain('application/json')
    await expect(response.json()).resolves.toEqual({
      error: 'บันทึกประวัติการดาวน์โหลดไม่สำเร็จ จึงยังไม่ได้ส่งไฟล์',
    })
  })
})
