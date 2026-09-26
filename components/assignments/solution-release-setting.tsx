'use client'

import { Lightbulb } from 'lucide-react'
import { attemptLimitFor } from '@/lib/solution-release'
import type { AssignmentType } from '@/lib/types'

/**
 * When, for this งาน as it is set up right now, a student would first see
 * the เฉลย — so the teacher reads the consequence of the other settings
 * instead of having to work it out from them.
 */
function openingSummary(type: AssignmentType, maxAttempts: string): string {
  const parsed = Number.parseInt(maxAttempts, 10)
  const limit = attemptLimitFor(type, Number.isFinite(parsed) && parsed > 0 ? parsed : null)
  if (limit === 1) return 'นักเรียนแต่ละคนเห็นได้ทันทีที่ส่งคำตอบ'
  if (limit != null) {
    return `นักเรียนแต่ละคนเห็นเมื่อทำครบ ${limit} ครั้ง หรือพ้นเวลาปิดรับ (ถ้าตั้งไว้) หรือเมื่อครูกดปิดงาน`
  }
  return 'ทำได้ไม่จำกัดครั้ง เฉลยจึงเปิดเมื่อพ้นเวลาปิดรับ (ถ้าตั้งไว้) หรือเมื่อครูกดปิดงาน'
}

/**
 * "ให้นักเรียนดูเฉลยวิธีทำ" — the เฉลย a teacher attached to each โจทย์ under
 * "เฉลยวิธีทำ", opened ข้อ by ข้อ from the student's summary page once they
 * can no longer work on the งาน (lib/solution-release.ts). Shared by สร้างงาน
 * and แก้ไขงาน so the promise reads the same in both.
 */
export function SolutionReleaseSetting({ checked, onChange, assignmentType, maxAttempts }: {
  checked: boolean
  onChange: (checked: boolean) => void
  assignmentType: AssignmentType
  /** The จำกัดจำนวนครั้ง field as typed; empty = no limit set. */
  maxAttempts: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-ring cursor-pointer transition-all">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
            <Lightbulb className="w-4 h-4 text-warning" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">ให้นักเรียนดูเฉลยวิธีทำ</p>
            <p className="text-xs text-muted-foreground">
              เฉลยที่แนบไว้กับโจทย์ (ข้อความ รูป PDF กระดาน) กดดูทีละข้อได้จากหน้าสรุปผล
              หลังนักเรียนทำงานนี้ต่อไม่ได้แล้วเท่านั้น — ระหว่างทำหรือยังเหลือรอบให้ทำจะเปิดไม่ได้
            </p>
          </div>
        </div>
        <input
          type="checkbox"
          checked={checked}
          onChange={event => onChange(event.target.checked)}
          className="accent-primary w-4 h-4 shrink-0"
        />
      </label>
      {checked && (
        <p className="text-xs text-muted-foreground px-1">{openingSummary(assignmentType, maxAttempts)}</p>
      )}
      {checked && assignmentType === 'exam' && (
        <p className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">
          ถ้าให้หลายห้องสอบชุดนี้คนละเวลา คนที่สอบเสร็จก่อนจะเห็นเฉลยและส่งต่อให้ห้องที่ยังไม่สอบได้ —
          แนะนำให้ปล่อยไม่ติ๊กไว้ก่อน แล้วค่อยมาติ๊กในหน้าแก้ไขงานเมื่อทุกห้องสอบเสร็จ
        </p>
      )}
    </div>
  )
}
