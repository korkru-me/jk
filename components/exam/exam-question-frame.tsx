'use client'

import type { ComponentProps, ReactNode } from 'react'
import { Flag } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export const QUESTION_FLAG_DESCRIPTION = 'ปักธงเพื่อระบุข้อที่ต้องการกลับมาทบทวนก่อนส่งคำตอบ'

/** One surface per question; diagrams share a row with answers when useful. */
export function ExamQuestionFrame({
  header, stem, illustration, sideBySide = false, feedback, children, className, ...props
}: ComponentProps<'div'> & {
  header: ReactNode
  stem: ReactNode
  illustration?: ReactNode
  sideBySide?: boolean
  feedback?: ReactNode
}) {
  return (
    <Card
      radius="md"
      padding="sm"
      {...props}
      data-exam-question-card
      className={cn('@container/exam-question flex flex-col gap-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-4', className)}
    >
      <div className="flex flex-wrap items-center gap-1.5" data-exam-question-header>{header}</div>
      <div className="flex min-w-0 flex-col gap-2 empty:hidden" data-exam-question-stem>{stem}</div>
      <div className={cn('grid min-w-0 items-start gap-2.5', sideBySide && '@min-[32rem]/exam-question:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]')}>
        {illustration && <div className="flex min-w-0 flex-wrap items-start gap-2" data-exam-question-illustration>{illustration}</div>}
        <div className="min-w-0" data-exam-question-answer>{children}</div>
      </div>
      {feedback}
    </Card>
  )
}

export function ExamQuestionFlag({ flagged, onToggle }: { flagged: boolean; onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button type="button" variant="outline" size="xs" aria-pressed={flagged} onClick={onToggle} />}
        aria-label={flagged ? 'ยกเลิกธงสำหรับทบทวน' : 'ปักธงสำหรับทบทวน'}
        className={cn('min-h-8 rounded-md pointer-coarse:min-h-11', flagged && 'border-flag/40 bg-flag/10')}
      >
        <Flag data-icon="inline-start" className={cn('text-flag', flagged && 'fill-flag')} />
        {flagged ? 'ยกเลิกธง' : 'ปักธง'}
      </TooltipTrigger>
      <TooltipContent>{QUESTION_FLAG_DESCRIPTION}</TooltipContent>
    </Tooltip>
  )
}
