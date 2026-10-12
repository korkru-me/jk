'use client'

import { Lightbulb } from 'lucide-react'
import { attemptLimitFor } from '@/lib/solution-release'
import type { AssignmentType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AssignmentSettingHoverLabel } from '@/components/assignments/assignment-setting-hover-label'

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
 * "ให้นักเรียนดูเฉลยวิธีทำหลังกดส่ง" — the เฉลย a teacher attached to each โจทย์ under
 * "เฉลยวิธีทำ", opened ข้อ by ข้อ from the student's summary page once they
 * can no longer work on the งาน (lib/solution-release.ts). Shared by สร้างงาน
 * and แก้ไขงาน so the promise reads the same in both.
 */
export function SolutionReleaseSetting({ checked, onChange, assignmentType, maxAttempts, untilPassed = false, compact = false }: {
  checked: boolean
  onChange: (checked: boolean) => void
  assignmentType: AssignmentType
  /** The จำกัดจำนวนครั้ง field as typed; empty = no limit set. */
  maxAttempts: string
  untilPassed?: boolean
  compact?: boolean
}) {
  const releaseTiming = untilPassed
    ? 'นักเรียนจะเห็นเฉลยเมื่อผ่านและส่งงานแล้ว หรือเมื่อพ้นเวลาปิดรับหรือผู้สอนปิดงาน โดยต้องไม่มีรอบที่ยังทำค้างอยู่'
    : openingSummary(assignmentType, maxAttempts)
  const description =
    `หากผู้สอนแนบเฉลยไว้ในโจทย์ นักเรียนจะเปิดดูเฉลยจากหน้าสรุปผลได้หลังส่งงานและไม่สามารถกลับมาทำงานนั้นต่อได้แล้ว เฉลยอาจเป็นข้อความ รูปภาพ PDF หรือกระดานที่ผู้สอนแนบไว้ ${releaseTiming}`

  return (
    <div className="space-y-1.5">
      <label className={cn(
        'flex items-center justify-between gap-3 rounded-xl border border-border hover:border-ring cursor-pointer transition-colors',
        compact ? 'min-h-10 px-3 py-2' : 'p-3',
      )}>
        <div className="flex items-center gap-3">
          {!compact && (
            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
              <Lightbulb className="w-4 h-4 text-warning" aria-hidden="true" />
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              <AssignmentSettingHoverLabel
                label="ให้นักเรียนดูเฉลยวิธีทำหลังกดส่ง"
                description={description}
              />
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
      {checked && assignmentType === 'exam' && (
        <p className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">
          ถ้าให้หลายห้องสอบชุดนี้คนละเวลา คนที่สอบเสร็จก่อนจะเห็นเฉลยและส่งต่อให้ห้องที่ยังไม่สอบได้ —
          แนะนำให้ปล่อยไม่ติ๊กไว้ก่อน แล้วค่อยมาติ๊กในหน้าแก้ไขงานเมื่อทุกห้องสอบเสร็จ
        </p>
      )}
    </div>
  )
}
