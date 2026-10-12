'use client'

import type { ReactElement } from 'react'
import type { ShowResultsMode } from '@/lib/types'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

export const RESULT_VISIBILITY_OPTIONS: ReadonlyArray<{
  key: ShowResultsMode
  label: string
  description: string
}> = [
  {
    key: 'immediate',
    label: 'ทันทีหลังส่ง',
    description: 'นักเรียนจะเห็นคะแนนรวม คะแนนรายข้อ ผลว่าตอบถูกหรือผิด และคำตอบที่ถูกต้องทันทีหลังส่งงาน',
  },
  {
    key: 'score_only',
    label: 'แสดงคะแนน แต่ไม่แสดงคำตอบ',
    description: 'นักเรียนจะเห็นคะแนนรวมทันทีหลังส่งงาน แต่จะไม่เห็นผลรายข้อหรือคำตอบที่ถูกต้องของแต่ละข้อ',
  },
  {
    key: 'after_due',
    label: 'หลังพ้นกำหนดส่ง',
    description: 'ก่อนพ้นกำหนดส่ง นักเรียนจะเห็นเพียงว่าส่งงานสำเร็จ เมื่อพ้นกำหนดแล้วจึงเห็นคะแนน ผลรายข้อ และคำตอบที่ถูกต้อง โดยต้องกำหนดเวลาปิดรับงาน',
  },
  {
    key: 'never',
    label: 'ไม่แสดงผลลัพธ์',
    description: 'นักเรียนจะเห็นเพียงสถานะว่าส่งงานสำเร็จ โดยไม่เห็นคะแนน ผลรายข้อ หรือคำตอบที่ถูกต้อง',
  },
]

export function ResultVisibilityOptionHoverCard({
  description,
  trigger,
}: {
  description: string
  trigger: ReactElement
}) {
  return (
    <HoverCard>
      <HoverCardTrigger delay={200} render={trigger} />
      <HoverCardContent align="start" side="top" className="w-80 max-w-[calc(100vw-2rem)]">
        {description}
      </HoverCardContent>
    </HoverCard>
  )
}
