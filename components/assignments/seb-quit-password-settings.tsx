'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CircleCheck, Eye, EyeOff, KeyRound, LoaderCircle, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveSebQuitPassword } from '@/lib/actions/seb-quit-password'
import type { SebQuitPasswordSetupState } from '@/lib/seb-quit-password-service.server'

const MIN_LENGTH = 20
const MAX_LENGTH = 64
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/

export function getSebQuitPasswordClientError(password: string, confirmation: string): string | null {
  if (!password || !confirmation) return 'กรอกรหัสออกและยืนยันรหัสให้ครบ'
  if (password !== confirmation) return 'รหัสออกและช่องยืนยันไม่ตรงกัน'
  if (
    password.length < MIN_LENGTH
    || password.length > MAX_LENGTH
    || !PRINTABLE_ASCII.test(password)
    || !/[A-Z]/.test(password)
    || !/[a-z]/.test(password)
    || !/[0-9]/.test(password)
    || !/[^A-Za-z0-9]/.test(password)
  ) {
    return 'รหัสต้องยาว 20–64 ตัว และมีพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และสัญลักษณ์ โดยไม่มีเว้นวรรค'
  }
  return null
}

interface FieldsProps {
  idPrefix: string
  password: string
  confirmation: string
  onPasswordChange: (value: string) => void
  onConfirmationChange: (value: string) => void
  disabled?: boolean
  showValidation?: boolean
}

