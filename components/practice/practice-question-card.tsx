'use client'

import Link from 'next/link'
import { Eye, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SolutionButton } from '@/components/questions/solution-button'
import { TYPE_LABEL, DIFF_META } from '@/lib/question-display'
import type { PracticeQuestionListItem } from '@/lib/practice-question-access.server'
import { cn } from '@/lib/utils'

export function PracticeQuestionCard({ item, href, selected, onSelect, selectionDisabled }: {
  item: PracticeQuestionListItem
  href: string
  selected: boolean
  onSelect: (checked: boolean) => void
  selectionDisabled: boolean
}) {
  const difficulty = item.difficulty ? DIFF_META[item.difficulty] : undefined
  return (
    <Card edge="ring" padding="md" className={cn('@container transition-shadow hover:shadow-sm', selected && 'ring-primary/50')}>
      <div className="flex items-start gap-2 sm:gap-3">
        <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg focus-within:ring-2 focus-within:ring-ring">
          <input type="checkbox" checked={selected} disabled={selectionDisabled}
            onChange={event => onSelect(event.target.checked)}
            aria-label={`เลือก ${item.title}`} className="size-5 accent-primary" />
        </label>
        <div className="flex min-w-0 flex-1 flex-col gap-3 @lg:flex-row @lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs tabular-nums text-muted-foreground">ข้อ {item.position + 1}</span>
              {difficulty && <Badge variant={item.difficulty === 'easy' ? 'statusSuccess' : item.difficulty === 'medium' ? 'statusWarning' : item.difficulty === 'hard' ? 'statusDestructive' : 'secondary'}>{difficulty.label}</Badge>}
              <Badge variant="secondary">{TYPE_LABEL[item.questionType] ?? item.questionType}</Badge>
              {item.subject && <Badge variant="secondary" className="bg-tint-4/10 text-foreground">{item.subject}</Badge>}
              {item.tags.map(tag => <Badge key={tag} variant="outline" className="max-w-full"><span className="truncate">#{tag}</span></Badge>)}
            </div>
            <Link href={href} className="line-clamp-2 text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {item.title}
            </Link>
            {item.excerpt && <p className="line-clamp-2 text-xs text-muted-foreground">{item.excerpt}</p>}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {item.attemptCount > 0 && <Check className="size-3.5" aria-hidden="true" />}
              {item.attemptCount > 0 ? `ตอบแล้ว ${item.attemptCount} ครั้ง` : 'ยังไม่เคยตอบ'}
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 @lg:justify-end">
            {item.hasSolution && <SolutionButton questionId={item.id} questionTitle={item.title} hasSolution canAttach={false} confirmDismissal />}
            <Button variant="secondary" className="min-h-11 bg-primary/10 text-primary hover:bg-primary/20"
              render={<Link href={href} />}>
              <Eye data-icon="inline-start" aria-hidden="true" />ดูตัวอย่าง
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
