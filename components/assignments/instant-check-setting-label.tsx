'use client'

import { CircleHelp } from 'lucide-react'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

export const INSTANT_CHECK_SETTING_LABEL = 'ให้นักเรียนกดตรวจคำตอบได้ทีละข้อ'
export const INSTANT_CHECK_SETTING_DESCRIPTION =
  'เมื่อเปิดใช้งาน นักเรียนจะทราบผลว่าตอบถูกหรือผิดทันทีหลังจากกดตรวจคำตอบในแต่ละข้อ หากไม่เปิดใช้งาน นักเรียนจะทราบผลเมื่อทำครบทุกข้อและส่งแบบฝึกหัดแล้ว'

export function InstantCheckSettingLabel() {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={200}
        render={(
          <span
            tabIndex={0}
            className="inline-flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
      >
        {INSTANT_CHECK_SETTING_LABEL}
        <CircleHelp aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </HoverCardTrigger>
      <HoverCardContent align="start" side="top" className="w-80 max-w-[calc(100vw-2rem)]">
        {INSTANT_CHECK_SETTING_DESCRIPTION}
      </HoverCardContent>
    </HoverCard>
  )
}
