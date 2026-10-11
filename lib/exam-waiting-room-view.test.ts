import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExamWaitingRoom } from '@/components/exam/exam-waiting-room'
import type { ExamWaitingSummary } from './exam-waiting-room'

const summary: ExamWaitingSummary = { title: 'ข้อสอบ', description: 'คำชี้แจงของครู', durationMinutes: 30,
  questionCount: 3, endAt: null, accessMode: 'browser', requiresAccessCode: false,
  previousSubmissionId: null, activeSubmissionId: null, completedSubmissionId: null,
  expired: false, startedAt: null, blockedReason: null }
const callbacks = () => ({ onStart: vi.fn(), onReload: vi.fn(), onCodeChange: vi.fn() })
beforeEach(() => vi.stubGlobal('React', { createElement }))
afterEach(() => vi.unstubAllGlobals())

describe('shared exam waiting presentation', () => {
  it.each([false, true])('shows the same rules without question inputs for preview=%s', previewMode => {
    const html = renderToStaticMarkup(createElement(ExamWaitingRoom, { summary, busy: false, code: '', error: null,
      previewMode, returnHref: '/assignments/test', ...callbacks() }))
    expect(html).toContain('กติกาก่อนเข้าห้องสอบ'); expect(html).toContain('คำชี้แจงของครู')
    expect(html).not.toContain('<input'); expect(html).not.toContain('<textarea')
    if (previewMode) {
      expect(html).toContain('ไม่สร้างรอบสอบ'); expect(html).toContain('เข้าห้องสอบตัวอย่าง')
      expect(html).toContain('href="/assignments/test"')
    } else expect(html).toContain('เข้าห้องสอบและเริ่มจับเวลา')
  })
  it('escapes teacher instructions rather than treating them as executable HTML', () => {
    const html = renderToStaticMarkup(createElement(ExamWaitingRoom, { summary: { ...summary, description: '<img src=x onerror=alert(1)>' },
      busy: false, code: '', error: null, ...callbacks() }))
    expect(html).not.toContain('<img'); expect(html).toContain('&lt;img')
  })
  it.each(['busy', 'blocked', 'completed', 'empty-code'])('form submission cannot bypass disabled %s state with Enter', state => {
    const cb = callbacks()
    const element = ExamWaitingRoom({ summary: { ...summary, blockedReason: state === 'blocked' ? 'ปิดรับแล้ว' : null,
      completedSubmissionId: state === 'completed' ? 'receipt' : null, requiresAccessCode: state === 'empty-code' },
    busy: state === 'busy', code: '', error: null, ...cb }) as ReactElement<{ children: ReactNode }>
    const form = Children.toArray(element.props.children).find(node => isValidElement(node) && node.type === 'form') as ReactElement<{ onSubmit: (event: { preventDefault: () => void }) => void }>
    const preventDefault = vi.fn()
    form.props.onSubmit({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce(); expect(cb.onStart).not.toHaveBeenCalled()
  })
  it.each(['active', 'expired', 'completed'])('does not promise a fresh timer for %s state', state => {
    const html = renderToStaticMarkup(createElement(ExamWaitingRoom, { summary: { ...summary,
      activeSubmissionId: state === 'active' ? 'receipt' : null, expired: state === 'expired',
      completedSubmissionId: state === 'completed' ? 'receipt' : null }, busy: false, code: '', error: null, ...callbacks() }))
    expect(html).not.toContain('เวลาเริ่มเมื่อกดเข้าห้องสอบ')
    expect(html).toContain(state === 'active' ? 'ใช้เวลาเริ่มเดิม' : state === 'expired' ? 'ไม่เริ่มรอบใหม่' : 'ไม่เริ่มรอบสอบใหม่')
  })
})
