'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Check, Circle, Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { updatePassword } from '@/lib/actions/settings'
import { changePasswordSchema, type PasswordChangeField } from '@/lib/auth/change-password'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldError } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'

type PasswordValues = z.infer<typeof changePasswordSchema>
const passwordFields = [
  { name: 'old_password', label: 'รหัสผ่านปัจจุบัน', autoComplete: 'current-password' },
  { name: 'new_password', label: 'รหัสผ่านใหม่', autoComplete: 'new-password' },
  { name: 'confirm_password', label: 'ยืนยันรหัสผ่านใหม่', autoComplete: 'new-password' },
] as const

export function PasswordSettingsSection(props: Parameters<typeof PasswordSettingsForm>[0]) {
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Lock className="size-4 shrink-0 text-primary" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold">เปลี่ยนรหัสผ่าน</h2>
          <p className="text-xs text-muted-foreground">ยืนยันรหัสเดิม แล้วตั้งรหัสใหม่สำหรับบัญชีนี้</p>
        </div>
      </div>
      <PasswordSettingsForm {...props} />
    </Card>
  )
}

export function PasswordSettingsForm({ email, changePasswordAction = updatePassword }: {
  email: string
  changePasswordAction?: typeof updatePassword
}) {
  const router = useRouter()
  const formId = useId()
  const [visible, setVisible] = useState({ old_password: false, new_password: false, confirm_password: false })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [pendingFocus, setPendingFocus] = useState<PasswordChangeField | null>(null)
  const [completed, setCompleted] = useState<{ destination: string; warning?: string } | null>(null)
  const {
    register, handleSubmit, control, trigger, setError, setFocus, reset,
    formState: { errors, isSubmitting, touchedFields, submitCount },
  } = useForm<PasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onTouched',
    defaultValues: { old_password: '', new_password: '', confirm_password: '' },
  })
  const [oldPassword, newPassword, confirmation] = useWatch({
    control, name: ['old_password', 'new_password', 'confirm_password'],
  })
  const previousValues = useRef({ oldPassword, newPassword, confirmation })

  // Recheck dependent fields after edits without trimming or changing password bytes.
  useEffect(() => {
    const previous = previousValues.current
    previousValues.current = { oldPassword, newPassword, confirmation }
    if (completed) return
    const oldChanged = previous.oldPassword !== oldPassword
    const newChanged = previous.newPassword !== newPassword
    const confirmationChanged = previous.confirmation !== confirmation
    if ((newChanged || (oldChanged && errors.new_password?.type !== 'server'))
      && (touchedFields.new_password || submitCount > 0)) void trigger('new_password')
    if ((confirmationChanged || (newChanged && errors.confirm_password?.type !== 'server'))
      && (touchedFields.confirm_password || submitCount > 0)) void trigger('confirm_password')
  }, [oldPassword, newPassword, confirmation, completed, touchedFields.new_password, touchedFields.confirm_password, submitCount, errors.new_password?.type, errors.confirm_password?.type, trigger])

  useEffect(() => {
    if (pendingFocus && !isSubmitting) {
      setFocus(pendingFocus)
      setPendingFocus(null)
    }
  }, [pendingFocus, isSubmitting, setFocus])

  async function onSubmit(values: PasswordValues) {
    setSubmitError(null)
    setNeedsSignIn(false)
    setPendingFocus(null)
    const formData = new FormData()
    for (const { name } of passwordFields) formData.set(name, values[name])
    try {
      const result = await changePasswordAction(formData)
      if ('error' in result) {
        if (result.field) {
          setError(result.field, { type: 'server', message: result.error })
          setPendingFocus(result.field)
        } else {
          setSubmitError(result.error)
        }
        setNeedsSignIn(result.action === 'sign_in')
        return
      }
      const destination = result.sessionsRevoked
        ? '/login?password_changed=1'
        : '/login?password_changed=1&sessions_revoked=0'
      setCompleted({ destination, warning: result.warning })
      reset()
      setVisible({ old_password: false, new_password: false, confirm_password: false })
      setCapsLock(false)
      router.replace(destination)
      router.refresh()
    } catch (error) {
      unstable_rethrow(error)
      setSubmitError('ยังเปลี่ยนรหัสผ่านไม่ได้ กรุณาลองใหม่อีกครั้ง')
    }
  }

  const requirements = [
    { label: '8 ตัวขึ้นไป', met: newPassword.length >= 8 },
    { label: 'มีอักษรอังกฤษและตัวเลข', met: /[A-Za-z]/.test(newPassword) && /[0-9]/.test(newPassword) },
    { label: 'ต่างจากรหัสปัจจุบัน', met: newPassword.length > 0 && oldPassword.length > 0 && newPassword !== oldPassword },
  ]

  if (completed) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert role="status">
          <AlertTitle>เปลี่ยนรหัสผ่านแล้ว</AlertTitle>
          <AlertDescription>{completed.warning ?? 'กรุณาเข้าสู่ระบบอีกครั้งด้วยรหัสผ่านใหม่'}</AlertDescription>
        </Alert>
        <Link href={completed.destination} className={cn(buttonVariants(), 'min-h-[44px]')}>เข้าสู่ระบบด้วยรหัสผ่านใหม่</Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="@container/password flex w-full max-w-2xl flex-col gap-3" noValidate aria-busy={isSubmitting}>
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <FieldGroup className="grid grid-cols-1 gap-3 @min-[480px]/password:grid-cols-2">
        {passwordFields.map(({ name, label, autoComplete }) => {
          const inputId = `${formId}-${name}`
          const describedBy = [
            errors[name] && `${inputId}-error`,
            name === 'new_password' && `${formId}-requirements`,
            capsLock && `${formId}-caps-lock`,
          ].filter(Boolean).join(' ') || undefined
          return (
            <Field key={name} data-invalid={!!errors[name]} className={cn('gap-1', name === 'old_password' && '@min-[480px]/password:col-span-2')}>
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
                {name === 'old_password' && (
                  <Link href="/forgot-password" className="inline-flex min-h-[44px] items-center text-xs text-primary underline-offset-4 hover:underline">
                    ลืมรหัสผ่าน?
                  </Link>
                )}
              </div>
              <InputGroup className="min-h-[44px]">
                <InputGroupInput
                  id={inputId}
                  type={visible[name] ? 'text' : 'password'}
                  autoComplete={autoComplete}
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={!!errors[name]}
                  aria-describedby={describedBy}
                  disabled={isSubmitting}
                  className="min-h-[44px]"
                  required
                  {...register(name, { onBlur: () => setCapsLock(false) })}
                  onKeyDown={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                  onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                />
                <InputGroupAddon align="inline-end" className="py-0">
                  <InputGroupButton
                    size="icon-sm"
                    className="min-h-[44px] min-w-[44px]"
                    aria-label={`${visible[name] ? 'ซ่อน' : 'แสดง'}${name === 'confirm_password' ? 'รหัสผ่านยืนยัน' : label}`}
                    aria-pressed={visible[name]}
                    disabled={isSubmitting}
                    onClick={() => setVisible((value) => ({ ...value, [name]: !value[name] }))}
                  >
                    {visible[name] ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              {name === 'new_password' && (
                <ul id={`${formId}-requirements`} className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="เงื่อนไขรหัสผ่านใหม่">
                  {requirements.map(({ label: requirement, met }) => (
                    <li key={requirement} className={cn('flex items-center gap-1', met ? 'text-success' : 'text-muted-foreground')}>
                      {met ? <Check className="size-3" aria-hidden /> : <Circle className="size-3" aria-hidden />}
                      <span className="sr-only">{met ? 'ผ่าน: ' : 'ยังไม่ผ่าน: '}</span>{requirement}
                    </li>
                  ))}
                </ul>
              )}
              {name === 'confirm_password' && confirmation.length > 0 && confirmation === newPassword && (
                <FieldDescription className="flex items-center gap-1 text-success">
                  <Check className="size-3" aria-hidden />รหัสผ่านใหม่ตรงกัน
                </FieldDescription>
              )}
              <FieldError id={`${inputId}-error`} errors={[errors[name]]} />
            </Field>
          )
        })}
      </FieldGroup>
      {capsLock && <p id={`${formId}-caps-lock`} role="status" className="text-xs text-muted-foreground">เปิด Caps Lock อยู่ ตรวจสอบตัวพิมพ์ใหญ่และเล็กก่อนบันทึก</p>}
      {submitError && <Alert variant="destructive"><AlertDescription>{submitError}</AlertDescription></Alert>}
      {needsSignIn && <Link href="/login" className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-4 hover:underline">เข้าสู่ระบบใหม่เพื่อยืนยันตัวตน</Link>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="submit" disabled={isSubmitting} className="min-h-[44px]">
          {isSubmitting && <Loader2 className="motion-safe:animate-spin" data-icon="inline-start" />}
          {isSubmitting ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}
        </Button>
        <Link href="/forgot-password" className="inline-flex min-h-[44px] items-center text-sm text-primary underline-offset-4 hover:underline">
          ตั้งรหัสผ่านผ่านอีเมล
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        ใช้รหัสที่ไม่ซ้ำกับเว็บอื่น หลังบันทึกให้เข้าสู่ระบบด้วยรหัสใหม่ หากใช้ Google และยังไม่มีรหัสผ่าน ให้เลือก “ตั้งรหัสผ่านผ่านอีเมล”
      </p>
    </form>
  )
}
