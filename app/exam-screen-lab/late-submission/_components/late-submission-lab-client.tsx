'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import {
  LateSubmissionScheduleFields,
  type LateBandDraft,
} from '@/components/assignments/late-submission-schedule-fields'
import {
  ResultsClient,
  type SubmittedRow,
} from '@/app/(app)/assignments/[id]/results/_components/results-client'

const initialBands: LateBandDraft[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    startsAt: '2026-10-08T16:00',
    label: 'ส่งช้าไม่เกิน 1 วัน',
    color: 'amber',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    startsAt: '2026-10-09T16:00',
    label: 'ส่งช้าเกิน 1 วัน',
    color: 'red',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    startsAt: '2026-10-10T16:00',
    label: 'ช่วงผ่อนผันวันสุดท้าย',
    color: 'amber',
  },
]

const submitted: SubmittedRow[] = [
  {
    id: '50000000-0000-4000-8000-000000000001', student_id: '60000000-0000-4000-8000-000000000001',
    status: 'graded', total_score: 9, score_adjustment: 0, max_score: 10,
    submitted_at: '2026-10-08T08:50:00.000Z', attempt_number: 1,
    users: { full_name: 'กมลชนก ใจดี', email: 'kamonchanok@example.com' },
    timing: { status: 'on_time', submittedAt: '2026-10-08T08:50:00.000Z', effectiveDueAt: '2026-10-08T09:00:00.000Z' },
  },
  {
    id: '50000000-0000-4000-8000-000000000002', student_id: '60000000-0000-4000-8000-000000000002',
    status: 'submitted', total_score: 8, score_adjustment: 0, max_score: 10,
    submitted_at: '2026-10-08T10:20:00.000Z', attempt_number: 1,
    users: { full_name: 'ณัฐวุฒิ ตั้งใจ', email: 'nattawut@example.com' },
    timing: {
      status: 'late', submittedAt: '2026-10-08T10:20:00.000Z', effectiveDueAt: '2026-10-08T09:00:00.000Z',
      band: { id: initialBands[0].id, starts_at: '2026-10-08T09:00:00.000Z', label: initialBands[0].label, color: 'amber' },
    },
  },
  {
    id: '50000000-0000-4000-8000-000000000003', student_id: '60000000-0000-4000-8000-000000000003',
    status: 'graded', total_score: 5, score_adjustment: -2, max_score: 10,
    submitted_at: '2026-10-10T10:00:00.000Z', attempt_number: 1,
    users: { full_name: 'ปวีณ์นุช เรียนดี', email: 'paweenuch@example.com' },
    timing: {
      status: 'late', submittedAt: '2026-10-10T10:00:00.000Z', effectiveDueAt: '2026-10-08T09:00:00.000Z',
      band: { id: initialBands[2].id, starts_at: '2026-10-10T09:00:00.000Z', label: initialBands[2].label, color: 'amber' },
    },
  },
  {
    id: '50000000-0000-4000-8000-000000000004', student_id: '60000000-0000-4000-8000-000000000004',
    status: 'submitted', total_score: 7, score_adjustment: 0, max_score: 10,
    submitted_at: '2026-10-09T12:00:00.000Z', attempt_number: 1,
    users: { full_name: 'ศุภชัย ขยัน', email: 'supachai@example.com' },
    timing: {
      status: 'late', submittedAt: '2026-10-09T12:00:00.000Z', effectiveDueAt: '2026-10-08T09:00:00.000Z',
      band: { id: initialBands[1].id, starts_at: '2026-10-09T09:00:00.000Z', label: initialBands[1].label, color: 'red' },
    },
  },
]

export function LateSubmissionLabClient() {
  const [dueAt, setDueAt] = useState('2026-10-08T16:00')
  const [endAt, setEndAt] = useState('2026-10-11T16:00')
  const [bands, setBands] = useState(initialBands)

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-10 px-4 py-8">
      <div>
        <p className="text-sm font-medium text-primary">Exam screen lab · ไม่มีการเขียนฐานข้อมูล</p>
        <h1 className="text-2xl font-bold text-foreground">ช่วงสีส่งช้าและการปรับคะแนนแบบกลุ่ม</h1>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">1. หน้าสร้างงาน</h2>
          <p className="text-sm text-muted-foreground">เพิ่มช่วงได้ต่อเนื่อง ใช้สีซ้ำเพื่อรวมคนจากหลายช่วงเข้ากลุ่มเดียวกัน</p>
        </div>
        <Card padding="md">
          <LateSubmissionScheduleFields
            idPrefix="lab-schedule"
            dueAt={dueAt}
            endAt={endAt}
            bands={bands}
            onDueAtChange={setDueAt}
            onEndAtChange={setEndAt}
            onBandsChange={setBands}
          />
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">2. หน้าผลคะแนน</h2>
          <p className="text-sm text-muted-foreground">ลองเลือกสีเหลืองส้ม แล้วกรอก -2 เพื่อดูขั้นตอนยืนยันทั้งกลุ่ม</p>
        </div>
        <ResultsClient
          assignmentId="70000000-0000-4000-8000-000000000001"
          assignmentTitle="แบบฝึกหัดสมการเชิงเส้น"
          classroomName="คณิตศาสตร์ ม.2/1"
          passingType="percent"
          passingValue={60}
          completionRule="fixed"
          streakTarget={null}
          questions={[]}
          submitted={submitted}
          answers={[]}
          profiles={{}}
          inProgressCount={1}
          initialPendingOnly={false}
          adjustmentBatches={[{
            id: '80000000-0000-4000-8000-000000000001', color: 'amber', adjustment: -2,
            reason: 'ส่งหลังช่วงผ่อนผัน', affected_count: 2,
            changed_by: '30000000-0000-4000-8000-000000000001', changed_by_name: 'ครูสมใจ',
            created_at: '2026-10-07T15:00:00.000Z',
          }]}
          applyAdjustmentAction={async input => ({
            success: true as const,
            batchId: 'lab-only',
            affectedCount: submitted.filter(row => row.timing.status === 'late' && row.timing.band.color === input.color).length,
          })}
        />
      </section>
    </div>
  )
}
