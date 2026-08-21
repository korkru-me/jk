'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays, CheckCircle2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MONTH_LABELS, SEVERITY_BADGE, SEVERITY_DOT, SEVERITY_ORDER, WEEKDAY_LABELS,
  type Severity,
} from '@/lib/calendar-display'
import { buttonVariants } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Card } from '@/components/ui/card'

export interface CalendarEvent {
  id: string
  title: string
  classroomName: string
  endAt: string
  done: boolean
  submissionId: string | null
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const SEVERITY_LABEL: Record<Severity, string> = {
  overdue: 'เลยกำหนดส่งแล้ว',
  soon: 'ใกล้ครบกำหนด',
  later: 'ยังไม่ถึงกำหนด',
  done: 'ส่งแล้ว',
}

function severityOf(e: CalendarEvent, now: number): Severity {
  if (e.done) return 'done'
  const diff = new Date(e.endAt).getTime() - now
  if (diff < 0) return 'overdue'
  if (diff < 2 * 86400000) return 'soon'
  return 'later'
}

export function AssignmentCalendar({ events }: { events: CalendarEvent[] }) {
  const today = useMemo(() => new Date(), [])
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(today)

  const now = Date.now()
  const eventsByDay = useMemo(() => {
    const map = new Map<string, { event: CalendarEvent; severity: Severity }[]>()
    for (const e of events) {
      const d = new Date(e.endAt)
      const key = dateKey(d)
      const entry = { event: e, severity: severityOf(e, now) }
      map.set(key, [...(map.get(key) ?? []), entry])
    }
    for (const list of map.values()) list.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    return map
  }, [events, now])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedEvents = eventsByDay.get(dateKey(selected)) ?? []

  return (
    <Card padding="lg" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <CalendarDays size={16} className="text-primary" />
          ปฏิทินกำหนดส่งงาน
        </h2>
        <div className="flex items-center gap-1">
          <IconButton
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            label="เดือนก่อนหน้า"
            size="sm"
          >
            <ChevronLeft />
          </IconButton>
          <span className="text-sm font-medium w-32 text-center">{MONTH_LABELS[month]} {year + 543}</span>
          <IconButton
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            label="เดือนถัดไป"
            size="sm"
          >
            <ChevronRight />
          </IconButton>
          <button
            onClick={() => { setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today) }}
            className="ml-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/70 text-muted-foreground transition-colors"
          >
            วันนี้
          </button>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map(w => <span key={w}>{w}</span>)}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const dayEvents = eventsByDay.get(dateKey(d)) ?? []
          const isToday = isSameDay(d, today)
          const isSelected = isSameDay(d, selected)
          const dots = dayEvents.slice(0, 3)

          return (
            <button
              key={i}
              onClick={() => setSelected(d)}
              className={cn(
                'aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-medium transition-all relative',
                isSelected ? 'bg-primary text-white' : isToday ? 'bg-primary/10 text-primary ring-1 ring-primary/40 dark:ring-primary/40' : 'hover:bg-muted text-foreground'
              )}
            >
              <span>{d.getDate()}</span>
              {dayEvents.length > 0 && (
                <span className="flex items-center gap-0.5">
                  {dots.map((entry, di) => (
                    <span
                      key={di}
                      className={cn('w-1.5 h-1.5 rounded-full', isSelected ? 'bg-card/80' : SEVERITY_DOT[entry.severity])}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className={cn('text-[9px] leading-none', isSelected ? 'text-white/80' : 'text-muted-foreground')}>+{dayEvents.length - 3}</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground border-t pt-3">
        {(['overdue', 'soon', 'later', 'done'] as Severity[]).map(s => (
          <span key={s} className="flex items-center gap-1">
            <span className={cn('w-1.5 h-1.5 rounded-full', SEVERITY_DOT[s])} />
            {SEVERITY_LABEL[s]}
          </span>
        ))}
      </div>

      {/* Selected day detail */}
      <div className="border-t pt-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {selected.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        {selectedEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">ไม่มีงานกำหนดส่งวันนี้</p>
        ) : (
          <div className="space-y-2">
            {selectedEvents.map(({ event, severity }) => (
              <div key={event.id} className="flex items-center gap-3 p-2.5 rounded-xl border">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{event.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{event.classroomName}</p>
                </div>
                <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0', SEVERITY_BADGE[severity])}>
                  {SEVERITY_LABEL[severity]}
                </span>
                {event.done ? (
                  event.submissionId ? (
                    <Link
                      href={`/submissions/${event.submissionId}`}
                      className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'text-xs gap-1 shrink-0')}
                    >
                      <CheckCircle2 size={12} /> ดูผล
                    </Link>
                  ) : null
                ) : (
                  <Link
                    href={`/assignments/${event.id}/take`}
                    className={cn(buttonVariants({ size: 'sm' }), 'text-xs gap-1 shrink-0')}
                  >
                    ทำเลย <ArrowRight size={12} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
