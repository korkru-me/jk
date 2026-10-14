'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MONTH_LABELS, SEVERITY_DOT, SEVERITY_ORDER, WEEKDAY_LABELS, type Severity } from '@/lib/calendar-display'
import { formatThaiDate, formatThaiDateTime, thaiDateStamp } from '@/lib/thai-time'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export interface CalendarEvent {
  id: string
  title: string
  classroomName: string
  endAt: string
  done: boolean
  submissionId: string | null
}

type DayEvent = { event: CalendarEvent; severity: Severity }
const SEVERITY_LABEL: Record<Severity, string> = {
  overdue: 'เลยกำหนดส่งแล้ว', soon: 'ใกล้ครบกำหนด', later: 'ยังไม่ถึงกำหนด', done: 'ส่งแล้ว',
}
const STATUS_VARIANT = {
  overdue: 'statusDestructive', soon: 'statusWarning', later: 'secondary', done: 'statusSuccess',
} as const

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function severityOf(event: CalendarEvent, now: number): Severity {
  if (event.done) return 'done'
  const diff = new Date(event.endAt).getTime() - now
  return diff < 0 ? 'overdue' : diff < 2 * 86400000 ? 'soon' : 'later'
}
function EventDetails({ entries }: { entries: DayEvent[] }) {
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">ไม่มีงานกำหนดส่งวันนี้</p>
  return (
    <ul className="flex flex-col gap-3">
      {entries.map(({ event, severity }) => (
        <li key={event.id} className="flex min-w-0 gap-2">
          <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', SEVERITY_DOT[severity])} aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="break-words text-xs font-semibold">{event.classroomName || 'ห้องเรียน'}</p>
            <p className="break-words text-sm">{event.title}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">ส่ง {formatThaiDateTime(event.endAt, { hour: '2-digit', minute: '2-digit' })} น.</span>
              <Badge variant={STATUS_VARIANT[severity]}>{SEVERITY_LABEL[severity]}</Badge>
              {(!event.done || event.submissionId) && (
                <Link href={event.done ? `/submissions/${event.submissionId}` : `/assignments/${event.id}/take`} className={buttonVariants({ size: 'xs', variant: 'outline' })}>
                  {event.done ? 'ดูผล' : 'ทำงาน'}
                </Link>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function AssignmentCalendar({ events, initialNow }: { events: CalendarEvent[]; initialNow?: string }) {
  const today = useMemo(() => new Date(`${thaiDateStamp(initialNow ?? Date.now())}T12:00:00`), [initialNow])
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [expanded, setExpanded] = useState(false)
  const [previewDay, setPreviewDay] = useState<string | null>(null)
  const now = initialNow ? new Date(initialNow).getTime() : Date.now()
  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>()
    for (const event of events) {
      if (!Number.isFinite(new Date(event.endAt).getTime())) continue
      const key = thaiDateStamp(event.endAt)
      const list = map.get(key) ?? []
      list.push({ event, severity: severityOf(event, now) })
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => (
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      || new Date(a.event.endAt).getTime() - new Date(b.event.endAt).getTime()
    ))
    return map
  }, [events, now])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
  const cells: (Date | null)[] = [...Array.from({ length: firstWeekday }, () => null), ...days]
  while (cells.length % 7 !== 0) cells.push(null)
  const monthHasEvents = days.some(day => eventsByDay.has(dateKey(day)))

  function changeMonth(offset: number) {
    setPreviewDay(null)
    setViewDate(new Date(year, month + offset, 1))
  }
  function monthNavigation(detailed = false) {
    return (
      <div className="flex items-center justify-between gap-1">
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => changeMonth(-1)} aria-label="เดือนก่อนหน้า"><ChevronLeft /></Button>
        <p className={cn('min-w-0 flex-1 text-center font-semibold', detailed ? 'text-sm' : 'text-xs')} aria-live="polite">{MONTH_LABELS[month]} {year + 543}</p>
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => changeMonth(1)} aria-label="เดือนถัดไป"><ChevronRight /></Button>
        <Button type="button" variant="ghost" size="xs" onClick={() => {
          setPreviewDay(null)
          setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))
        }}>วันนี้</Button>
      </div>
    )
  }
  function compactGrid(scope: string) {
    return (
      <div className="grid grid-cols-7 gap-0.5 text-center" role="group" aria-label="วันที่และกำหนดส่งในเดือน">
        {WEEKDAY_LABELS.map(label => <span key={label} className="py-1 text-[10px] font-medium text-muted-foreground">{label}</span>)}
        {cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} aria-hidden="true" />
          const key = dateKey(day)
          const previewKey = `${scope}-${key}`
          const entries = eventsByDay.get(key) ?? []
          const severities = [...new Set(entries.map(entry => entry.severity))]
          const isToday = key === dateKey(today)
          const label = formatThaiDate(`${key}T12:00:00+07:00`, { day: 'numeric', month: 'long', year: 'numeric' })
          const dayLabel = `${label} · ${entries.length > 0 ? `${entries.length} งานกำหนดส่ง` : 'ไม่มีงานกำหนดส่ง'}`
          const dayClassName = cn('flex h-[1.5rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring', isToday && 'bg-primary/10 font-bold ring-1 ring-primary/30')
          const dayContent = <>
            <span>{day.getDate()}</span>
            <span className="flex h-1 items-center gap-0.5" aria-hidden="true">
              {severities.map(severity => <span key={severity} className={cn('size-1 rounded-full', SEVERITY_DOT[severity])} />)}
            </span>
          </>
          if (scope === 'expanded') return (
            <button key={key} type="button" className={dayClassName} aria-label={dayLabel} aria-current={isToday ? 'date' : undefined} onClick={() => {
              document.getElementById(`calendar-agenda-${key}`)?.scrollIntoView({ block: 'start' })
            }}>{dayContent}</button>
          )
          return (
            <HoverCard key={key} open={previewDay === previewKey} onOpenChange={open => setPreviewDay(current => open ? previewKey : current === previewKey ? null : current)}>
              <HoverCardTrigger
                delay={160} closeDelay={100}
                onFocus={() => setPreviewDay(previewKey)}
                onClick={() => setPreviewDay(previewKey)}
                render={<button type="button" />}
                aria-label={dayLabel}
                aria-expanded={previewDay === previewKey}
                aria-current={isToday ? 'date' : undefined}
                className={dayClassName}
              >
                {dayContent}
              </HoverCardTrigger>
              <HoverCardContent className="w-80 max-w-[calc(100vw-2rem)]" side="left" sideOffset={8} align="center">
                <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
                  <p className="text-xs font-semibold">{label}</p>
                  <EventDetails entries={entries} />
                </div>
              </HoverCardContent>
            </HoverCard>
          )
        })}
      </div>
    )
  }

  return (
    <Dialog open={expanded} onOpenChange={open => { setExpanded(open); setPreviewDay(null) }}>
      <Card padding="sm" className="flex w-full max-w-[14rem] flex-col gap-1" data-assignment-calendar>
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold"><CalendarDays className="size-3.5 text-primary" aria-hidden="true" /> ปฏิทินส่งงาน</h2>
          <DialogTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="ขยายปฏิทินทั้งเดือน" />}><Maximize2 /></DialogTrigger>
        </div>
        {monthNavigation()}
        {compactGrid('mini')}
      </Card>
      {/* This read-only expansion has no draft or edits to discard. */}
      <DialogContent className="flex flex-col gap-3 overflow-hidden sm:max-w-5xl" data-expanded-calendar>
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>ปฏิทินกำหนดส่งงาน</DialogTitle>
          <DialogDescription>งานของแต่ละห้องวิชาและเวลาที่ต้องส่งในเดือนนี้</DialogDescription>
        </DialogHeader>
        <div className="shrink-0">{monthNavigation(true)}</div>
        <div className="min-h-0 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} role="region" aria-label="รายละเอียดงานในปฏิทิน">
          <div className="hidden sm:grid sm:grid-cols-7" role="group" aria-label="ปฏิทินทั้งเดือนพร้อมรายละเอียดงาน">
            {WEEKDAY_LABELS.map(label => <p key={label} className="pb-2 text-center text-xs font-medium text-muted-foreground">{label}</p>)}
            {cells.map((day, index) => {
              if (!day) return <div key={`blank-${index}`} className="min-h-16 border-b border-border bg-muted/20" aria-hidden="true" />
              const key = dateKey(day)
              const entries = eventsByDay.get(key) ?? []
              return (
                <div key={key} className={cn('flex min-h-16 min-w-0 flex-col gap-2 border-b border-border px-2 py-2', key === dateKey(today) && 'bg-primary/5')}>
                  <p className="text-xs font-semibold">{day.getDate()}{key === dateKey(today) && <span className="ml-1 text-[10px] text-foreground/75">วันนี้</span>}</p>
                  {entries.map(({ event, severity }) => (
                    <div key={event.id} className="flex min-w-0 gap-1.5">
                      <span className={cn('mt-1 size-1.5 shrink-0 rounded-full', SEVERITY_DOT[severity])} aria-hidden="true" />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="break-words text-[11px] font-semibold">{event.classroomName || 'ห้องเรียน'}</p>
                        <p className="break-words text-xs">{event.title}</p>
                        <p className="text-[10px] text-foreground/75">{formatThaiDateTime(event.endAt, { hour: '2-digit', minute: '2-digit' })} น. · {SEVERITY_LABEL[severity]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          <div className="flex flex-col gap-4 sm:hidden">
            {compactGrid('expanded')}
            {days.filter(day => eventsByDay.has(dateKey(day))).map(day => (
              <section key={dateKey(day)} id={`calendar-agenda-${dateKey(day)}`} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold">{formatThaiDate(`${dateKey(day)}T12:00:00+07:00`, { day: 'numeric', month: 'long' })}</h3>
                <EventDetails entries={eventsByDay.get(dateKey(day)) ?? []} />
              </section>
            ))}
          </div>
          {!monthHasEvents && <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีงานกำหนดส่งในเดือนนี้</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {(['overdue', 'soon', 'later', 'done'] as Severity[]).map(severity => (
            <span key={severity} className="flex items-center gap-1"><span className={cn('size-1.5 rounded-full', SEVERITY_DOT[severity])} aria-hidden="true" />{SEVERITY_LABEL[severity]}</span>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
