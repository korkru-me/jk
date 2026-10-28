import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/actions/org', () => ({ getMyOrgId: vi.fn() }))
vi.mock('@/lib/question-set-filing', () => ({ fileQuestionsIntoSets: vi.fn() }))
import { exportQuestions } from './question-export'
import { parseExportFile, exportFileBatches } from '@/lib/question-portable'

const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const getUser = vi.fn(), from = vi.fn()
let rows: Record<string, unknown>[]
let filters: string[][]
beforeEach(() => {
  vi.clearAllMocks()
  filters = []
  rows = Array.from({ length: 101 }, (_, i) => ({
    id: id(i + 1), title: `โจทย์ ${i + 1}`, question_text: '<p>โจทย์ทดสอบ</p>',
    group_id: null, question_type: 'written', answer_formula: '42', extra_data: {},
    solution_text: 'เฉลยทดสอบ', image_urls: [], solution_image_urls: [],
  }))
  getUser.mockResolvedValue({ data: { user: { id: 'teacher' } } })
  from.mockImplementation(() => {
    let ids: string[] = []
    const query = {
      select: vi.fn(() => query),
      in: vi.fn((_column: string, value: string[]) => { ids = value; filters.push(value); return query }),
      eq: vi.fn(() => query),
      then: (resolve: (value: unknown) => void) => resolve({ data: rows.filter(q => ids.includes(q.id as string)).reverse(), error: null }),
    }
    return query
  })
  mocks.createClient.mockResolvedValue({ auth: { getUser }, from })
})

describe('bulk question export', () => {
  it('requires valid bounded IDs and authentication', async () => {
    for (const ids of [[], ['invalid'], null, Array(10001).fill(id(1))]) {
      expect(await exportQuestions(ids as string[])).toHaveProperty('error')
    }
    expect(mocks.createClient).not.toHaveBeenCalled()
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await exportQuestions([id(1)])).toEqual({ error: 'ไม่ได้เข้าสู่ระบบ' })
    expect(from).not.toHaveBeenCalled()
  })
  it('exports selections across pages in bounded reads with stable order and no duplicate rows', async () => {
    const ids = rows.map(q => q.id as string)
    const result = await exportQuestions([...ids, ids[0]])
    expect(filters.map(batch => batch.length)).toEqual([100, 1])
    expect(result).toHaveProperty('filename', 'korkru-questions-101.korkru.json')
    if (!result.content) throw new Error('Expected export')
    const file = parseExportFile(result.content)
    if (!('data' in file)) throw new Error('Expected portable file')
    expect(file.data.questions.map(q => q.title)).toEqual(rows.map(q => q.title))
    expect(file.data.questions[0].answer_formula).toBe('42')
    expect(file.data.questions[0].solution_text).toBe('เฉลยทดสอบ')
    expect(exportFileBatches(file.data).map(batch => JSON.parse(batch).questions.length)).toEqual([50, 50, 1])
    expect(result.content).not.toContain('created_by')
    expect(result.content).not.toContain('org_id')
  })
  it('rejects missing or inaccessible rows instead of silently exporting an incomplete selection', async () => {
    expect(await exportQuestions([id(1), id(999)])).toHaveProperty('error')
  })
  it('reports unsupported multi-step groups instead of silently omitting them', async () => {
    rows[0].group_id = id(900)
    expect(await exportQuestions([id(1), id(2)])).toHaveProperty('error')
  })
})
