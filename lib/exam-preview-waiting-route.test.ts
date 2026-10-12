import { createElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ user: vi.fn(), assignment: vi.fn(), access: vi.fn(),
  admin: vi.fn(), started: vi.fn(), questions: vi.fn(), build: vi.fn(), waiting: vi.fn(), exam: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`) },
  notFound: () => { throw new Error('not-found') } }))
vi.mock('@/lib/auth/server', () => ({ getAuthUser: m.user }))
vi.mock('@/lib/auth/assignment-access', () => ({ canManageAssignment: m.access }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => {
  const query = { select: () => query, eq: () => query, maybeSingle: m.assignment }
  return query
} }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }))
vi.mock('@/lib/assignment-question-access.server', () => ({ loadAssignmentQuestionsByProvenance: m.questions }))
vi.mock('@/lib/assignment-attempt', () => ({ buildAssignmentAttempt: m.build }))
vi.mock('@/components/exam/exam-waiting-preview', () => ({ ExamWaitingPreviewClient: m.waiting }))
vi.mock('@/components/exam/exam-client', () => ({ ExamClient: m.exam }))

import PreviewPage from '@/app/(app)/assignments/[id]/preview/page'

const id = '30000000-0000-4000-8000-000000000001'
const assignment = { id, title: 'ข้อสอบตัวอย่าง', description: 'อ่านคำชี้แจงจากครู', type: 'exam',
  question_ids: ['question-1'], duration_minutes: 30, random_question_count: null, end_at: null,
  secure_browser_mode: 'none', access_code: 'PRIVATE-CODE', completion_rule: 'fixed', sections: [] }
function page(preview?: string | string[]) {
  return PreviewPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ preview }) })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('React', { createElement })
  m.user.mockResolvedValue({ id: 'teacher' }); m.access.mockResolvedValue(true)
  m.assignment.mockResolvedValue({ data: { ...assignment } })
  m.admin.mockImplementation(() => ({ from: () => {
    const query = { select: () => query, eq: () => query, limit: () => query, maybeSingle: m.started }
    return query
  } }))
  m.started.mockResolvedValue({ data: null })
  m.questions.mockResolvedValue({ questions: [{ id: 'question-1', title: 'Secret question', created_by: 'teacher',
    question_type: 'mcq', mcq_options: [{ text: 'Option', is_correct: true }] }], missingQuestionIds: [], duplicateQuestionCount: 0 })
  m.build.mockReturnValue([{ question_id: 'question-1', random_values: {}, correct_answer: 'SECRET-ANSWER', max_score: 1 }])
})
afterEach(() => vi.unstubAllGlobals())

describe.each(['exam', 'exercise'])('teacher %s preview enters through a question-free waiting room (mocked reads)', type => {
  beforeEach(() => m.assignment.mockResolvedValue({ data: { ...assignment, type } }))
  it.each([undefined, 'true', 'take', ['exam'], ['exercise']])('default/invalid hint %j never loads or serializes questions', async hint => {
    const element = await page(hint) as ReactElement<{ summary: unknown }>
    expect(element.type).toBe(m.waiting)
    expect(JSON.stringify(element.props)).not.toContain('PRIVATE-CODE')
    expect(JSON.stringify(element.props)).not.toContain('SECRET-ANSWER')
    expect(JSON.stringify(element.props)).not.toContain('Secret question')
    expect(m.questions).not.toHaveBeenCalled(); expect(m.build).not.toHaveBeenCalled(); expect(m.admin).not.toHaveBeenCalled()
  })
  it('only explicit preview navigation builds the teacher-only simulated exam', async () => {
    const element = await page(type) as ReactElement<{ children: ReactElement<{ previewMode: boolean; submissionId: string }> }>
    expect(m.access).toHaveBeenCalledExactlyOnceWith(id, 'teacher')
    expect(m.questions).toHaveBeenCalledOnce(); expect(m.build).toHaveBeenCalledOnce()
    expect(element.props.children.type).toBe(m.exam)
    expect(element.props.children.props.previewMode).toBe(true)
    expect(element.props.children.props.submissionId).toBe(`preview-${id}`)
  })
  it.each([undefined, 'exam', 'exercise'])('denies students/unrelated teachers before waiting or answer-bearing reads (%j)', async hint => {
    m.access.mockResolvedValue(false)
    await expect(page(hint)).rejects.toThrow('not-found')
    expect(m.admin).not.toHaveBeenCalled(); expect(m.questions).not.toHaveBeenCalled(); expect(m.build).not.toHaveBeenCalled()
  })
  it('redirects an unauthenticated user before assignment or question reads', async () => {
    m.user.mockResolvedValue(null)
    await expect(page('exam')).rejects.toThrow('redirect:/login')
    expect(m.assignment).not.toHaveBeenCalled(); expect(m.questions).not.toHaveBeenCalled()
  })
  it('a different work-type hint does not skip the waiting room', async () => {
    const element = await page(type === 'exam' ? 'exercise' : 'exam') as ReactElement
    expect(element.type).toBe(m.waiting)
    expect(m.questions).not.toHaveBeenCalled(); expect(m.build).not.toHaveBeenCalled()
  })
  it('empty exams show a disabled waiting summary without loading question data', async () => {
    m.assignment.mockResolvedValue({ data: { ...assignment, type, question_ids: [] } })
    const element = await page() as ReactElement<{ summary: { blockedReason: string } }>
    expect(element.type).toBe(m.waiting); expect(element.props.summary.blockedReason).toBe(`ชุด${type === 'exercise' ? 'แบบฝึกหัด' : 'ข้อสอบ'}นี้ยังไม่มีโจทย์`)
    expect(m.questions).not.toHaveBeenCalled(); expect(m.admin).not.toHaveBeenCalled()
  })
  it('SEB/streak metadata remain a teacher preview, with only the code-required boolean', async () => {
    m.assignment.mockResolvedValue({ data: { ...assignment, secure_browser_mode: 'seb_required', completion_rule: 'streak' } })
    const element = await page() as ReactElement<{ summary: { accessMode: string; questionCount: number | null; requiresAccessCode: boolean; startedAt: null } }>
    expect(element.props.summary).toMatchObject({ accessMode: 'seb', questionCount: null, requiresAccessCode: true, startedAt: null })
    expect(JSON.stringify(element.props)).not.toContain('PRIVATE-CODE'); expect(m.build).not.toHaveBeenCalled()
  })
})
