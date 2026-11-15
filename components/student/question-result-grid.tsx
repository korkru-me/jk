'use client'

import { useId, useState, type ReactNode } from 'react'
import { Check, Clock, Minus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const outcomes = {
  correct: {
    label: 'ถูก',
    icon: Check,
    tone: 'border-success/35 bg-success/10 text-[color:color-mix(in_oklab,var(--success)_65%,var(--foreground))] hover:bg-success/20',
  },
  wrong: {
    label: 'ผิด',
    icon: X,
    tone: 'border-destructive/35 bg-destructive/10 text-[color:color-mix(in_oklab,var(--destructive)_65%,var(--foreground))] hover:bg-destructive/20',
  },
  pending: {
    label: 'รอครูตรวจ',
    icon: Clock,
    tone: 'border-warning/35 bg-warning/10 text-[color:color-mix(in_oklab,var(--warning)_55%,var(--foreground))] hover:bg-warning/20',
  },
  voided: {
    label: 'ไม่นับคะแนน',
    icon: Minus,
    tone: 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
  },
}

export interface QuestionResultItem {
  id: string
  outcome: keyof typeof outcomes
  detail: ReactNode
}

export function QuestionResultGrid({ items }: { items: QuestionResultItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const headingId = useId()
  const panelId = useId()
  const openIndex = items.findIndex(item => item.id === openId)

  if (items.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-2" data-question-result-grid>
      <h2 id={headingId} className="text-sm font-semibold">ตรวจเฉลยทีละข้อ</h2>
      <ul role="list" className="flex flex-wrap gap-1.5">
        {items.map(({ id, outcome }, index) => {
          const { icon: Icon, label, tone } = outcomes[outcome]
          const isOpen = index === openIndex
          return (
            <li key={id}>
              <Button
                id={`${panelId}-question-${index}`}
                type="button"
                aria-label={`ข้อ ${index + 1} · ${label}`}
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                onClick={() => setOpenId(isOpen ? null : id)}
                className={cn(
                  'h-11 min-w-12 gap-1 rounded-xl px-2 font-semibold tabular-nums',
                  tone,
                  isOpen && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                )}
              >
                {index + 1}<Icon className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
              </Button>
            </li>
          )
        })}
      </ul>
      {openIndex >= 0 && (
        <div id={panelId} role="region" aria-labelledby={`${panelId}-question-${openIndex}`} className="min-w-0">
          {items[openIndex].detail}
        </div>
      )}
    </section>
  )
}
