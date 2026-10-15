import { beforeEach, expect, it, vi } from 'vitest'
import NewPracticeLibraryPage from '@/app/(app)/practice/new/page'

vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ actor: vi.fn(), classrooms: vi.fn(), bank: vi.fn(), source: vi.fn(), membership: vi.fn(), copyQuestions: vi.fn() }))
vi.mock('@/lib/practice-question', () => ({ isPracticeLibraryEnabled: () => true }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') }, redirect: () => { throw new Error('REDIRECT') } }))
vi.mock('@/app/(app)/practice/_components/practice-library-form', () => ({ PracticeLibraryForm: () => null }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }) }) }))
vi.mock('@/app/(app)/practice/_lib/teacher-data', () => ({
  authenticatePracticeTeacher: mocks.actor,
  loadManageablePracticeClassrooms: mocks.classrooms,
  loadSupportedPracticeBankQuestions: mocks.bank,
  loadPracticeLibraryForTeacher: mocks.source,
  loadPracticeLibraryQuestionIds: mocks.membership,
  loadPracticeCopyQuestions: mocks.copyQuestions,
}))

const sourceId = '00000000-0000-4000-8300-000000000001'
const targetId = '00000000-0000-4000-8300-000000000002'
const questionId = '00000000-0000-4000-8300-000000000003'
const library = {
  id: sourceId, org_id: 'org', classroom_id: 'source-room', title: 'ต้นฉบับ', description: '<p>คำชี้แจง</p>',
  status: 'published', reveal_answer_key: false, access_code: 'DEMO', calculator_enabled: false,
  scratchpad_enabled: true, shuffle_questions: false, shuffle_options: true,
}
const load = () => NewPracticeLibraryPage({ searchParams: Promise.resolve({ classroom: targetId, copy: sourceId }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.actor.mockResolvedValue({ ok: true, userId: 'teacher' })
  mocks.classrooms.mockResolvedValue({ classrooms: [{ id: targetId, orgId: 'org', name: 'ปลายทาง' }], error: null })
  mocks.bank.mockResolvedValue({ questions: [], error: null })
  mocks.source.mockResolvedValue({ canManage: true, library })
  mocks.membership.mockResolvedValue({ ids: [questionId], error: null })
  mocks.copyQuestions.mockResolvedValue({ questions: [], missingIds: [questionId], unsupportedIds: [], error: null })
})

it('seeds a new destination library while retaining false settings and visibly blocking unavailable questions', async () => {
  const result = await load()
  expect(result.props).toMatchObject({
    initialClassroomId: targetId, missingQuestionIds: [questionId],
    copyPreset: {
      title: 'ต้นฉบับ (สำเนา)', description: '<p>คำชี้แจง</p>', questionIds: [questionId],
      revealAnswerKey: false, calculatorEnabled: false, shuffleQuestions: false, accessCode: 'DEMO',
    },
  })
  const props = result.props as { initialLibrary?: unknown; copyPreset: Record<string, unknown> }
  expect(props.initialLibrary).toBeUndefined()
  expect(props.copyPreset).not.toHaveProperty('id')
  expect(props.copyPreset).not.toHaveProperty('status')
  expect(props.copyPreset).not.toHaveProperty('classroomId')
})

it('denies a target classroom the actor cannot manage before loading source data', async () => {
  mocks.classrooms.mockResolvedValue({ classrooms: [], error: null })
  await expect(load()).rejects.toThrow('NOT_FOUND')
  expect(mocks.source).not.toHaveBeenCalled()
})

it.each([false, true])('denies a view-only source or a source in another organization (cross-org=%s)', async crossOrg => {
  mocks.source.mockResolvedValue({ canManage: crossOrg, library: { ...library, org_id: crossOrg ? 'other-org' : 'org' } })
  await expect(load()).rejects.toThrow('NOT_FOUND')
  expect(mocks.membership).not.toHaveBeenCalled()
  expect(mocks.copyQuestions).not.toHaveBeenCalled()
})

it('does not return a partial copy when source membership fails', async () => {
  mocks.membership.mockResolvedValue({ ids: [], error: 'โหลดรายการโจทย์ไม่สำเร็จ' })
  const result = await load()
  expect(result.props).not.toHaveProperty('copyPreset')
  expect(mocks.copyQuestions).not.toHaveBeenCalled()
})
