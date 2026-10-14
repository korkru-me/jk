import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PracticeWaitingRoom } from '@/components/practice/practice-waiting-room'

const library = {
  id: '10000000-0000-4000-8000-000000000001',
  classroomId: '10000000-0000-4000-8000-000000000002',
  title: 'สอวน. ค่าย 1 · ไฟฟ้า',
  description: '<p><strong>เลือกฝึกตามหัวข้อที่ต้องการ</strong><img src=x onerror=alert(1)></p>',
  revealAnswerKey: false,
  requiresAccessCode: false,
  calculatorEnabled: false,
  scratchpadEnabled: true,
  shuffleOptions: true,
}

describe('practice waiting room', () => {
  it('explains the unscored flow before exposing the searchable library', () => {
    const html = renderToStaticMarkup(createElement(PracticeWaitingRoom, {
      library,
      questionCount: 128,
      enterHref: '/practice/library-1/library',
    }))

    expect(html).toContain('หน้ารอเข้าคลังฝึก')
    expect(html).toContain('128 ข้อ')
    expect(html).toContain('ไม่เก็บคำตอบ ผลถูกผิด หรือคะแนน')
    expect(html).toContain('ไม่สร้างรอบทำงาน ไม่จำกัดเวลา และไม่มีการส่งงาน')
    expect(html).toContain('href="/practice/library-1/library"')
    expect(html).not.toContain('<input')
  })

  it('keeps supported formatting and removes unsafe announcement markup', () => {
    const html = renderToStaticMarkup(createElement(PracticeWaitingRoom, {
      library,
      questionCount: 1,
      enterHref: '/practice/library-1/library',
    }))

    expect(html).toContain('<strong>เลือกฝึกตามหัวข้อที่ต้องการ</strong>')
    expect(html).not.toContain('src="x"')
    expect(html).not.toContain('onerror')
  })

  it('requires the configured access code before showing the library link', () => {
    const html = renderToStaticMarkup(createElement(PracticeWaitingRoom, {
      library: { ...library, requiresAccessCode: true },
      questionCount: 1,
      enterHref: '/practice/library-1/library',
      locked: true,
      unlockAction: () => {},
      accessError: 'invalid',
    }))

    expect(html).toContain('name="accessCode"')
    expect(html).toContain('required=""')
    expect(html).toContain('รหัสผ่านไม่ถูกต้อง')
    expect(html).not.toContain('href="/practice/library-1/library"')
  })
})
