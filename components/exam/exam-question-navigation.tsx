'use client'

import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { QUESTION_FLAG_DESCRIPTION } from './exam-question-frame'

export interface ExamNavigationItem {
  current: boolean
  answered: boolean
  flagged: boolean
  verdict?: 'correct' | 'wrong' | 'partial' | 'pending'
}

const currentEdge = 'ring-2 ring-primary ring-offset-2 ring-offset-card shadow-[0_0_0.65rem_color-mix(in_oklab,var(--primary)_35%,transparent)]'

function answerTone(item: ExamNavigationItem) {
  if (item.verdict === 'correct') return 'border-success bg-success text-success-foreground hover:bg-success/90'
  if (item.verdict === 'wrong') return 'border-destructive/40 bg-destructive/15 text-foreground hover:bg-destructive/25'
  if (item.verdict === 'partial' || item.verdict === 'pending') return 'border-warning/40 bg-warning/20 text-foreground hover:bg-warning/30'
  return item.answered
    ? 'border-success/40 bg-success/15 text-foreground hover:bg-success/25'
    : 'border-warning/30 bg-warning/10 text-foreground hover:bg-warning/20'
}

export function ExamQuestionNavigation({ items, touchFriendly = false, onNavigate }: {
  items: ExamNavigationItem[]
  touchFriendly?: boolean
  onNavigate: (index: number) => void
}) {
  return (
    <div className="grid grid-cols-5 gap-2 p-0.5 pointer-coarse:grid-cols-4">
      {items.map((item, index) => (
        <Button
          key={index}
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onNavigate(index)}
          aria-label={`ไปข้อ ${index + 1}${item.current ? ' · ข้อปัจจุบัน' : ''}${item.answered ? ' · ตอบแล้ว' : ' · ยังไม่ตอบ'}${item.verdict ? ` · ${item.verdict === 'correct' ? 'ตรวจแล้วถูก' : item.verdict === 'wrong' ? 'ตรวจแล้วยังไม่ถูก' : item.verdict === 'partial' ? 'ถูกบางส่วน' : 'รอตรวจ'}` : ''}${item.flagged ? ' · ปักธงสำหรับทบทวน' : ''}`}
          aria-current={item.current ? 'page' : undefined}
          data-exam-navigation-item
          data-answer-state={item.verdict ?? (item.answered ? 'answered' : 'unanswered')}
          className={cn(
            'relative aspect-square h-auto w-full rounded-[6px] border font-semibold tabular-nums transition-colors motion-reduce:transition-none',
            touchFriendly ? 'min-h-11 text-sm' : 'text-xs pointer-coarse:min-h-11',
            answerTone(item),
            item.current && currentEdge,
          )}
        >
          {index + 1}
          {item.flagged && <Flag className="absolute right-0.5 top-0.5 size-2.5 fill-flag text-flag" aria-hidden="true" />}
        </Button>
      ))}
    </div>
  )
}

export function ExamQuestionNavigationLegend({ instantCheck, flagDescription = QUESTION_FLAG_DESCRIPTION }: { instantCheck: boolean; flagDescription?: string }) {
  const items = [
    { cls: 'border border-primary bg-card ring-2 ring-primary/30', label: 'ข้อที่กำลังแสดง' },
    { cls: 'border border-success/40 bg-success/15', label: 'ตอบแล้ว' },
    { cls: 'border border-warning/30 bg-warning/10', label: 'ยังไม่ตอบ' },
    ...(instantCheck ? [
      { cls: 'bg-success', label: 'ตรวจแล้ว ถูก' },
      { cls: 'border border-destructive/40 bg-destructive/15', label: 'ตรวจแล้ว ยังไม่ถูก' },
      { cls: 'border border-warning/40 bg-warning/20', label: 'ถูกบางส่วน / รอตรวจ' },
    ] : []),
  ]
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        {items.map(item => (
          <div key={item.label} className="flex min-w-0 items-center gap-1.5">
            <span className={cn('size-3 shrink-0 rounded-[3px]', item.cls)} aria-hidden="true" />
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
        <Flag className="mt-0.5 size-3 shrink-0 text-flag" aria-hidden="true" />{flagDescription}
      </p>
    </div>
  )
}
