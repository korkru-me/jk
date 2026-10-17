import { beforeEach, expect, it, vi } from 'vitest'
import { readPracticeStudentProgress } from './practice-progress.server'

vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks }))
const actor = '11111111-1111-4111-8111-111111111111'
const library = '22222222-2222-4222-8222-222222222222'
const student = '33333333-3333-4333-8333-333333333333'
const questionId = (i: number) => `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`
let role: string
let permission: string | null
let total: number

beforeEach(() => {
  mocks.from.mockReset(); mocks.rpc.mockReset()
  role = 'teacher'; permission = 'manage'; total = 143
  mocks.from.mockImplementation((table: string) => {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), in: vi.fn(() => query),
      maybeSingle: async () => ({ error: null, data: table === 'practice_libraries'
        ? { id: library, title: 'ฝึก', org_id: 'org', classroom_id: 'room', status: 'published' }
        : table === 'users' ? { id: actor, role, status: 'active' }
          : table === 'classrooms' ? { teacher_id: 'other-owner', org_id: 'org', status: 'active', classroom_type: 'subject' }
            : table === 'classroom_co_teachers' ? permission ? { permission } : null
              : table === 'classroom_students' ? { student_id: student, users: { full_name: 'นักเรียน' } } : { class_number: 1 } }),
    }
    return query
  })
  mocks.rpc.mockImplementation(async (_, params) => ({ error: null, data: Array.from({ length: Math.max(0, Math.min(params.p_limit, total - params.p_offset)) }, (_, index) => {
    const position = params.p_offset + index
    return { question_id: questionId(position), title: `ข้อ ${position}`, tags: [], attempt_count: position === 140 ? 5 : 0, total_count: total }
  }) }))
})

it('loads bounded safe aggregate pages under exact authorization before sorting and serializes only one UI page', async () => {
  const result = await readPracticeStudentProgress(library, student, actor)
  expect(result?.questions).toHaveLength(50)
  expect(result?.questions[0]).toEqual({ question_id: questionId(140), title: 'ข้อ 140', tags: [], attempt_count: 5 })
  expect(result?.total_question_count).toBe(143)
  expect(mocks.rpc.mock.calls.map(([, params]) => params.p_offset)).toEqual([0, 100])
  for (const [, params] of mocks.rpc.mock.calls) expect(params).toMatchObject({ p_actor_id: actor, p_library_id: library, p_student_id: student, p_limit: 100 })
  expect(JSON.stringify(result)).not.toMatch(/answer|correct|score|verdict|checked_at/)
})

it('denies a non-teacher or a view-only co-teacher before any aggregate RPC', async () => {
  role = 'student'
  expect(await readPracticeStudentProgress(library, student, actor)).toBeNull()
  expect(mocks.rpc).not.toHaveBeenCalled()
  role = 'teacher'; permission = null
  expect(await readPracticeStudentProgress(library, student, actor)).toBeNull()
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('returns an empty page and canonical page 1 for empty search results', async () => {
  total = 0
  const result = await readPracticeStudentProgress(library, student, actor, { q: 'ไม่มี', page: 200 })
  expect(result).toMatchObject({ questions: [], total_question_count: 0, total_pages: 1, canonical_page: 1 })
})

it('reports a partial or failed aggregate read instead of presenting unanswered questions', async () => {
  mocks.rpc.mockImplementationOnce(async () => ({ error: null, data: [{ question_id: questionId(0), title: 'หนึ่ง', tags: [], attempt_count: 1, total_count: 143 }] }))
    .mockImplementationOnce(async () => ({ error: { message: 'failed' }, data: null }))
  await expect(readPracticeStudentProgress(library, student, actor)).rejects.toThrow('read remaining practice question progress')
})
