'use client'

import { useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function HelpBubble({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <Button type="button" size="icon-sm" variant="outline" aria-label={title} aria-expanded={open} onClick={() => setOpen(current => !current)}>
        <CircleHelp aria-hidden="true" />
      </Button>
      {open && (
        <Card padding="md" elevation="lg" className="absolute right-0 top-9 z-30 w-72">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
        </Card>
      )}
    </div>
  )
}
