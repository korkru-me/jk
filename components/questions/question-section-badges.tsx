import { Folder } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Every แฟ้มย่อย in the current แฟ้ม that holds one question.
 *
 * A question may belong to several แฟ้มย่อย at once, so this component never
 * collapses the names into a count or a "+N" marker. Long names wrap rather
 * than truncate: this is location information, not decoration.
 */
export function QuestionSectionBadges({
  titles,
  showEmpty = false,
  className,
}: {
  titles: readonly string[]
  showEmpty?: boolean
  className?: string
}) {
  if (titles.length === 0) {
    if (!showEmpty) return null
    return (
      <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
        <Folder className="size-3.5 shrink-0" aria-hidden="true" />
        ยังไม่อยู่ในแฟ้มย่อย
      </p>
    )
  }

  return (
    <div
      role="group"
      className={cn('flex min-w-0 flex-wrap items-center gap-1.5', className)}
      aria-label={`อยู่ในแฟ้มย่อย: ${titles.join(', ')}`}
    >
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <Folder className="size-3.5" aria-hidden="true" />
        แฟ้มย่อย:
      </span>
      {titles.map((title, index) => (
        <Badge
          key={`${index}:${title}`}
          variant="outline"
          className="h-auto max-w-full whitespace-normal break-words text-left"
        >
          {title}
        </Badge>
      ))}
    </div>
  )
}
