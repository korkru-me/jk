'use client'

import { useState } from 'react'
import { SebWaitingRoom } from '@/components/exam/seb-waiting-room'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { SebWaitingView } from '@/lib/seb-waiting-room'

export async function waitingRoomRequest(basePath: string, csrf: string, operation: string, args: unknown[]) {
  const response = await fetch(`${basePath}/api`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'x-korkru-seb-csrf': csrf },
    body: JSON.stringify({ operation, args }),
  })
  const body = await response.json() as { result?: { error?: string; success?: boolean; href?: string }; error?: string }
  if (!response.ok || body.error || !body.result) throw new Error(body.error ?? 'ติดต่อห้องสอบไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่')
  if (body.result.error) throw new Error(body.result.error)
  return body.result
}

export function SebWaitingClient({ view, basePath, csrf, startIntent, challenge }: {
  view: SebWaitingView; basePath: string; csrf: string; startIntent: string | null; challenge: string | null
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function enter(operation: 'start' | 'resume') {
    if (busy) return
    setBusy(true); setError(null)
    try {
      if (operation === 'start' && !startIntent) throw new Error('ลิงก์เริ่มสอบหมดอายุ กรุณาโหลดหน้ารอใหม่')
      const result = await waitingRoomRequest(basePath, csrf, operation, operation === 'start' ? [startIntent] : [])
      if (result.href !== `${basePath}/take` && result.href !== `${basePath}/submitted`) throw new Error('เซิร์ฟเวอร์ยังไม่ยืนยันสถานะการสอบ')
      window.location.replace(result.href)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'เข้าห้องสอบไม่สำเร็จ'); setBusy(false) }
  }
  return <>
    <SebWaitingRoom view={view} busy={busy} error={error}
      onVerify={() => { window.location.assign(`${basePath}/system-check${challenge ? `?sebChallenge=${encodeURIComponent(challenge)}` : ''}`) }}
      onStart={() => void enter('start')} onResume={() => void enter('resume')}
      onReceipt={() => { window.location.assign(`${basePath}/submitted`) }} />
    {error && <Button variant="outline" className="mx-auto" onClick={() => window.location.reload()}>โหลดสถานะจากเซิร์ฟเวอร์ใหม่</Button>}
  </>
}

export function WaitingNativeCheck({ basePath, csrf, challenge }: { basePath: string; csrf: string; challenge: string }) {
  const [busy, setBusy] = useState(false)
  const [passed, setPassed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function check() {
    if (busy) return
    setBusy(true); setPassed(false); setError(null)
    try {
      const seb = window.SafeExamBrowser
      if (!seb?.security || !seb.version) throw new Error('กรุณาเปิดไฟล์ข้อสอบใน Safe Exam Browser')
      if (typeof seb.security.updateKeys === 'function') {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('SEB ส่งกุญแจไม่ทัน กรุณาลองตรวจใหม่')), 6000)
          try { seb.security!.updateKeys!(() => { clearTimeout(timeout); resolve() }) } catch { clearTimeout(timeout); reject(new Error('อ่านข้อมูล SEB ไม่สำเร็จ')) }
        })
      }
      if (!seb.security.configKey || !seb.security.browserExamKey) throw new Error('SEB ส่งกุญแจมาไม่ครบ กรุณาเปิดไฟล์ข้อสอบใหม่')
      const result = await waitingRoomRequest(basePath, csrf, 'verify', [{
        challenge, requestUrl: window.location.href, configKeyHash: seb.security.configKey,
        browserExamKeyHash: seb.security.browserExamKey, version: seb.version,
      }])
      if (!result.success) throw new Error('เซิร์ฟเวอร์ยังไม่ยืนยันเครื่องนี้')
      setPassed(true)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'ตรวจเครื่องไม่สำเร็จ') } finally { setBusy(false) }
  }
  return <Card padding="lg" className="mx-auto flex w-full max-w-2xl flex-col gap-4">
    <h1 className="text-xl font-semibold">ตรวจเครื่อง SEB ก่อนสอบ</h1>
    <p className="text-sm text-muted-foreground">การตรวจนี้ไม่สร้างรอบสอบ ไม่เปิดโจทย์ และไม่เริ่มจับเวลา</p>
    {passed && <p role="status" className="text-success">เซิร์ฟเวอร์ยืนยันเครื่องนี้แล้ว พร้อมกลับไปหน้ารอสอบ</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Button disabled={busy} onClick={() => void check()}>{busy ? 'กำลังตรวจ…' : 'ตรวจเครื่อง SEB'}</Button>
    <Button variant="outline" onClick={() => window.location.assign(`${basePath}/waiting`)}>กลับหน้ารอสอบ</Button>
  </Card>
}
