import { createElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExamWaitingSummary } from './exam-waiting-room'

const m = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push, refresh: m.refresh }) }))
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useTransition: () => [false, (callback: () => void) => callback()] }))
import { ExamWaitingPreviewClient } from '@/components/exam/exam-waiting-preview'

const summary: ExamWaitingSummary = { title: 'ตัวอย่าง', description: null, durationMinutes: 30,
  questionCount: 3, endAt: null, accessMode: 'browser', requiresAccessCode: false,
  previousSubmissionId: null, activeSubmissionId: null, completedSubmissionId: null,
  expired: false, startedAt: null, blockedReason: null }
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('React', { createElement }) })
afterEach(() => vi.unstubAllGlobals())

describe('teacher preview navigates only on deliberate start', () => {
  it.each([undefined, 'exam', 'exercise'] as const)('uses the correct hint for %j', assignmentType => {
    const element = ExamWaitingPreviewClient({ assignmentId: 'assignment', summary: { ...summary, assignmentType } }) as ReactElement<{
      onStartPreview: () => void; onReload: () => void; returnHref: string
    }>
    expect(m.push).not.toHaveBeenCalled()
    expect(element.props.returnHref).toBe('/assignments/assignment')
    element.props.onReload()
    expect(m.refresh).toHaveBeenCalledOnce(); expect(m.push).not.toHaveBeenCalled()
    element.props.onStartPreview()
    expect(m.push).toHaveBeenCalledExactlyOnceWith(`/assignments/assignment/preview?preview=${assignmentType ?? 'exam'}`)
  })
})
