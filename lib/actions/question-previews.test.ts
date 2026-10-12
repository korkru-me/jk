import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
import { getQuestionPreviewDetails } from './question-previews'

const ID = '00000000-0000-4000-8000-000000000001'
const query = { select: vi.fn(), in: vi.fn(), eq: vi.fn() }
const from = vi.fn()
const getUser = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  query.select.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.eq.mockResolvedValue({ data: [], error: null })
  from.mockReturnValue(query)
  getUser.mockResolvedValue({ data: { user: { id: 'teacher' } } })
  mocks.createClient.mockResolvedValue({ auth: { getUser }, from })
})

describe('getQuestionPreviewDetails', () => {
  it('uses the session client, a bounded id filter and explicit preview projection', async () => {
    await expect(getQuestionPreviewDetails([ID, ID])).resolves.toEqual({ data: [] })
    expect(from).toHaveBeenCalledWith('questions')
    expect(query.in).toHaveBeenCalledWith('id', [ID])
    expect(query.eq).toHaveBeenCalledWith('is_research_snapshot', false)
    const columns = query.select.mock.calls[0][0] as string
    expect(columns).not.toContain('*')
    expect(columns).not.toContain('solution_text')
    expect(columns).not.toContain('created_by')
  })
  it('fails closed before querying when there is no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(getQuestionPreviewDetails([ID])).resolves.toEqual({ error: 'ไม่ได้เข้าสู่ระบบ' })
    expect(from).not.toHaveBeenCalled()
  })
  it('rejects invalid ids and oversized batches before creating a client', async () => {
    await expect(getQuestionPreviewDetails(['invalid'])).resolves.toHaveProperty('error')
    await expect(getQuestionPreviewDetails(Array(51).fill(ID))).resolves.toHaveProperty('error')
    await expect(getQuestionPreviewDetails(null as unknown as string[])).resolves.toHaveProperty('error')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('does not expose database errors', async () => {
    query.eq.mockResolvedValue({ data: null, error: { message: 'private database detail' } })
    const result = await getQuestionPreviewDetails([ID])
    expect(result).toHaveProperty('error')
    expect(JSON.stringify(result)).not.toContain('private database detail')
  })
})
