'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface HomeroomCalendarEvent {
  id: string
  title: string
  classroomName: string
  endAt: string
  doneCount: number
  totalStudents: number
}

const WEEKDAY_LABELS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const MONTH_LABELS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

type Severity = 'overdue' | 'soon' | 'later' | 'done'

const SEVERITY_ORDER: Record<Severity, number> = { overdue: 0, soon: 1, later: 2, done: 3 }
const SEVERITY_DOT: Record<Severity, string> = {
  overdue: 'bg-red-500',
  soon: 'bg-amber-500',
  later: 'bg-blue-500',
  done: 'bg-emerald-500',
}
const SEVERITY_BADGE: Record<Severity, string> = {
  overdue: 'bg-red-50 text-red-700',
  soon: 'bg-amber-50 text-amber-700',
  later: 'bg-blue-50 text-blue-700',
  done: 'bg-emerald-50 text-emerald-700',
}
const SEVERITY_LABEL: Record<Severity, string> = {
  overdue: 'มีคนยังไม่ส่ง (เลยกำหนด)',
  soon: 'ใกล้ครบกำหนด',
  later: 'ยังไม่ถึงกำหนด',
  done: 'ส่งครบทุกคนแล้ว',
}

function severityOf(e: HomeroomCalendarEvent, now: number): Severity {
  if (e.totalStudents > 0 && e.doneCount >= e.totalStudents) return 'done'
  const diff = new Date(e.endAt).getTime() - now
  if (diff < 0) return 'overdue'
  if (diff < 2 * 86400000) return 'soon'
  return 'later'
}

export function HomeroomCalendar({ events }: { events: HomeroomCalendarEvent[] }) {
  const today = useMemo(() => new Date(), [])
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(today)

  const now = Date.now()
  const eventsByDay = useMemo(() => {
    const map = new Map<string, { event: HomeroomCalendarEvent; severity: Severity }[]>()
    for (const e of events) {
      const key = dateKey(new Date(e.endAt))
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
    <div className="bg-white rounded-2xl ring-1 ring-black/5 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5" /> ปฏิทินกำหนดส่งงาน
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors"
            aria-label="เดือนก่อนหน้า"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium w-32 text-center text-gray-900">{MONTH_LABELS[month]} {year + 543}</span>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors"
            aria-label="เดือนถัดไป"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today) }}
            className="ml-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
          >
            วันนี้
          </button>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-gray-400">
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
          const hasClash = dayEvents.length >= 2

          return (
            <button
              key={i}
              onClick={() => setSelected(d)}
              className={cn(
                'aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-medium transition-all relative',
                isSelected ? 'bg-blue-600 text-white' : isToday ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-300' : 'hover:bg-gray-100 text-gray-900'
              )}
            >
              {hasClash && (
                <span className={cn('absolute top-1 right-1 w-1.5 h-1.5 rounded-full', isSelected ? 'bg-white' : 'bg-amber-500')} />
              )}
              <span>{d.getDate()}</span>
              {dayEvents.length > 0 && (
                <span className="flex items-center gap-0.5">
                  {dots.map((entry, di) => (
                    <span
                      key={di}
                      className={cn('w-1.5 h-1.5 rounded-full', isSelected ? 'bg-white/80' : SEVERITY_DOT[entry.severity])}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className={cn('text-[9px] leading-none', isSelected ? 'text-white/80' : 'text-gray-400')}>+{dayEvents.length - 3}</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-500 border-t border-gray-100 pt-3">
        {(['overdue', 'soon', 'later', 'done'] as Severity[]).map(s => (
          <span key={s} className="flex items-center gap-1">
            <span className={cn('w-1.5 h-1.5 rounded-full', SEVERITY_DOT[s])} />
            {SEVERITY_LABEL[s]}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          งานชนกันในวันนั้น
        </span>
      </div>

      {/* Selected day detail */}
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500">
          {selected.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        {selectedEvents.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">ไม่มีงานกำหนดส่งวันนี้</p>
        ) : (
          <div className="space-y-2">
            {selectedEvents.length >= 2 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                วันนี้มีงานชนกัน {selectedEvents.length} รายการ — นักเรียนอาจทำงานไม่ทัน
              </div>
            )}
            {selectedEvents.map(({ event, severity }) => (
              <div key={event.id} className="flex items-center gap-3 p-2.5 rounded-xl ring-1 ring-black/5">
                <div className="min-w-0 flex-1">
                  <Link href={`/assignments/${event.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block">
                    {event.title}
                  </Link>
                  <p className="text-xs text-gray-400 truncate">{event.classroomName} · {event.doneCount}/{event.totalStudents} ส่งแล้ว</p>
                </div>
                <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0', SEVERITY_BADGE[severity])}>
                  {SEVERITY_LABEL[severity]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
