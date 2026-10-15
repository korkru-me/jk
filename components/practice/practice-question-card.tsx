'use client'

import Link from 'next/link'
import { Target, Check, Bookmark, BookmarkCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SolutionButton } from '@/components/questions/solution-button'
import { TYPE_LABEL, DIFF_META } from '@/lib/question-display'
import type { PracticeQuestionListItem } from '@/lib/practice-question-access.server'
import { cn } from '@/lib/utils'

export function PracticeQuestionCard({ item, href, selected, onSelect, selectionDisabled, pinned, onTogglePin, pinDisabled }: {
  item: PracticeQuestionListItem
  href: string
  selected: boolean
  onSelect: (checked: boolean) => void
  selectionDisabled: boolean
  pinned: boolean
  onTogglePin: () => void
  pinDisabled: boolean
}) {
  const difficulty = item.difficulty ? DIFF_META[item.difficulty] : undefined
  return (
    <Card edge="ring" radius="md" padding="none" className={cn('@container h-full px-3 py-2 transition-shadow hover:shadow-sm', selected && 'ring-primary/50', pinned && 'ring-destructive/25 shadow-[0_0_0.8rem_color-mix(in_oklab,var(--destructive)_18%,transparent)]')}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 @sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <label className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg focus-within:ring-2 focus-within:ring-ring pointer-coarse:size-11">
          <input type="checkbox" checked={selected} disabled={selectionDisabled}
            onChange={event => onSelect(event.target.checked)}
            aria-label={`เลือก ${item.title}`} className="shrink-0 accent-primary" />
        </label>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs tabular-nums text-muted-foreground">ข้อ {item.position + 1}</span>
              {difficulty && <Badge variant={item.difficulty === 'easy' ? 'statusSuccess' : item.difficulty === 'medium' ? 'statusWarning' : item.difficulty === 'hard' ? 'statusDestructive' : 'secondary'}>{difficulty.label}</Badge>}
              <Badge variant="secondary">{TYPE_LABEL[item.questionType] ?? item.questionType}</Badge>
              {item.subject && <Badge variant="secondary" className="bg-tint-4/10 text-foreground">{item.subject}</Badge>}
              {item.tags.map(tag => <Badge key={tag} variant="outline" className="max-w-full"><span className="truncate">#{tag}</span></Badge>)}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {item.attemptCount > 0 && <Check className="size-3.5" aria-hidden="true" />}
                {item.attemptCount > 0 ? `ตอบแล้ว ${item.attemptCount} ครั้ง` : 'ยังไม่เคยตอบ'}
              </span>
            </div>
            <Button type="button" variant="ghost" disabled={selectionDisabled} aria-pressed={selected} onClick={() => onSelect(!selected)} title={item.title} className="h-auto justify-start whitespace-normal p-0 text-left font-semibold hover:bg-transparent">
              <span className="line-clamp-2 @lg:line-clamp-1">{item.title}</span>
            </Button>
            {item.excerpt && <p className="line-clamp-2 text-xs text-muted-foreground @lg:line-clamp-1">{item.excerpt}</p>}
          </div>
          <div className="col-span-2 flex flex-wrap items-center justify-end gap-1.5 @sm:col-span-1 @sm:flex-col @sm:items-end @2xl:flex-row @2xl:items-center">
            <Button variant={pinned ? 'navigation' : 'outline'} size="icon-sm" className="shrink-0 pointer-coarse:size-11" disabled={pinDisabled}
              title={pinned ? 'เอาปักหมุดออก' : 'ปักไว้ทบทวน'}
              aria-pressed={pinned} aria-label={`${pinned ? 'เอาปักหมุดออกจาก' : 'ปักไว้ทบทวน'} ${item.title}`} onClick={onTogglePin}>
              {pinned ? <BookmarkCheck data-icon="inline-start" aria-hidden="true" /> : <Bookmark data-icon="inline-start" aria-hidden="true" />}
            </Button>
            {item.hasSolution && <SolutionButton questionId={item.id} questionTitle={item.title} hasSolution canAttach={false} confirmDismissal />}
            <Button variant="navigation" size="sm" className="pointer-coarse:min-h-11"
              render={<Link href={href} />}>
              <Target data-icon="inline-start" aria-hidden="true" />ฝึกทำ
            </Button>
          </div>
      </div>
    </Card>
  )
}
