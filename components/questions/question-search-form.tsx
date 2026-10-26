'use client'

import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Keep typing local; only a form submission commits the search. */
export function QuestionSearchForm({ value, onValueChange, onSearch, label = 'ค้นหาโจทย์', className }: {
  value: string
  onValueChange: (value: string) => void
  onSearch: (value: string) => void
  label?: string
  className?: string
}) {
  return <form role="search" aria-label={label} className={cn('flex min-w-0 flex-1 items-center gap-2', className)}
    onSubmit={event => { event.preventDefault(); onSearch(value.trim()) }}>
    <div className="relative min-w-0 flex-1">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input value={value} onChange={event => onValueChange(event.target.value)} enterKeyHint="search"
        placeholder="ค้นหาจากชื่อ เนื้อหา หรือแท็ก..." aria-label={label} className="bg-card pl-9 pr-9" />
      {value && <IconButton type="button" label={`ล้างคำ${label}`} size="2xs" onClick={() => onValueChange('')}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X /></IconButton>}
    </div>
    <Button type="submit" size="sm" className="shrink-0 pointer-coarse:min-h-11" aria-label={label}>
      <Search data-icon="inline-start" aria-hidden="true" />ค้นหา
    </Button>
  </form>
}
