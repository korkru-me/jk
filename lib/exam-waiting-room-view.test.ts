import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExamWaitingRoom } from '@/components/exam/exam-waiting-room'
import { exerciseWaitingDetails, type ExamWaitingSummary } from './exam-waiting-room'

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
    expect(html).toContain('กติกาก่อนเข้าห้องสอบ'); expect(html).toContain('>คำชี้แจง<'); expect(html).toContain('คำชี้แจงของครู')
    expect(html).toContain('/brand/deer-mark.svg')
    expect(html).not.toContain('<input'); expect(html).not.toContain('<textarea')
    if (previewMode) {
      expect(html).toContain('ไม่สร้างรอบสอบ'); expect(html).toContain('เข้าห้องสอบตัวอย่าง')
      expect(html).toContain('href="/assignments/test"')
    } else expect(html).toContain('เข้าห้องสอบและเริ่มจับเวลา')
  })
  it('renders editor formatting while removing unsafe announcement markup', () => {
    const html = renderToStaticMarkup(createElement(ExamWaitingRoom, { summary: { ...summary, description: '<p><strong>อ่านก่อนเริ่ม</strong><img src=x onerror=alert(1)></p>' },
      busy: false, code: '', error: null, ...callbacks() }))
    expect(html).toContain('<strong>อ่านก่อนเริ่ม</strong>')
    expect(html).not.toContain('src="x"')
    expect(html).not.toContain('onerror')
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

describe('exercise uses the same waiting presentation with exercise-specific rules', () => {
  const details = exerciseWaitingDetails({ type: 'exercise', completion_rule: 'fixed', max_attempts: 3,
    passing_type: null, passing_value: null, score_strategy: 'best', streak_target: null, streak_question_cap: null,
    retry_scope: 'all', instant_check: false, instant_check_answer_key: false, require_work_image: false })!
  const exercise: ExamWaitingSummary = { ...summary, title: 'การเคลื่อนที่', assignmentType: 'exercise', exerciseDetails: details }
  function render(over: Partial<ExamWaitingSummary> = {}, previewMode = false) {
    return renderToStaticMarkup(createElement(ExamWaitingRoom, { summary: { ...exercise, ...over },
      busy: false, code: '', error: null, previewMode, ...callbacks() }))
  }
  it.each([false, true])('has matching card/rules but no exam/SEB wording or questions, preview=%s', previewMode => {
    const html = render({}, previewMode)
    expect(html).toContain('หน้ารอเข้าห้องทำแบบฝึกหัด'); expect(html).toContain('กติกาก่อนเข้าห้องทำแบบฝึกหัด')
    expect(html).toContain('เวลาทำแบบฝึกหัด 30 นาที'); expect(html).toContain('ชุดแบบฝึกหัดที่กำหนด 3 ข้อ')
    expect(html).toContain('จำนวนครั้งที่ทำได้ทั้งหมด: 3 ครั้ง'); expect(html).toContain('รอบที่ได้คะแนนดีที่สุด')
    expect(html).toContain('assignment-waiting-stage')
    expect(html).toContain('max-w-5xl')
    expect(html).not.toMatch(/ข้อสอบ|ห้องสอบ|SEB|<input|<textarea/)
    expect(html).toContain(previewMode ? 'เข้าห้องทำแบบฝึกหัดตัวอย่าง' : 'เข้าห้องทำแบบฝึกหัดและเริ่มจับเวลา')
  })
  it('untimed active practice promises the original round, not a running timer', () => {
    const html = render({ durationMinutes: null, activeSubmissionId: 'receipt' })
    expect(html).toContain('ทำต่อในรอบเดิมโดยไม่ใช้สิทธิ์รอบใหม่')
    expect(html).not.toMatch(/เวลายังเดิน|เริ่มจับเวลา/)
  })
  it.each(['active', 'expired', 'completed'])('shows the correct %s exercise action without a fresh start promise', state => {
    const html = render({ activeSubmissionId: state === 'active' ? 'receipt' : null, expired: state === 'expired',
      completedSubmissionId: state === 'completed' ? 'receipt' : null })
    expect(html).not.toContain('เวลาเริ่มเมื่อกดเข้า')
    expect(html).toContain(state === 'active' ? 'ทำต่อ' : state === 'expired'
      ? 'ตรวจสอบผลรอบทำแบบฝึกหัดเดิม' : 'ดูผลรอบทำแบบฝึกหัดเดิม')
  })
  it('renders threshold/streak rules without claiming an attempt quota or fixed question count', () => {
    expect(render({ exerciseDetails: { ...details, completion: 'threshold', passingType: 'percent', passingValue: 70 } })).toContain('70% ทำซ้ำได้จนกว่าจะผ่าน')
    const html = render({ questionCount: null, exerciseDetails: { ...details, completion: 'streak', streakTarget: 3, streakQuestionCap: 10 } })
    expect(html).toContain('ตอบถูกติดต่อกัน 3 ข้อ'); expect(html).toContain('แต่ละรอบทำได้สูงสุด 10 ข้อ')
    expect(html).not.toMatch(/จำนวนครั้งที่ทำได้ทั้งหมด|คะแนนที่ใช้:|ชุดแบบฝึกหัดที่กำหนด/)
  })
  it('explains wrong-only retry, instant check and required work images without exposing an answer', () => {
    const html = render({ exerciseDetails: { ...details, retryWrongOnly: true, instantCheck: true, requireWorkImage: true } })
    expect(html).toContain('เฉพาะข้อที่ยังไม่ได้คะแนนเต็ม'); expect(html).toContain('แสดงเฉพาะผลถูกหรือผิด')
    expect(html).toContain('แนบภาพแสดงวิธีทำ'); expect(html).not.toContain('พร้อมแสดงคำตอบที่ถูกต้อง')
  })
})
