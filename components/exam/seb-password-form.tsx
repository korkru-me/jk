'use client'

import { useRef, useState, useTransition } from 'react'
import { updateSebPasswordDraft } from '@/lib/actions/seb-password'
import type { SebPasswordSettingsSummary, SebPasswordDraftState } from '@/lib/seb-password-settings'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'

const labels: Record<SebPasswordDraftState, string> = { saved: 'บันทึกร่าง', discarded: 'ลบร่างรหัส', expired: 'ร่างหมดอายุ' }
const date = (value: string) => new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

export function SebPasswordForm({ assignmentId, initialSummary }: {
  assignmentId: string; initialSummary: SebPasswordSettingsSummary
}) {
  const [summary, setSummary] = useState(initialSummary)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)
  const [reloadRequired, setReloadRequired] = useState(false)
  const [pending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()
  const formRef = useRef<HTMLFormElement>(null)
  const draft = summary.draft

  function change(operation: 'save' | 'discard', password?: string, confirmation?: string) {
    setMessage('')
    setHasError(false)
    startTransition(async () => {
      try {
        const result = await updateSebPasswordDraft({
          assignmentId, operation, expectedRevision: draft?.revision ?? 0,
          ...(operation === 'save' ? { password, confirmation } : {}),
        })
        if (!result.ok) {
          setHasError(true)
          setMessage(result.message)
          setReloadRequired(result.reloadRequired)
          return
        }
        setSummary(result.summary)
        setReloadRequired(false)
        setMessage(operation === 'save'
          ? 'บันทึกร่างรหัสแล้ว — ยังไม่ใช้กับ SEB และไม่เปลี่ยนรหัสของไฟล์ที่แจกไปแล้ว'
          : 'ลบร่างรหัสแล้ว — ไฟล์ SEB เดิม คำตอบ และคะแนนยังอยู่เหมือนเดิม')
      } catch {
        setHasError(true)
        setReloadRequired(true)
        setMessage('การเชื่อมต่อขัดข้อง ยังยืนยันผลไม่ได้ กรุณาโหลดข้อมูลล่าสุดก่อนลองอีกครั้ง')
      } finally {
        formRef.current?.reset()
      }
    })
  }

  async function discard() {
    const accepted = await confirm({
      title: 'ลบร่างรหัสนี้?',
      description: 'รหัสในร่างนี้จะกู้คืนไม่ได้ แต่ไฟล์ SEB ที่แจกแล้ว การสอบ คำตอบ และคะแนนไม่เปลี่ยนแปลง',
      confirmLabel: 'ลบร่างรหัส', variant: 'destructive',
    })
    if (accepted) change('discard')
  }

  return <>
    <Card padding="xl" className="space-y-5">
      <div className="space-y-2">
        <h2 className="font-semibold text-lg">ร่างรหัสออกของข้อสอบนี้</h2>
        <p className="text-sm text-muted-foreground">
          {draft ? `เวอร์ชัน ${draft.revision} · ${labels[draft.state]} · ${date(draft.updatedAt)}` : 'ยังไม่มีร่างรหัสของข้อสอบนี้'}
        </p>
        {draft?.state === 'saved' && draft.expiresAt && <p className="text-sm text-muted-foreground">
          เก็บร่างถึง {date(draft.expiresAt)} หลังจากนั้นต้องตั้งร่างใหม่
        </p>}
      </div>
      <form ref={formRef} className="space-y-4" onSubmit={event => {
        event.preventDefault()
        if (pending || reloadRequired) return
        const data = new FormData(event.currentTarget)
        const password = data.get('password')
        const confirmation = data.get('confirmation')
        // Keep passwords out of React state, URLs and browser storage. Clear
        // visible controls immediately, including when the network fails.
        event.currentTarget.reset()
        change('save', typeof password === 'string' ? password : '', typeof confirmation === 'string' ? confirmation : '')
      }}>
        <fieldset disabled={pending || reloadRequired} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seb-quit-password">รหัสออกใหม่สำหรับข้อสอบนี้</Label>
            <Input id="seb-quit-password" name="password" type="password" autoComplete="new-password"
              minLength={12} maxLength={64} required pattern="[\x21-\x7E]{12,64}" aria-describedby="seb-password-help" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seb-quit-confirmation">ยืนยันรหัสออกใหม่</Label>
            <Input id="seb-quit-confirmation" name="confirmation" type="password" autoComplete="new-password"
              minLength={12} maxLength={64} required />
          </div>
          <p id="seb-password-help" className="text-sm text-muted-foreground">
            ใช้ตัวอักษรอังกฤษ ตัวเลข หรือสัญลักษณ์ 12–64 ตัว ไม่มีช่องว่าง ไม่ใช้รหัสเข้าสู่ระบบ KorKru
            ระบบไม่แสดงรหัสเดิมให้เปิดดู หากลืมให้ตั้งใหม่
          </p>
          <Button type="submit" disabled={pending || reloadRequired}>
            {pending ? 'กำลังดำเนินการ…' : 'บันทึกร่างรหัส'}
          </Button>
        </fieldset>
      </form>
      {message && <p role={hasError ? 'alert' : 'status'} className={`text-sm ${hasError ? 'text-destructive' : 'text-foreground'}`}>{message}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" disabled={pending} onClick={() => window.location.reload()}>โหลดข้อมูลล่าสุด</Button>
        {draft?.state === 'saved' && <Button type="button" variant="ghost" disabled={pending || reloadRequired} onClick={discard}>ลบร่างรหัส</Button>}
      </div>
    </Card>
    <Card padding="xl" className="space-y-3">
      <h2 className="font-semibold">ประวัติร่างล่าสุด</h2>
      <p className="text-sm text-muted-foreground">แสดงไม่เกิน 10 รายการใน 90 วัน ไม่ใช่ประวัติการเปลี่ยนรหัสบนเครื่องนักเรียน</p>
      {summary.events.length === 0 ? <p className="text-sm">ยังไม่มีรายการ</p> : <ul className="space-y-2 text-sm">
        {summary.events.map(event => <li key={`${event.revision}-${event.action}`}>
          เวอร์ชัน {event.revision} · {labels[event.action]} · {date(event.createdAt)}
        </li>)}
      </ul>}
    </Card>
    {confirmDialog}
  </>
}
