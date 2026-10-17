'use client'

import { useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { loadProctorHistoryPage, type ProctorHistoryPage } from '@/lib/exam-proctor-history'
import { PROCTOR_EVENT_LABELS } from '@/lib/exam-proctor-alerts'
import type { ProctorSessionRow } from '@/lib/exam-proctor-realtime'

interface Props {
  assignmentId: string
  studentNameById: Map<string, string>
  sessions: ProctorSessionRow[]
  loadPage?: (before: number | null) => Promise<ProctorHistoryPage>
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

/** History stays in the live room; pagination never replaces its live feed. */
export function ProctorHistory({ assignmentId, studentNameById, sessions, loadPage }: Props) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<ProctorHistoryPage | null>(null)
  const [cursors, setCursors] = useState<(number | null)[]>([null])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const inFlight = useRef(false)
  const [retryBefore, setRetryBefore] = useState<number | null>(null)
  const [retryCursors, setRetryCursors] = useState<(number | null)[]>([null])
  const name = (studentId: string) => studentNameById.get(studentId) ?? `นักเรียน (${studentId.slice(0, 8)})`

  async function read(before: number | null, nextCursors: (number | null)[]) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(false)
    setRetryBefore(before)
    setRetryCursors(nextCursors)
    try {
      const next = loadPage
        ? await loadPage(before)
        : await loadProctorHistoryPage(createClient(), assignmentId, before)
      setPage(next)
      setCursors(nextCursors)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  return <Card padding="md" className="flex min-w-0 flex-col gap-3">
    <Button variant="ghost" size="sm" className="w-full justify-start whitespace-normal text-left" aria-expanded={open} aria-controls="proctor-history-content" onClick={() => {
      setOpen(!open)
      if (!open && !page) void read(null, [null])
    }}>
      <History aria-hidden="true" /> ประวัติคุมสอบ
      <ChevronDown aria-hidden="true" className="ml-auto" />
    </Button>
    {open && <div id="proctor-history-content" className="flex min-w-0 flex-col gap-3">
      <p className="text-xs text-muted-foreground">เปิดดูเหตุการณ์ทุกช่วงเวลาและข้อมูลรอบสอบที่บันทึกไว้ในห้องนี้ได้ โดยไม่ต้องออกรายงาน</p>
      <details>
        <summary className="cursor-pointer text-sm font-medium">ข้อมูลรอบสอบที่บันทึกไว้ ({sessions.length} รอบ)</summary>
        <div tabIndex={0} role="region" aria-label="รอบสอบที่บันทึกไว้" className="mt-2 flex max-h-72 flex-col gap-2 overflow-y-auto rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {sessions.map(session => <div key={session.submission_id} className="flex flex-col gap-1 border-b border-border py-2 text-xs">
            <p className="break-words font-semibold">{name(session.student_id)}</p>
            <p className="text-muted-foreground">เริ่ม {dateTime(session.started_monitoring_at)} · {session.completed_at ? `สิ้นสุด ${dateTime(session.completed_at)}` : 'ยังไม่มีเวลาสิ้นสุด'}</p>
            <p>ออกจากแท็บ {session.tab_switch_count} · ออกจากเต็มจอ {session.fullscreen_exit_count} · เสียโฟกัส {session.window_blur_count} · คัดลอก/วาง {session.clipboard_attempt_count} · Print Screen {session.screenshot_key_count} · เปิดซ้ำ {session.concurrent_connection_count}</p>
          </div>)}
          {sessions.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีข้อมูลรอบสอบ</p>}
        </div>
      </details>
      {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        โหลดประวัติไม่สำเร็จ
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void read(retryBefore, retryCursors)}>ลองใหม่</Button>
      </div>}
      {busy && <p role="status" className="text-xs text-muted-foreground">กำลังโหลดประวัติ…</p>}
      {page && <>
        <div tabIndex={0} role="region" aria-label="เหตุการณ์คุมสอบย้อนหลัง" className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-busy={busy}>
          {page.events.map(event => <div key={event.id} className="flex min-w-0 flex-col gap-1 py-2 text-xs">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
              <p className="break-words font-semibold">{name(event.student_id)}</p>
              <time className="text-muted-foreground" dateTime={event.created_at}>{dateTime(event.created_at)}</time>
            </div>
            <p>{PROCTOR_EVENT_LABELS[event.event_type] ?? event.event_type}</p>
            {event.acknowledged_at && <Badge variant="outline" className="w-fit">รับทราบ {dateTime(event.acknowledged_at)}</Badge>}
          </div>)}
          {page.events.length === 0 && <p className="py-2 text-muted-foreground">ยังไม่มีประวัติเหตุการณ์</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={busy || cursors.length <= 1} onClick={() => {
            const previous = cursors.slice(0, -1)
            void read(previous.at(-1) ?? null, previous)
          }}><ChevronLeft /> ใหม่กว่า</Button>
          <span className="text-xs text-muted-foreground">หน้า {cursors.length}</span>
          <Button variant="outline" size="sm" disabled={busy || page.nextBefore === null} onClick={() => {
            if (page.nextBefore !== null) void read(page.nextBefore, [...cursors, page.nextBefore])
          }}>เก่ากว่า <ChevronRight /></Button>
        </div>
      </>}
    </div>}
  </Card>
}
