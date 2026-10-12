import { createElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExamWaitingSummary } from './exam-waiting-room'

const m = vi.hoisted(() => ({ entry: vi.fn(), draw: vi.fn(), exam: vi.fn(), waiting: vi.fn(), client: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`) } }))
vi.mock('@/lib/actions/submissions', () => ({ readSubmissionEntry: m.entry, drawNextStreakQuestion: m.draw }))
vi.mock('@/lib/exam-taking', () => ({ getExamTakingData: m.exam }))
vi.mock('@/components/exam/exam-waiting-client', () => ({ ExamWaitingClient: m.waiting }))
vi.mock('@/components/exam/exam-client', () => ({ ExamClient: m.client }))
vi.mock('@/components/exam/access-code-form', () => ({ AccessCodeForm: () => null }))
vi.mock('@/components/exam/secure-exam-launch-gate', () => ({ SecureExamLaunchGate: () => null }))

import TakePage from '@/app/(app)/assignments/[id]/take/page'

const id = '30000000-0000-4000-8000-000000000001'
const receipt = '70000000-0000-4000-8000-000000000001'
const waiting: ExamWaitingSummary = {
  title: 'รอสอบ', description: null, durationMinutes: 30, questionCount: 2, endAt: null,
  accessMode: 'browser', requiresAccessCode: false, previousSubmissionId: receipt,
  activeSubmissionId: receipt, completedSubmissionId: null, expired: false,
  startedAt: '2026-10-10T03:00:00Z', blockedReason: null,
}
function page(attempt?: string | string[]) {
  return TakePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ attempt }) })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T03:01:00Z'))
  // Vitest's default JSX transform is classic; the application uses Next's
  // automatic transform. No DOM, Auth or network is involved in these tests.
  vi.stubGlobal('React', { createElement })
  m.entry.mockResolvedValue({ waitingRoom: { ...waiting } })
  m.exam.mockResolvedValue({ submission: { started_at: waiting.startedAt, student_id: 'student' },
    assignment: { completion_rule: 'fixed', secure_browser_verified: false, duration_minutes: 30 },
    answers: [{ id: 'answer' }], artifacts: [] })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('ordinary exam page composition (mocked external reads)', () => {
  it.each([undefined, 'foreign-receipt', [receipt]])('default/stale/forged GET %j returns only waiting without exam data', async hint => {
    expect((await page(hint) as ReactElement).type).toBe(m.waiting)
    expect(m.exam).not.toHaveBeenCalled(); expect(m.draw).not.toHaveBeenCalled()
  })
  it('only an exact active receipt gets safe question data and the original start time', async () => {
    const rendered = await page(receipt) as ReactElement<{ children: ReactElement<{ startedAt: string }> }>
    expect(m.exam).toHaveBeenCalledExactlyOnceWith(receipt)
    expect(rendered.props.children.type).toBe(m.client)
    expect(rendered.props.children.props.startedAt).toBe(waiting.startedAt)
    expect(m.draw).not.toHaveBeenCalled()
  })
  it('expired/blocked state never loads questions even with the formerly valid URL', async () => {
    m.entry.mockResolvedValue({ waitingRoom: { ...waiting, expired: true, activeSubmissionId: null } })
    expect((await page(receipt) as ReactElement).type).toBe(m.waiting)
    m.entry.mockResolvedValue({ waitingRoom: { ...waiting, blockedReason: 'หมดเวลา' } })
    expect((await page(receipt) as ReactElement).type).toBe(m.waiting)
    expect(m.exam).not.toHaveBeenCalled(); expect(m.draw).not.toHaveBeenCalled()
  })
  it('an exam GET never initializes/draws an empty streak', async () => {
    m.exam.mockResolvedValue({ submission: { started_at: waiting.startedAt }, assignment: { duration_minutes: 30, completion_rule: 'streak' }, answers: [] })
    expect((await page(receipt) as ReactElement).type).toBe(m.waiting)
    expect(m.draw).not.toHaveBeenCalled()
  })
  it.each(['timer', 'deadline'])('does not serialize questions when a slow read crosses the %s boundary', async boundary => {
    if (boundary === 'deadline') m.entry.mockResolvedValue({ waitingRoom: { ...waiting, endAt: '2026-10-10T03:02:00Z' } })
    const exam = await m.exam()
    m.exam.mockImplementation(async () => {
      vi.setSystemTime(new Date(boundary === 'timer' ? '2026-10-10T03:31:00Z' : '2026-10-10T03:03:00Z'))
      return exam
    })
    expect((await page(receipt) as ReactElement).type).toBe(m.waiting)
    expect(m.draw).not.toHaveBeenCalled()
  })
  it('keeps legacy exercise first-draw behavior', async () => {
    m.entry.mockResolvedValue({ submissionId: receipt })
    m.exam.mockResolvedValueOnce({ assignment: { completion_rule: 'streak' }, answers: [] })
    m.draw.mockResolvedValue({ success: true })
    await page()
    expect(m.draw).toHaveBeenCalledExactlyOnceWith(receipt)
  })
})
