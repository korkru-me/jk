'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { Eye, EyeOff, KeyRound, Link2, Loader2, Mail } from 'lucide-react'
import { cancelGoogleAccountLink, completeGoogleAccountLink, sendAccountPasswordEmail, startGoogleAccountLink } from '@/lib/actions/account-methods'
import type { AccountSignInMethods, StartGoogleLinkResult } from '@/lib/auth/account-methods-types'
import { GoogleIdentityButton } from '@/components/settings/google-identity-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'

interface SignInMethodsSectionProps {
  methods: AccountSignInMethods | null
  startGoogleAction?: typeof startGoogleAccountLink
  completeGoogleAction?: typeof completeGoogleAccountLink
  cancelGoogleAction?: typeof cancelGoogleAccountLink
  sendPasswordEmailAction?: typeof sendAccountPasswordEmail
}

type GoogleChallenge = Extract<StartGoogleLinkResult, { success: true }>

const googleLabels = {
  linked: 'เชื่อมต่อแล้ว',
  unlinked: 'ยังไม่เชื่อมต่อ',
  conflict: 'ข้อมูลบัญชีไม่ตรงกัน',
  unknown: 'ตรวจสอบสถานะไม่ได้',
} as const

export function SignInMethodsSection({ methods, startGoogleAction = startGoogleAccountLink, completeGoogleAction = completeGoogleAccountLink, cancelGoogleAction = cancelGoogleAccountLink, sendPasswordEmailAction = sendAccountPasswordEmail }: SignInMethodsSectionProps) {
  const router = useRouter()
  const id = useId()
  const passwordInput = useRef<HTMLInputElement>(null)
  const submittingCredential = useRef(false)
  const [expanded, setExpanded] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkMessage, setLinkMessage] = useState<string | null>(null)
  const [challenge, setChallenge] = useState<GoogleChallenge | null>(null)
  const [pending, setPending] = useState<'start' | 'complete' | 'cancel' | 'email' | null>(null)
  const [cancelNeedsRetry, setCancelNeedsRetry] = useState(false)
  const [retryCancelExpanded, setRetryCancelExpanded] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailRequested, setEmailRequested] = useState(false)
  const [emailRetryAt, setEmailRetryAt] = useState(0)
  const [now, setNow] = useState(0)
  const busy = pending !== null
  const retrySeconds = Math.max(0, Math.ceil((emailRetryAt - now) / 1000))
  const expired = Boolean(challenge && now >= challenge.expiresAt)

  useEffect(() => {
    if (!challenge && !emailRetryAt) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [challenge, emailRetryAt])

  useEffect(() => {
    if (expanded && !challenge && pending === null) passwordInput.current?.focus()
  }, [expanded, challenge, passwordError, pending])

  async function cancelGoogle(keepExpanded = false) {
    if (busy || submittingCredential.current) return
    // Unmount GIS and discard local secrets before awaiting server cleanup.
    // The ref also rejects a credential callback before React commits that unmount.
    submittingCredential.current = true
    setCurrentPassword('')
    setShowPassword(false)
    setPasswordError(null)
    setLinkError(null)
    setLinkMessage(null)
    setChallenge(null)
    setRetryCancelExpanded(keepExpanded)
    setPending('cancel')
    try {
      const result = await cancelGoogleAction()
      if ('error' in result) {
        setCancelNeedsRetry(true)
        setLinkError(result.error)
        return
      }
      setCancelNeedsRetry(false)
      setExpanded(keepExpanded)
    } catch (error) {
      unstable_rethrow(error)
      setCancelNeedsRetry(true)
      setLinkError('ยังล้างการยืนยัน Google ไม่สำเร็จ กรุณาลองยกเลิกอีกครั้ง')
    } finally {
      submittingCredential.current = false
      setPending(null)
    }
  }

  async function handleStart(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || submittingCredential.current || cancelNeedsRetry) return
    setLinkError(null)
    setLinkMessage(null)
    setPasswordError(null)
    if (!currentPassword.length) {
      setPasswordError('กรุณากรอกรหัสผ่านปัจจุบันก่อนเชื่อมต่อ Google')
      passwordInput.current?.focus()
      return
    }
    const formData = new FormData()
    formData.set('current_password', currentPassword)
    setCurrentPassword('')
    setShowPassword(false)
    setPending('start')
    try {
      const result = await startGoogleAction(formData)
      if ('error' in result) {
        if (result.field === 'current_password') {
          setPasswordError(result.error)
          passwordInput.current?.focus()
        } else setLinkError(result.error)
        return
      }
      setNow(Date.now())
      setChallenge(result)
    } catch (error) {
      unstable_rethrow(error)
      setLinkError('ยังยืนยันตัวตนไม่ได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setPending(null)
    }
  }

  async function handleCredential(credential: string) {
    if (submittingCredential.current || busy || !challenge) return
    if (Date.now() >= challenge.expiresAt) {
      setLinkError('การยืนยันตัวตนหมดอายุ กรุณายืนยันรหัสผ่านอีกครั้ง')
      return
    }
    submittingCredential.current = true
    setPending('complete')
    setLinkError(null)
    try {
      const result = await completeGoogleAction(credential)
      setChallenge(null)
      if ('error' in result) {
        setLinkError(result.error)
        return
      }
      setExpanded(false)
      setLinkMessage(result.warning ?? 'เชื่อมต่อ Google สำเร็จ ใช้เข้าสู่ระบบบัญชี KorKru นี้ได้')
      router.refresh()
    } catch (error) {
      unstable_rethrow(error)
      setChallenge(null)
      setLinkError('ยังตรวจสอบการเชื่อมต่อไม่ได้ กรุณาโหลดข้อมูลใหม่ก่อนลองอีกครั้ง')
    } finally {
      submittingCredential.current = false
      setPending(null)
    }
  }

  async function handlePasswordEmail() {
    if (busy || retrySeconds > 0) return
    setPending('email')
    setEmailError(null)
    setEmailRequested(false)
    try {
      // No email is accepted from the browser; the server binds this request
      // to the verified current account.
      const result = await sendPasswordEmailAction()
      const requestTime = Date.now()
      setNow(requestTime)
      setEmailRetryAt(requestTime + Math.max(0, result.retryAfterSeconds ?? 0) * 1000)
      if ('error' in result) setEmailError(result.error)
      else setEmailRequested(true)
    } catch (error) {
      unstable_rethrow(error)
      setEmailError('ยังส่งคำขอไม่ได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setPending(null)
    }
  }

  return (
    <Card padding="md" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 shrink-0 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold">วิธีเข้าสู่ระบบ</h2>
      </div>
      {!methods ? (
        <>
          <Alert><AlertDescription>ยังอ่านวิธีเข้าสู่ระบบของบัญชีไม่ได้ กรุณาลองโหลดข้อมูลใหม่</AlertDescription></Alert>
          <Button type="button" variant="outline" onClick={() => router.refresh()} className="min-h-[44px] self-start">โหลดข้อมูลใหม่</Button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 break-all text-sm">{methods.email}</p>
            <p className="text-xs text-muted-foreground">{methods.emailVerified ? 'ยืนยันอีเมลแล้ว' : 'ยังไม่ยืนยันอีเมล'}</p>
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">Google</h3>
                  <p className="break-all text-xs text-muted-foreground">{googleLabels[methods.google.state]}{methods.google.email ? ` · ${methods.google.email}` : ''}</p>
                </div>
              </div>
              {methods.canConnectGoogle && methods.google.state === 'unlinked' && !expanded && (
                <Button type="button" variant="outline" className="min-h-[44px]" disabled={busy} aria-expanded={expanded} aria-controls={`${id}-google-link`} onClick={() => { setExpanded(true); setLinkError(null); setLinkMessage(null) }}>เชื่อมต่อ Google</Button>
              )}
            </div>
            {methods.google.state === 'conflict' && <Alert><AlertDescription>ข้อมูล Google ที่เชื่อมโยงไม่ตรงกับบัญชีนี้ กรุณาติดต่อผู้ดูแลเพื่อตรวจสอบ</AlertDescription></Alert>}
            {methods.google.state === 'unknown' && <p className="text-xs text-muted-foreground">ยังยืนยันการเชื่อมต่อไม่ได้ กรุณาโหลดข้อมูลใหม่หรือติดต่อผู้ดูแล</p>}
            {!methods.canConnectGoogle && methods.google.state === 'unlinked' && <p className="text-xs text-muted-foreground">{methods.emailVerified ? 'ยังไม่พร้อมเชื่อมต่อ Google ในขณะนี้' : 'ต้องยืนยันอีเมลบัญชีก่อนเชื่อมต่อ Google'}</p>}
            {expanded && (
              <div id={`${id}-google-link`} className="flex flex-col gap-2">
                {!challenge ? (
                  <form onSubmit={handleStart} noValidate aria-busy={pending === 'start'}>
                    <input type="text" name="username" autoComplete="username" value={methods.email} readOnly hidden />
                    <FieldGroup className="gap-2">
                      <Field data-invalid={!!passwordError} className="gap-1">
                        <FieldLabel htmlFor={`${id}-password`}>รหัสผ่านปัจจุบัน</FieldLabel>
                        <InputGroup className="min-h-[44px]">
                          <InputGroupInput ref={passwordInput} id={`${id}-password`} name="current_password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" autoCapitalize="none" spellCheck={false} value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setPasswordError(null) }} required disabled={busy || cancelNeedsRetry} aria-invalid={!!passwordError} aria-describedby={passwordError ? `${id}-password-error` : `${id}-password-help`} className="min-h-[44px]" />
                          <InputGroupAddon align="inline-end" className="py-0">
                            <InputGroupButton size="icon-sm" className="min-h-[44px] min-w-[44px]" aria-label={showPassword ? 'ซ่อนรหัสผ่านปัจจุบัน' : 'แสดงรหัสผ่านปัจจุบัน'} aria-pressed={showPassword} disabled={busy || cancelNeedsRetry} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}</InputGroupButton>
                          </InputGroupAddon>
                        </InputGroup>
                        <FieldDescription id={`${id}-password-help`}>ยืนยันรหัสผ่านก่อน แล้วเลือก Google ที่ใช้อีเมลเดียวกับบัญชีนี้</FieldDescription>
                        <FieldError id={`${id}-password-error`}>{passwordError}</FieldError>
                      </Field>
                      <Button type="submit" className="min-h-[44px] self-start" disabled={busy || cancelNeedsRetry}>{pending === 'start' && <Loader2 data-icon="inline-start" className="motion-safe:animate-spin" />}{pending === 'start' ? 'กำลังยืนยัน…' : 'ยืนยันเพื่อเลือกบัญชี Google'}</Button>
                    </FieldGroup>
                  </form>
                ) : expired && pending !== 'complete' ? (
                  <>
                    <Alert><AlertDescription>การยืนยันตัวตนหมดอายุ กรุณายืนยันรหัสผ่านอีกครั้ง</AlertDescription></Alert>
                    <Button type="button" variant="outline" className="min-h-[44px] self-start" disabled={busy} onClick={() => { void cancelGoogle(true) }}>ยืนยันรหัสผ่านอีกครั้ง</Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">เลือกบัญชี Google ที่ใช้อีเมล {methods.email}</p>
                    <GoogleIdentityButton clientId={challenge.clientId} nonceHash={challenge.nonceHash} expiresAt={challenge.expiresAt} busy={busy} onCredential={handleCredential} onError={setLinkError} />
                    {pending === 'complete' && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />กำลังตรวจสอบการเชื่อมต่อ…</p>}
                    <p className="text-xs text-muted-foreground">หากปิดหน้าต่างเลือกบัญชี สามารถกดปุ่ม Google อีกครั้งหรือยกเลิกขั้นตอนนี้ได้</p>
                  </>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Button type="button" variant="ghost" className="min-h-[44px]" disabled={busy} onClick={() => { void cancelGoogle(cancelNeedsRetry ? retryCancelExpanded : false) }}>{pending === 'cancel' && <Loader2 data-icon="inline-start" className="motion-safe:animate-spin" />}{pending === 'cancel' ? 'กำลังยกเลิก…' : cancelNeedsRetry ? 'ลองยกเลิกอีกครั้ง' : 'ยกเลิกการเชื่อมต่อ'}</Button>
                  {!challenge && <Link href="/forgot-password" className="inline-flex min-h-[44px] items-center text-sm text-primary underline-offset-4 hover:underline">ลืมรหัสผ่าน?</Link>}
                </div>
              </div>
            )}
            {linkError && <Alert variant="destructive"><AlertDescription>{linkError}</AlertDescription></Alert>}
            {linkMessage && <Alert role="status"><AlertDescription>{linkMessage}</AlertDescription></Alert>}
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2"><Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden /><h3 className="text-sm font-medium">อีเมลและรหัสผ่าน</h3></div>
              <Button type="button" variant="outline" className="min-h-[44px]" disabled={busy || retrySeconds > 0} onClick={handlePasswordEmail}>{pending === 'email' && <Loader2 data-icon="inline-start" className="motion-safe:animate-spin" />}{pending === 'email' ? 'กำลังส่งคำขอ…' : retrySeconds > 0 ? `ส่งอีกครั้งได้ใน ${retrySeconds} วินาที` : 'ตั้งหรือเปลี่ยนรหัสผ่าน'}</Button>
            </div>
            <p className="text-xs text-muted-foreground">ขอลิงก์ทางอีเมลสำหรับตั้งรหัสผ่านใหม่ให้บัญชีนี้</p>
            {emailError && <Alert variant="destructive"><AlertDescription>{emailError}</AlertDescription></Alert>}
            {emailRequested && <Alert role="status"><AlertDescription>ส่งคำขอแล้ว หากบัญชีพร้อมรับอีเมล ระบบจะส่งลิงก์ไปที่ {methods.email} โปรดตรวจสอบกล่องจดหมายและสแปม แล้วเปิดลิงก์ในเบราว์เซอร์ที่ขอครั้งนี้</AlertDescription></Alert>}
          </div>
          <Link href="/contact" className="inline-flex min-h-[44px] items-center self-start text-xs text-muted-foreground underline-offset-4 hover:underline">ติดต่อผู้ดูแลเรื่องบัญชี</Link>
        </>
      )}
    </Card>
  )
}
