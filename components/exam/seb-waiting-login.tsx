'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { waitingRoomRequest } from '@/components/exam/seb-waiting-client'

export function WaitingExamLogin({ basePath, csrf, profile = false }: { basePath: string; csrf: string; profile?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  async function invoke(operation: string, args: unknown[]) {
    if (busy) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await waitingRoomRequest(basePath, csrf, operation, args)
      if (result.href) window.location.assign(result.href)
      else setNotice('ส่งลิงก์เข้าสู่ระบบแล้ว เปิดลิงก์บนเครื่องที่ใช้สอบนี้')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'เข้าสู่ระบบไม่สำเร็จ') } finally { setBusy(false) }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void invoke(profile ? 'profile' : 'login', profile ? [String(data.get('full_name') ?? '')] : [{ email, password: String(data.get('password') ?? '') }])
  }
  return <Card padding="lg" className="mx-auto flex w-full max-w-md flex-col gap-5">
    <h1 className="text-2xl font-semibold">{profile ? 'ยืนยันชื่อผู้เข้าสอบ' : 'เข้าสู่ห้องรอสอบ'}</h1>
    <p className="text-sm text-muted-foreground">{profile ? 'บันทึกข้อมูลบัญชีก่อนเข้าห้องรอ ไม่เริ่มจับเวลา' : 'ใช้บัญชี KorKru ของคุณ ไม่มีรหัส SEB เพิ่มเติมก่อนเข้าสอบ'}</p>
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldGroup>
        {profile ? <Field>
          <FieldLabel htmlFor="waiting-full-name">ชื่อที่ใช้แสดง</FieldLabel>
          <Input id="waiting-full-name" name="full_name" autoComplete="name" required minLength={2} maxLength={160} disabled={busy} />
        </Field> : <>
          <Field>
            <FieldLabel htmlFor="waiting-email">อีเมล</FieldLabel>
            <Input id="waiting-email" name="email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
          </Field>
          <Field>
            <FieldLabel htmlFor="waiting-password">รหัสผ่านบัญชี KorKru</FieldLabel>
            <Input id="waiting-password" name="password" type="password" autoComplete="current-password" required disabled={busy} />
          </Field>
        </>}
      </FieldGroup>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-success">{notice}</p>}
      <Button type="submit" disabled={busy}>{busy ? 'กำลังตรวจสอบ…' : profile ? 'บันทึกและไปหน้ารอสอบ' : 'เข้าสู่ระบบ'}</Button>
    </form>
    {!profile && <>
      <Button variant="outline" disabled={busy} onClick={() => void invoke('google', [])}>เข้าสู่ระบบด้วย Google</Button>
      <Button variant="outline" disabled={busy || !email} onClick={() => void invoke('magic', [email])}>ส่งลิงก์เข้าสู่ระบบทางอีเมล</Button>
    </>}
  </Card>
}
