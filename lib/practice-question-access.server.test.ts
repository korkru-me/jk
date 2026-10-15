import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadPracticeLibraryLocalSnapshot, loadPracticeLibrarySearch } from './practice-question-access.server'

vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks }))
const actorId = '11111111-1111-4111-8111-111111111111'
const libraryId = '22222222-2222-4222-8222-222222222222'
const classroomId = '33333333-3333-4333-8333-333333333333'
const state = { q: '', tags: [], page: 1, ignoredTagCount: 0 }
const questionId = (index: number) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
let total: number
let role: string

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('PRACTICE_LIBRARY_ENABLED', 'true')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.invalid')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only')
  mocks.from.mockReset()
  mocks.rpc.mockReset()
  total = 143
  role = 'student'
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: async () => ({ error: null, data: table === 'practice_libraries'
        ? { id: libraryId, org_id: 'org', classroom_id: classroomId, title: 'ฝึก', description: null, status: 'published', reveal_answer_key: false, access_code: 'code', calculator_enabled: true, scratchpad_enabled: true, shuffle_options: false }
        : table === 'users' ? { id: actorId, role, status: 'active' }
        : table === 'classrooms' ? { id: classroomId, org_id: 'org', status: 'active', classroom_type: 'subject' }
        : { student_id: actorId } }),
      in: async (_column: string, ids: string[]) => ({ error: null, data: ids.map(id => ({ id, question_text: '<p>โจทย์</p>', difficulty: 'medium', subject: 'ฟิสิกส์', solution_text: 'private solution', solution_image_urls: [] })) }),
    }
    return query
  })
  mocks.rpc.mockImplementation(async (_name: string, params: Record<string, unknown>) => ({ error: null,
    data: Array.from({ length: Math.max(0, Math.min(24, total - Number(params.p_offset))) }, (_, offset) => {
      const index = Number(params.p_offset) + offset
      return { question_id: questionId(index), title: `ข้อ ${index}`, question_type: 'written', tags: [], position: index, attempt_count: 0, total_count: total }
    }),
  }))
})
afterEach(() => vi.unstubAllEnvs())

it('authorizes once per snapshot while every bounded RPC remains actor/library-scoped', async () => {
  const result = await loadPracticeLibraryLocalSnapshot(actorId, libraryId, state)
  expect(result.status).toBe('ready')
  if (result.status !== 'ready') return
  expect(result.items).toHaveLength(143)
  expect(result.library.requiresAccessCode).toBe(true)
  expect(result.items.every(item => item.excerpt === 'โจทย์' && item.hasSolution === false)).toBe(true)
  expect(JSON.stringify(result)).not.toMatch(/private solution|solution_text|access_code/)
  expect(mocks.from.mock.calls.map(([table]) => table).filter(table => table !== 'questions')).toEqual(['practice_libraries', 'users', 'classrooms', 'classroom_students'])
  expect(mocks.rpc).toHaveBeenCalledTimes(6)
  expect(mocks.from.mock.calls.filter(([table]) => table === 'questions')).toHaveLength(6)
  for (const [, params] of mocks.rpc.mock.calls) {
    expect(params).toMatchObject({ p_actor_id: actorId, p_library_id: libraryId, p_limit: 24 })
  }
  expect(mocks.rpc.mock.calls.map(([, params]) => params.p_offset)).toEqual([0, 24, 48, 72, 96, 120])
})

it('does not reuse authorization across requests and denies a changed role before RPC reads', async () => {
  await loadPracticeLibraryLocalSnapshot(actorId, libraryId, state)
  mocks.from.mockClear()
  mocks.rpc.mockClear()
  role = 'teacher'
  expect(await loadPracticeLibraryLocalSnapshot(actorId, libraryId, state)).toEqual({ status: 'forbidden' })
  expect(mocks.from).toHaveBeenCalledWith('users')
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('fails the complete snapshot if any later page loses authorization', async () => {
  const original = mocks.rpc.getMockImplementation()!
  mocks.rpc.mockImplementation((name: string, params: Record<string, unknown>) => Number(params.p_offset) === 24
    ? Promise.resolve({ error: { code: '42501' }, data: null }) : original(name, params))
  expect(await loadPracticeLibraryLocalSnapshot(actorId, libraryId, state)).toEqual({ status: 'unavailable' })
})

it('rejects totals that change between pages rather than returning an incomplete list', async () => {
  const original = mocks.rpc.getMockImplementation()!
  mocks.rpc.mockImplementation(async (name: string, params: Record<string, unknown>) => {
    const result = await original(name, params)
    if (Number(params.p_offset) > 0) result.data.forEach((row: { total_count: number }) => { row.total_count = 144 })
    return result
  })
  expect(await loadPracticeLibraryLocalSnapshot(actorId, libraryId, state)).toEqual({ status: 'unavailable' })
})

it('keeps public search authorization separate and binds exercise requests exactly', async () => {
  const exerciseId = '44444444-4444-4444-8444-444444444444'
  expect((await loadPracticeLibrarySearch(actorId, libraryId, { ...state, exerciseId })).status).toBe('ready')
  expect(mocks.rpc).toHaveBeenCalledWith('get_student_practice_exercise_questions', {
    p_actor_id: actorId, p_library_id: libraryId, p_exercise_id: exerciseId, p_limit: 24, p_offset: 0,
  })
})

it('keeps bulk snapshots disabled outside development', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  expect(await loadPracticeLibraryLocalSnapshot(actorId, libraryId, state)).toEqual({ status: 'unavailable' })
  expect(mocks.from).not.toHaveBeenCalled()
})
