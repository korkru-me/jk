'use client'

import { useRef } from 'react'
import { ProctorHistory } from '@/app/(app)/assignments/[id]/proctor/_components/proctor-history'
import type { ProctorEventRow, ProctorSessionRow } from '@/lib/exam-proctor-realtime'
import { PROCTOR_HISTORY_PAGE_SIZE } from '@/lib/exam-proctor-history'

const assignmentId = '10000000-0000-4000-8000-000000000001'
const studentId = '10000000-0000-4000-8000-000000000002'
const events: ProctorEventRow[] = Array.from({ length: 205 }, (_, index) => ({
  id: 205 - index,
  assignment_id: assignmentId, student_id: studentId,
  submission_id: '10000000-0000-4000-8000-000000000003',
  org_id: '10000000-0000-4000-8000-000000000004',
  event_type: index % 2 === 0 ? 'tab_hidden' : 'tab_visible',
  created_at: new Date(Date.UTC(2026, 0, 1, 0, 205 - index)).toISOString(),
  occurred_at_client: null,
  acknowledged_at: index % 3 === 0 ? '2026-01-02T00:00:00.000Z' : null,
  acknowledged_by: null,
}))
const sessions: ProctorSessionRow[] = [1, 2].map(index => ({
  submission_id: `10000000-0000-4000-8000-00000000000${index + 2}`,
  org_id: events[0].org_id, assignment_id: assignmentId, student_id: studentId,
  started_monitoring_at: `2026-01-0${index}T00:00:00.000Z`,
  last_seen_at: `2026-01-0${index}T01:00:00.000Z`,
  completed_at: `2026-01-0${index}T01:00:00.000Z`,
  is_online: false, is_tab_visible: true, is_fullscreen: true,
  tab_switch_count: index * 2, fullscreen_exit_count: index,
  window_blur_count: index, clipboard_attempt_count: 0,
  screenshot_key_count: 1, active_connection_count: 0, concurrent_connection_count: 1,
  secure_browser_verified_at: null, secure_browser_platform: null, secure_browser_version: null,
  exam_access_mode: 'browser', android_approved_at: null, android_approved_by: null,
  last_event_type: 'tab_visible', last_event_at: '2026-01-02T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
}))

export function ProctorHistoryLab({ fail }: { fail: boolean }) {
  const failed = useRef(false)
  return <main className="flex min-w-0 flex-col gap-3 p-4 sm:p-6">
    <p className="text-xs text-muted-foreground">ตัวอย่างข้อมูลสมมติ: ข้อสอบปิดแล้ว เหตุการณ์เกิน 90 วัน และนักเรียนมีสองรอบสอบ ไม่มีการเชื่อมต่อฐานข้อมูล</p>
    <ProctorHistory assignmentId={assignmentId} sessions={sessions} studentNameById={new Map([[studentId, 'นักเรียนตัวอย่าง ชื่อยาวสำหรับตรวจบนมือถือ']])} loadPage={async before => {
      if (fail && !failed.current) { failed.current = true; throw new Error('Synthetic read failure') }
      const remaining = events.filter(event => before === null || event.id < before)
      const page = remaining.slice(0, PROCTOR_HISTORY_PAGE_SIZE)
      return { events: page, nextBefore: remaining.length > PROCTOR_HISTORY_PAGE_SIZE ? page.at(-1)!.id : null }
    }} />
  </main>
}
