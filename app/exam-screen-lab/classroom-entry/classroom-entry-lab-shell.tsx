'use client'

import type { ReactNode, MouseEvent } from 'react'
import { toast } from 'sonner'
import { ShellClient } from '@/components/layout/shell-client'

export const CLASSROOM_ENTRY_LAB = '/exam-screen-lab/classroom-entry'

/** Every effectful real control stays read-only; only navigation is exercised. */
export function ClassroomEntryLabShell({ children }: { children: ReactNode }) {
  function click(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null
    const button = target?.closest('button')
    const anchor = target?.closest('a')
    const href = anchor?.getAttribute('href')
    const menuToggle = button && /^(เปิด|ปิด|ย่อ|ขยาย)เมนูด้านข้าง$/.test(button.getAttribute('aria-label') ?? '')
    if (button?.hasAttribute('data-classroom-navigation') || menuToggle) return
    if (anchor && href && (href === CLASSROOM_ENTRY_LAB || href.startsWith(`${CLASSROOM_ENTRY_LAB}?`))) return
    if (button || anchor || target?.closest('input,select,textarea,[contenteditable=true]')) {
      event.preventDefault(); event.stopPropagation()
      toast.info('LOCAL · ห้องทดลองนี้ใช้ทดสอบการเปิดหน้าและเปลี่ยนแท็บเท่านั้น')
    }
  }
  return <div onClickCapture={click} onSubmitCapture={event => { event.preventDefault(); event.stopPropagation() }} onChangeCapture={event => { event.preventDefault(); event.stopPropagation() }} onInputCapture={event => { event.preventDefault(); event.stopPropagation() }}>
    <ShellClient user={{ id: '00000000-0000-4000-9000-000000000001', email: 'classroom-entry@example.invalid', full_name: 'ครูจำลอง', role: 'teacher' }} initialUnreadCount={0} notificationsEnabled={false}>{children}</ShellClient>
  </div>
}
