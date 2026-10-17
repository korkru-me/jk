import type { ReactNode } from 'react'
import { CheckCircle2, Clock, EyeOff, Trophy, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function SubmissionScoreSummary({ visible, score, maxScore, percentage, passed, threshold, counts, submittedAt, strategy, children }: {
  visible: boolean
  score: number | null
  maxScore: number
  percentage: number
  passed: boolean | null
  threshold: string | null
  counts: { correct: number; wrong: number; pending: number } | null
  submittedAt: string | null
  strategy: string | null
  children?: ReactNode
}) {
  const tone = percentage >= 75 ? 'text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))] bg-success/10' : percentage >= 50 ? 'text-[color-mix(in_oklab,var(--warning)_60%,var(--foreground))] bg-warning/10' : 'text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))] bg-destructive/10'
  return (
    <Card padding="md" className="@container/result-summary overflow-hidden" data-submission-summary>
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn('flex size-16 shrink-0 items-center justify-center rounded-xl text-xl font-bold tabular-nums', visible ? tone : 'bg-primary/10 text-primary')}>
          {visible ? score === null ? 'รอผล' : `${percentage}%` : <EyeOff className="size-6" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xs font-medium text-muted-foreground">{visible ? 'คะแนนที่ได้' : 'ส่งคำตอบเรียบร้อยแล้ว'}</h1>
            {visible && <p className="text-2xl font-bold tabular-nums">{score === null ? 'รอผลคะแนน' : `${score}/${maxScore}`}</p>}
            {visible && passed !== null && <Badge variant="outline" className={passed ? 'border-success/25 text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]' : 'border-destructive/25 text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))]'}>{passed ? 'ผ่านเกณฑ์' : 'ยังไม่ผ่านเกณฑ์'}</Badge>}
            {visible && percentage >= 90 && <Trophy className="size-4 text-[color-mix(in_oklab,var(--warning)_60%,var(--foreground))]" aria-label="ยอดเยี่ยม" />}
          </div>
          {visible ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {counts && <>
                <span className="flex items-center gap-1 text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]"><CheckCircle2 className="size-3.5" aria-hidden="true" />ถูก {counts.correct} ข้อ</span>
                <span className="flex items-center gap-1 text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))]"><XCircle className="size-3.5" aria-hidden="true" />ผิด {counts.wrong} ข้อ</span>
                {counts.pending > 0 && <span className="flex items-center gap-1 text-[color-mix(in_oklab,var(--warning)_60%,var(--foreground))]"><Clock className="size-3.5" aria-hidden="true" />รอครูตรวจ {counts.pending} ข้อ</span>}
              </>}
              {threshold && <span className="text-muted-foreground">เกณฑ์ผ่าน {threshold}</span>}
            </div>
          ) : <p className="text-xs text-muted-foreground">ครูกำหนดไม่แสดงคะแนนและคำตอบรายข้อสำหรับงานนี้</p>}
        </div>
        {submittedAt && <p className="flex basis-full items-center gap-1 text-[11px] text-muted-foreground @[32rem]/result-summary:basis-auto"><Clock className="size-3" aria-hidden="true" />ส่งเมื่อ {submittedAt}</p>}
      </div>
      {visible && strategy && <p className="mt-2 text-[11px] text-muted-foreground">{strategy}</p>}
      {children && <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 [&>.solution-lock-notice]:basis-full">{children}</div>}
    </Card>
  )
}
