'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SEVERITY_DOT, type Severity } from '@/lib/calendar-display'
import { STUDENT_WORK_STATUS_DESCRIPTION, STUDENT_WORK_STATUS_LABEL } from '@/lib/student-work-status'
import { cn } from '@/lib/utils'

export function WorkStatusLegend({ compact = false }: { compact?: boolean }) {
  return <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground', compact && 'ml-auto')} role="group" aria-label="ความหมายของสีสถานะงาน" data-work-status-legend>
    {(['overdue', 'soon', 'later', 'done'] as Severity[]).map(severity => <Tooltip key={severity}>
      <TooltipTrigger render={<button type="button" />} aria-label={STUDENT_WORK_STATUS_DESCRIPTION[severity]}
        className="inline-flex min-h-5 items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11" data-status-legend={severity}>
        <span className={cn('size-1.5 rounded-full', SEVERITY_DOT[severity])} aria-hidden="true" />
        <span>{compact ? severity === 'overdue' ? 'เลยกำหนด' : severity === 'soon' ? 'ใกล้ส่ง' : severity === 'later' ? 'รอทำ' : 'ส่งแล้ว' : STUDENT_WORK_STATUS_LABEL[severity]}</span>
      </TooltipTrigger>
      <TooltipContent role="tooltip">{STUDENT_WORK_STATUS_DESCRIPTION[severity]}</TooltipContent>
    </Tooltip>)}
  </div>
}
