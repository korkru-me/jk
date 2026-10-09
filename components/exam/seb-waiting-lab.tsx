'use client'

import { useState } from 'react'
import { SebWaitingRoom } from './seb-waiting-room'
import { projectSebWaitingRoom, type SebWaitingFacts } from '@/lib/seb-waiting-room'

/** A UI-only fixture. Never invokes Auth, SEB verification, DB or a timer. */
export function SebWaitingLab() {
  const [verified, setVerified] = useState(false)
  const [phase, setPhase] = useState<'waiting' | 'active' | 'submitted'>('waiting')
  const [message, setMessage] = useState<string | null>(null)
  const facts: SebWaitingFacts = {
    title: 'ชุดทดลองห้องรอสอบ', durationMinutes: 30,
    published: true, authorized: true, releaseReady: true, verified,
    opensAt: null, closesAt: null, canCreateAttempt: phase !== 'submitted',
    attempt: phase === 'waiting' ? null : {
      id: 'ui-fixture-only', status: phase === 'active' ? 'in_progress' : 'submitted',
      startedAt: new Date().toISOString(),
    },
  }
  return (
    <div className="flex flex-col gap-5">
      <p className="text-center text-sm text-muted-foreground">
        UI QA · ข้อมูลสมมติ · การกดปุ่มจำลองสถานะเท่านั้น ไม่ตรวจ SEB จริง ไม่สร้างรอบสอบและไม่จับเวลา
      </p>
      <SebWaitingRoom
        view={projectSebWaitingRoom(facts)}
        error={message}
        onVerify={() => { setVerified(true); setMessage(null) }}
        onStart={() => { setPhase('active'); setMessage('นี่คือภาพจำลองหลังเริ่ม ไม่ได้สร้างรอบสอบจริง') }}
        onResume={() => { setPhase('submitted'); setMessage(null) }}
        onReceipt={() => setMessage('นี่คือภาพจำลองใบรับการส่ง ไม่มีทางออก native หรือการส่งจริง')}
      />
    </div>
  )
}
