'use client'

import { useState } from 'react'
import { ExamWaitingFlow } from '@/components/exam/exam-waiting-client'
import { ExamWaitingPreviewRoom } from '@/components/exam/exam-waiting-preview'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/native-select'
import type { ExamWaitingSummary } from '@/lib/exam-waiting-room'

const receipt = '70000000-0000-4000-8000-000000000001'
const base: ExamWaitingSummary = {
  title: 'ข้อสอบตัวอย่าง · ห้องรอสอบ', description: 'เตรียมอุปกรณ์และอ่านกติกาก่อนเริ่ม',
  durationMinutes: 30, questionCount: 3, endAt: null, accessMode: 'browser',
  requiresAccessCode: false, previousSubmissionId: null, activeSubmissionId: null,
  completedSubmissionId: null, expired: false, startedAt: null, blockedReason: null,
}
const exercise: ExamWaitingSummary = { ...base, assignmentType: 'exercise',
  title: 'แบบฝึกหัดตัวอย่าง · การเคลื่อนที่', durationMinutes: 60, questionCount: 30,
  exerciseDetails: { completion: 'complete', maxAttempts: 3, scoreStrategy: 'best',
    passingType: null, passingValue: null, streakTarget: null, streakQuestionCap: null,
    retryWrongOnly: false, instantCheck: true, revealCheckAnswer: false, requireWorkImage: false } }
const cases: Record<string, ExamWaitingSummary> = {
  ready: base,
  code: { ...base, requiresAccessCode: true },
  active: { ...base, previousSubmissionId: receipt, activeSubmissionId: receipt, startedAt: '2026-10-10T03:00:00Z' },
  expired: { ...base, previousSubmissionId: receipt, expired: true, startedAt: '2026-10-10T03:00:00Z' },
  blocked: { ...base, blockedReason: 'ยังไม่ถึงเวลาเปิดสอบ กรุณาโหลดหน้านี้ใหม่เมื่อถึงเวลา' },
  completed: { ...base, previousSubmissionId: receipt, completedSubmissionId: receipt },
  untimed: { ...base, durationMinutes: null },
  seb: { ...base, accessMode: 'seb' },
  android: { ...base, accessMode: 'android_monitored' },
  failure: base,
  lost: base,
  preview: base,
  preview_code: { ...base, requiresAccessCode: true },
  exercise,
  exercise_untimed: { ...exercise, durationMinutes: null },
  exercise_code: { ...exercise, requiresAccessCode: true },
  exercise_active: { ...exercise, durationMinutes: null, previousSubmissionId: receipt, activeSubmissionId: receipt, startedAt: '2026-10-10T03:00:00Z' },
  exercise_expired: { ...exercise, previousSubmissionId: receipt, expired: true },
  exercise_completed: { ...exercise, previousSubmissionId: receipt, completedSubmissionId: receipt },
  exercise_retry: { ...exercise, exerciseDetails: { ...exercise.exerciseDetails!, retryWrongOnly: true } },
  exercise_threshold: { ...exercise, exerciseDetails: { ...exercise.exerciseDetails!, completion: 'threshold', maxAttempts: null, passingType: 'percent', passingValue: 70 } },
  exercise_streak: { ...exercise, questionCount: null, exerciseDetails: { ...exercise.exerciseDetails!, completion: 'streak', maxAttempts: null, streakTarget: 3, streakQuestionCap: 10 } },
  preview_exercise: exercise,
  preview_exercise_code: { ...exercise, requiresAccessCode: true },
}

export function ExamWaitingLab() {
  const [mode, setMode] = useState('ready')
  const [starts, setStarts] = useState(0)
  const [entered, setEntered] = useState('ยังไม่มีการเริ่มหรือส่งรอบทำงาน')
  return <div className="assignment-waiting-stage flex w-full max-w-5xl flex-col gap-4">
    <p className="text-sm text-muted-foreground">ตัวอย่าง UI เท่านั้น · ไม่มี Auth/ฐานข้อมูล/SEB จริง ไม่มีการเปิดโจทย์หรือจับเวลา</p>
    <FieldGroup><Field>
      <FieldLabel htmlFor="waiting-lab-mode">สถานการณ์ตัวอย่าง</FieldLabel>
      <NativeSelect id="waiting-lab-mode" value={mode} onChange={event => {
        setMode(event.target.value); setStarts(0); setEntered('ยังไม่มีการเริ่มหรือส่งรอบทำงาน')
      }}>
        {Object.keys(cases).map(value => <option key={value} value={value}>{value}</option>)}
      </NativeSelect>
    </Field></FieldGroup>
    <p role="status">คำขอเริ่มที่จำลอง: {starts} · {entered}</p>
    {mode.startsWith('preview') ? <ExamWaitingPreviewRoom key={mode} summary={cases[mode]}
      onReload={() => setEntered('โหลดตัวอย่างใหม่เท่านั้น ไม่เริ่มรอบจริง')}
      returnHref="/exam-screen-lab/exam-waiting" onStartPreview={() => {
        setStarts(count => count + 1); setEntered('เปิดตัวอย่างหลังอ่านกติกา · ไม่มีรอบสอบจริง')
      }} /> : <ExamWaitingFlow key={mode} summary={cases[mode]} requestStart={async code => {
      setStarts(count => count + 1)
      await new Promise(resolve => setTimeout(resolve, 250))
      if (mode === 'lost') throw new Error('simulated lost response')
      if (mode === 'failure') return { error: 'ตัวอย่าง: เซิร์ฟเวอร์ปฏิเสธคำขอเริ่มสอบ' }
      if (cases[mode].requiresAccessCode && code !== 'TEST') return { error: 'รหัสผ่านไม่ถูกต้อง' }
      return { submissionId: receipt, alreadySubmitted: cases[mode].expired }
    }} onEntered={result => setEntered(`ยืนยัน receipt เดิม · ${result.alreadySubmitted ? 'ไปหน้าผลรอบสอบ' : 'ไปหน้าทำข้อสอบ'}`)}
      onReload={() => setEntered('โหลดข้อมูลใหม่เท่านั้น ไม่ส่งคำขอเริ่ม')} />}
  </div>
}
