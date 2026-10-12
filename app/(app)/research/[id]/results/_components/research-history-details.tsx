'use client'

import { useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { formatResearchScore, researchScoreSourceLabel } from '@/lib/education-research-scores'
import type { EducationResearchScoreHistoryAction, EducationResearchSourceType } from '@/lib/types'
import { useDismissOnOutsideClick } from '@/hooks/use-dismiss-on-outside-click'

export interface ResearchDataHistoryItem {
  id: number
  measurementLabel: 'ก่อนเรียน' | 'หลังเรียน'
  action: EducationResearchScoreHistoryAction
  oldScore: number | null
  newScore: number | null
  oldSource: EducationResearchSourceType | null
  newSource: EducationResearchSourceType | null
  reason: string | null
  actorName: string | null
  changedAt: string
}

export function ResearchHistoryDetails({ items }: { items: ResearchDataHistoryItem[] }) {
  const [open, setOpen] = useState(false)
  const detailsRef = useRef<HTMLDetailsElement>(null)
  useDismissOnOutsideClick(open, detailsRef, () => setOpen(false))

  return (
    <details
      ref={detailsRef}
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
      className="relative mt-2"
    >
      <summary className="cursor-pointer text-xs font-medium text-primary hover:underline">ดูประวัติ ({items.length})</summary>
      <Card padding="sm" elevation="lg" className="absolute right-0 z-20 mt-1 w-80 max-w-[80vw] space-y-2">
        {items.length === 0
          ? <p className="text-xs text-muted-foreground">ยังไม่มีประวัติการเปลี่ยนแปลง</p>
          : items.slice(0, 20).map(item => (
            <div key={item.id} className="border-b border-border pb-2 text-xs last:border-0 last:pb-0">
              <p className="font-medium text-foreground">{item.measurementLabel} · {historyActionLabel(item.action, item.oldScore, item.newScore)}</p>
              <p className="mt-0.5 text-muted-foreground">{sourceLabel(item.oldSource)} → {sourceLabel(item.newSource)}</p>
              <p className="mt-0.5 text-muted-foreground">{item.actorName ?? 'ระบบ'} · {formatThaiDate(item.changedAt)}</p>
              {item.reason && <p className="mt-0.5 text-muted-foreground">เหตุผล: {item.reason}</p>}
            </div>
          ))}
      </Card>
    </details>
  )
}

function historyActionLabel(action: EducationResearchScoreHistoryAction, oldScore: number | null, newScore: number | null): string {
  if (action === 'insert') return `เพิ่มคะแนน ${formatResearchScore(newScore)}`
  if (action === 'delete') return `ลบคะแนน ${formatResearchScore(oldScore)}`
  return `${formatResearchScore(oldScore)} → ${formatResearchScore(newScore)}`
}

function sourceLabel(source: EducationResearchSourceType | null): string {
  return source ? researchScoreSourceLabel(source) : 'ไม่มีข้อมูล'
}

function formatThaiDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}
