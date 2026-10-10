'use client'

import { useState } from 'react'
import { ExamWaitingFlow } from '@/components/exam/exam-waiting-client'
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
}

export function ExamWaitingLab() {
  const [mode, setMode] = useState('ready')
  const [starts, setStarts] = useState(0)
  const [entered, setEntered] = useState('ยังไม่มีการเริ่มหรือส่งรอบสอบ')
  return <div className="mx-auto flex max-w-2xl flex-col gap-4">
    <p className="text-sm text-muted-foreground">ตัวอย่าง UI เท่านั้น · ไม่มี Auth/ฐานข้อมูล/SEB จริง ไม่มีการเปิดข้อสอบหรือจับเวลา</p>
    <FieldGroup><Field>
      <FieldLabel htmlFor="waiting-lab-mode">สถานการณ์ตัวอย่าง</FieldLabel>
      <NativeSelect id="waiting-lab-mode" value={mode} onChange={event => {
        setMode(event.target.value); setStarts(0); setEntered('ยังไม่มีการเริ่มหรือส่งรอบสอบ')
      }}>
        {Object.keys(cases).map(value => <option key={value} value={value}>{value}</option>)}
      </NativeSelect>
    </Field></FieldGroup>
    <p role="status">คำขอเริ่มที่จำลอง: {starts} · {entered}</p>
    <ExamWaitingFlow key={mode} summary={cases[mode]} requestStart={async code => {
      setStarts(count => count + 1)
      await new Promise(resolve => setTimeout(resolve, 250))
      if (mode === 'lost') throw new Error('simulated lost response')
      if (mode === 'failure') return { error: 'ตัวอย่าง: เซิร์ฟเวอร์ปฏิเสธคำขอเริ่มสอบ' }
      if (mode === 'code' && code !== 'TEST') return { error: 'รหัสผ่านไม่ถูกต้อง' }
      return { submissionId: receipt, alreadySubmitted: mode === 'expired' }
    }} onEntered={result => setEntered(`ยืนยัน receipt เดิม · ${result.alreadySubmitted ? 'ไปหน้าผลรอบสอบ' : 'ไปหน้าทำข้อสอบ'}`)}
      onReload={() => setEntered('โหลดข้อมูลใหม่เท่านั้น ไม่ส่งคำขอเริ่ม')} />
  </div>
}
