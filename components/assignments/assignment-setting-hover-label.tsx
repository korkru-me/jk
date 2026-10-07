'use client'

import { CircleHelp } from 'lucide-react'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

export function AssignmentSettingHoverLabel({
  label,
  description,
}: {
  label: string
  description: string
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={200}
        render={(
          <span
            tabIndex={0}
            className="inline-flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
      >
        {label}
        <CircleHelp aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </HoverCardTrigger>
      <HoverCardContent align="start" side="top" className="w-80 max-w-[calc(100vw-2rem)]">
        {description}
      </HoverCardContent>
    </HoverCard>
  )
}
