'use client'

import Link from 'next/link'
import { CheckCircle2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { practiceRunSummary, type PracticeRunState } from '@/lib/practice-run-summary'

export function PracticeExerciseSummary({ title, ids, questionTitles, states, returnHref, onReview }: {
  title: string
  ids: string[]
  questionTitles: Record<string, string>
  states: Record<string, PracticeRunState>
  returnHref: string
  onReview: (index: number) => void
}) {
  const summary = practiceRunSummary(ids, states)
  return <section className="flex min-w-0 flex-col gap-3" aria-labelledby="practice-summary-heading" data-practice-summary>
    <Card padding="sm" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
        <h1 id="practice-summary-heading" className="text-base font-semibold">สรุปผลการฝึก</h1>
        <p className="min-w-0 break-words text-sm text-muted-foreground">{title}</p>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm">ทำถูก <strong className="text-2xl font-bold tabular-nums text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]">{summary.correct}/{summary.total}</strong> ข้อ</p>
        <p className="text-xs text-muted-foreground">ตอบแล้ว {summary.answered}/{summary.total} ข้อ</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="statusSuccess">ถูก {summary.correct}</Badge>
        <Badge variant="statusDestructive">ยังไม่ถูก {summary.wrong}</Badge>
        {summary.partial > 0 && <Badge variant="statusWarning">ถูกบางส่วน {summary.partial}</Badge>}
        {summary.pending > 0 && <Badge variant="statusWarning">รอตรวจ {summary.pending}</Badge>}
        <Badge variant="outline">ยังไม่ตอบ {summary.unanswered}</Badge>
      </div>
      <div className="flex flex-wrap gap-2 border-t pt-2">
        <Button size="sm" onClick={() => onReview(0)} className="pointer-coarse:min-h-11"><RotateCcw aria-hidden="true" />ทบทวนคำตอบ</Button>
        <Button variant="outline" size="sm" render={<Link href={returnHref} />} className="pointer-coarse:min-h-11" aria-label="กลับไปคลังฝึก">กลับคลังฝึก</Button>
      </div>
    </Card>
    <Card padding="sm" className="flex min-w-0 flex-col gap-2">
      <h2 className="text-sm font-semibold">ผลรายข้อ</h2>
      <ol className="max-h-[55dvh] overflow-y-auto overscroll-contain divide-y divide-border" aria-label="ผลการฝึกรายข้อ">
        {ids.map((id, index) => {
          const state = states[id]
          const verdict = state?.answered ? state.verdict : undefined
          const label = !state?.answered ? 'ยังไม่ตอบ' : verdict === 'correct' ? 'ถูก' : verdict === 'wrong' ? 'ยังไม่ถูก' : verdict === 'partial' ? 'ถูกบางส่วน' : verdict === 'pending' ? 'รอตรวจ' : 'ยังไม่ตรวจ'
          return <li key={id}>
            <Button variant="ghost" className="h-auto min-h-11 w-full justify-start gap-2 whitespace-normal px-1 py-2 text-left" onClick={() => onReview(index)} aria-label={`ทบทวนข้อ ${index + 1} · ${label}`}>
              <span className="shrink-0 text-xs tabular-nums text-foreground/75">ข้อ {index + 1}</span>
              <span className="min-w-0 flex-1 line-clamp-2 break-words text-sm">{questionTitles[id] ?? `ข้อ ${index + 1}`}</span>
              <Badge variant={verdict === 'correct' ? 'statusSuccess' : verdict === 'wrong' ? 'statusDestructive' : verdict ? 'statusWarning' : 'outline'}>{label}</Badge>
            </Button>
          </li>
        })}
      </ol>
    </Card>
  </section>
}
