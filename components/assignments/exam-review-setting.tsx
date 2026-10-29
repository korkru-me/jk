'use client'

import { AssignmentSettingToggle } from '@/components/assignments/assignment-setting-toggle'
import { RESULT_VISIBILITY_OPTIONS } from '@/components/assignments/result-visibility-options'
import type { ShowResultsMode } from '@/lib/types'

export const EXAM_REVIEW_SETTING_LABEL = 'ให้นักเรียนดูข้อสอบที่ทำแล้ว'
export const EXAM_REVIEW_SETTING_DESCRIPTION =
  'หลังส่งข้อสอบ นักเรียนจะมีปุ่ม “ดูข้อสอบที่ทำเสร็จแล้ว” เพื่อเปิดหน้าข้อสอบเดิมแบบดูอย่างเดียว เห็นคำตอบของตัวเองพร้อมเฉลยว่าถูกหรือผิดทีละข้อ ปุ่มเปิดตามเวลาที่ตั้งไว้ใน “แสดงผลลัพธ์”'

/**
 * ข้อสอบ only — a แบบฝึกหัด already shows the เฉลย ข้อ by ข้อ while it is being
 * done, so it has nothing to reopen. Shared by สร้างข้อสอบ and แก้ไขข้อสอบ so the
 * two cannot drift apart.
 *
 * The review never opens earlier than "แสดงผลลัพธ์" releases the answers (the
 * page reads them through the same RLS gate as the result page), so the
 * footer says plainly when that choice keeps the button from appearing.
 */
export function ExamReviewSetting({
  checked,
  onCheckedChange,
  showResults,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  showResults: ShowResultsMode
}) {
  const resultLabel = RESULT_VISIBILITY_OPTIONS.find(option => option.key === showResults)?.label
  const footer = !checked ? null
    : showResults === 'score_only' || showResults === 'never' ? (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-foreground">
          ตอนนี้ตั้ง “แสดงผลลัพธ์” เป็น “{resultLabel}” นักเรียนจึงยังไม่เห็นปุ่มนี้ — เลือก “ทันทีหลังส่ง” หรือ “หลังพ้นกำหนดส่ง” เพื่อเปิดให้ดู
        </p>
      )
      : showResults === 'after_due' ? (
        <p data-assignment-description className="px-1 text-xs text-muted-foreground">
          ปุ่มจะขึ้นหลังพ้นกำหนดส่ง ตามที่ตั้งไว้ใน “แสดงผลลัพธ์”
        </p>
      )
      : null

  return (
    <AssignmentSettingToggle
      label={EXAM_REVIEW_SETTING_LABEL}
      description={EXAM_REVIEW_SETTING_DESCRIPTION}
      descriptionOnHover
      checked={checked}
      onCheckedChange={onCheckedChange}
      footer={footer}
    />
  )
}
