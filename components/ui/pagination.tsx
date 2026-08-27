'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

/**
 * Page controls for a server-paged list.
 *
 * Shows the first and last page plus a window around the current one, so a
 * bank of any size keeps the same handful of buttons. `isPending` comes from
 * the transition that rewrites the URL, since navigation is what fetches the
 * next page.
 */
export function Pagination({ page, totalPages, isPending, onGo, label, className }: {
  page: number
  totalPages: number
  isPending: boolean
  onGo: (page: number) => void
  /** Distinguishes the copy above the list from the one below it for screen readers. */
  label: string
  className?: string
}) {
  // Two pages either side, not one: from page 3 the reader could see 4 but not
  // 5, so reaching 5 meant a stop at 4 first.
  const nearby = new Set([1, totalPages, page - 2, page - 1, page, page + 1, page + 2])
  const pages = [...nearby].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const allPages = Array.from({ length: totalPages }, (_, i) => i + 1)

  return (
    <nav className={cn('flex flex-wrap items-center justify-center gap-1 pt-2', className)} aria-label={label}>
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1 || isPending}
        onClick={() => onGo(page - 1)}
      >
        ← ก่อนหน้า
      </Button>

      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && pages[i - 1] !== p - 1 && (
            <span className="px-1 text-sm text-muted-foreground">…</span>
          )}
          <Button
            variant={p === page ? 'default' : 'ghost'}
            size="sm"
            disabled={isPending}
            onClick={() => onGo(p)}
            aria-current={p === page ? 'page' : undefined}
            className="min-w-9"
          >
            {p}
          </Button>
        </span>
      ))}

      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages || isPending}
        onClick={() => onGo(page + 1)}
      >
        ถัดไป →
      </Button>

      {/* Any page in one pick. The numbered buttons only ever reach as far as
          the neighbours, so a jump to a far page had to be walked to. */}
      {totalPages > 3 && (
        <span className="ml-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          ไปหน้า
          <Select
            value={String(page)}
            onValueChange={v => v !== null && Number(v) !== page && onGo(Number(v))}
          >
            <SelectTrigger size="sm" disabled={isPending} aria-label={`ไปยังหน้าที่ต้องการ — ${label}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allPages.map(p => (
                <SelectItem key={p} value={String(p)}>หน้า {p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          จาก {totalPages}
        </span>
      )}
    </nav>
  )
}