export function SebQuitPasswordFields({
  idPrefix,
  password,
  confirmation,
  onPasswordChange,
  onConfirmationChange,
  disabled = false,
  showValidation = true,
}: FieldsProps) {
  const [visible, setVisible] = useState(false)
  const error = showValidation && (password || confirmation)
    ? getSebQuitPasswordClientError(password, confirmation)
    : null
  const describedBy = `${idPrefix}-help${error ? ` ${idPrefix}-error` : ''}`

  return (
    <div
      className="space-y-3"
      data-testid="seb-quit-password-fields"
      onKeyDown={event => {
        // The edit screen's general settings use an outer form. Enter in a
        // password field must not submit that unrelated form and navigate
        // away before the explicit password action runs.
        if (event.key === 'Enter') event.preventDefault()
      }}
    >
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">รหัสสำหรับออกจาก Safe Exam Browser</p>
          <p className="text-xs leading-5 text-foreground/80">
            นักเรียนไม่ต้องกรอกรหัสนี้ก่อนเริ่มสอบ รหัสนี้ใช้เมื่อจำเป็นต้องออกหรือปลดล็อกก่อนส่งข้อสอบเท่านั้น
            หลังส่งเสร็จให้ออกจากระบบด้วยลิงก์ออกที่หน้าเสร็จสิ้น
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-password`}>รหัสออก</Label>
          <Input
            id={`${idPrefix}-password`}
            type={visible ? 'text' : 'password'}
            value={password}
            onChange={event => onPasswordChange(event.target.value)}
            minLength={MIN_LENGTH}
            maxLength={MAX_LENGTH}
            autoComplete="new-password"
            spellCheck={false}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={describedBy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-confirmation`}>ยืนยันรหัสออก</Label>
          <div className="flex gap-2">
            <Input
              id={`${idPrefix}-confirmation`}
              type={visible ? 'text' : 'password'}
              value={confirmation}
              onChange={event => onConfirmationChange(event.target.value)}
              minLength={MIN_LENGTH}
              maxLength={MAX_LENGTH}
              autoComplete="new-password"
              spellCheck={false}
              disabled={disabled}
              aria-invalid={!!error}
              aria-describedby={describedBy}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setVisible(value => !value)}
              disabled={disabled}
              aria-label={visible ? 'ซ่อนรหัสออก' : 'แสดงรหัสออกชั่วคราว'}
            >
              {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </div>

      <p id={`${idPrefix}-help`} className="text-xs leading-5 text-muted-foreground">
        ใช้ 20–64 ตัว มี A–Z, a–z, ตัวเลข และสัญลักษณ์ โดยไม่มีเว้นวรรค ระบบจะไม่แสดงรหัสนี้อีกหลังบันทึก
      </p>
      {error && (
        <p id={`${idPrefix}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

const BLOCKED_MESSAGES: Record<NonNullable<SebQuitPasswordSetupState['blockedReason']>, string> = {
  owner_only: 'เฉพาะครูเจ้าของข้อสอบเท่านั้นที่ตั้งหรือเปลี่ยนรหัสออกได้',
  inactive_owner: 'บัญชีครูเจ้าของยังไม่พร้อมสำหรับการเปลี่ยนรหัสออก',
  not_eligible: 'บันทึกข้อสอบให้เปิดใช้ Safe Exam Browser ก่อน แล้วกลับมาตั้งรหัสออก',
  closed: 'ข้อสอบนี้ปิดแล้ว จึงเปลี่ยนรหัสออกไม่ได้',
  active_attempt: 'เปลี่ยนรหัสไม่ได้ขณะที่มีนักเรียนกำลังทำข้อสอบ',
}

interface SettingsProps {
  assignmentId: string
  initialState: SebQuitPasswordSetupState
}

export function SebQuitPasswordSettings({ assignmentId, initialState }: SettingsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [revision, setRevision] = useState(initialState.currentRevision)
  const artifactReady = revision !== null && initialState.releaseRevision === revision
  const validationError = getSebQuitPasswordClientError(password, confirmation)

  function save() {
    if (!initialState.canManage) return
    if (validationError) {
      toast.error(validationError)
      return
    }

    startTransition(async () => {
      const result = await saveSebQuitPassword({
        assignmentId,
        expectedRevision: revision ?? 0,
        password,
        confirmation,
      })

      // Clear both plaintext copies immediately after the action settles,
      // regardless of outcome. A retry requires deliberate re-entry.
      setPassword('')
      setConfirmation('')

      if (!result.success) {
        toast.error(result.error.message)
        if (result.error.reloadRequired) router.refresh()
        return
      }

      setRevision(result.revision)
      toast.success(
        revision
          ? 'เปลี่ยนรหัสออกแล้ว · ข้อสอบกลับเป็นร่างเพื่อเตรียมไฟล์รุ่นใหม่'
          : 'ตั้งรหัสออกแล้ว · กำลังรอเตรียมไฟล์ SEB',
      )
      router.refresh()
    })
  }

  return (
    <div className="ml-0 space-y-3 border-t border-border pt-4 sm:ml-11" data-testid="seb-quit-password-settings">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">การตั้งค่ารหัสออก</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {revision
              ? `ตั้งรหัสแล้ว · revision ${revision} · ${artifactReady ? 'ไฟล์พร้อม' : 'รอเตรียมไฟล์รุ่นนี้'}`
              : 'ยังไม่ได้ตั้งรหัสออกสำหรับข้อสอบนี้'}
          </p>
        </div>
        {artifactReady ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success-foreground">
            <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" /> พร้อมเผยแพร่
          </span>
        ) : revision ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-foreground">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> รอไฟล์ SEB
          </span>
        ) : null}
      </div>

      {revision && !artifactReady ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" aria-hidden="true" />
          <p>
            บันทึกรหัสออกแล้ว แต่ข้อสอบจะยังเป็นร่างจนกว่าไฟล์ SEB รุ่นนี้จะผ่านการเตรียมและตรวจสอบครบ
            นักเรียนจึงยังไม่เห็นไฟล์ที่ไม่พร้อมใช้งาน
          </p>
        </div>
      ) : null}

      {!initialState.canManage ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-warning">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{BLOCKED_MESSAGES[initialState.blockedReason ?? 'owner_only']}</p>
        </div>
      ) : (
        <>
          <SebQuitPasswordFields
            idPrefix="edit-seb-quit"
            password={password}
            confirmation={confirmation}
            onPasswordChange={setPassword}
            onConfirmationChange={setConfirmation}
            disabled={isPending}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={save}
              disabled={isPending || !!validationError}
              className="gap-2"
            >
              {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isPending ? 'กำลังบันทึก...' : revision ? 'เปลี่ยนรหัสออก' : 'บันทึกรหัสออก'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
