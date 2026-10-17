'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Mail } from 'lucide-react'

import { resendSignupConfirmation } from '@/lib/actions/auth'
import { emailSchema } from '@/lib/auth/validation'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export function CheckEmailForm({ initialEmail, initialRetryAfter = 0, invalidLink = false }: { initialEmail: string | null; initialRetryAfter?: number; invalidLink?: boolean }) {
  const [email, setEmail] = useState(initialEmail ?? '')
  const [loading, setLoading] = useState(false)
  const [retryAfter, setRetryAfter] = useState(initialRetryAfter)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    if (retryAfter <= 0) return
    const timer = window.setTimeout(() => setRetryAfter((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [retryAfter])

  async function handleResend(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'กรุณากรอกอีเมลที่ใช้สมัคร')
      return
    }

    setFieldError(null)
    setSubmitError(null)
    setRequested(false)
    setLoading(true)
    try {
      const result = await resendSignupConfirmation(parsed.data)
      setRetryAfter(result.retryAfterSeconds ?? 0)
      if ('error' in result && result.error) {
        setSubmitError(result.error)
      } else {
        setEmail(parsed.data)
        setRequested(true)
      }
    } catch {
      setSubmitError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {invalidLink && (
        <Alert variant="destructive">
          <AlertTitle>เปิดลิงก์ยืนยันไม่สำเร็จ</AlertTitle>
          <AlertDescription>ลิงก์อาจหมดอายุหรือใช้ไปแล้ว หากยืนยันแล้วให้เข้าสู่ระบบ หรือขอลิงก์ใหม่ด้านล่าง</AlertDescription>
        </Alert>
      )}

      <p className="text-sm text-muted-foreground">
        เปิดอีเมลจาก KorKru แล้วกดลิงก์ยืนยันบัญชี แนะนำให้เปิดด้วยเบราว์เซอร์ที่ใช้สมัคร และตรวจโฟลเดอร์สแปมหากยังไม่พบ
      </p>

      <form onSubmit={handleResend} noValidate aria-busy={loading}>
        <FieldGroup className="gap-3">
          <Field data-invalid={!!fieldError} className="gap-1">
            <FieldLabel htmlFor="confirmation-email">อีเมลที่ใช้สมัคร</FieldLabel>
            <Input
              id="confirmation-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => { setEmail(event.target.value); setFieldError(null) }}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@example.com"
              aria-invalid={!!fieldError}
              aria-describedby={fieldError ? 'confirmation-email-error' : 'confirmation-email-help'}
              disabled={loading}
              className="min-h-[44px]"
            />
            <FieldDescription id="confirmation-email-help">ใช้ขอลิงก์ยืนยันอีกครั้ง การกรอกช่องนี้ไม่เปลี่ยนอีเมลของบัญชี</FieldDescription>
            {fieldError && <FieldError id="confirmation-email-error">{fieldError}</FieldError>}
          </Field>

          {submitError && <Alert variant="destructive"><AlertDescription>{submitError}</AlertDescription></Alert>}
          {requested && (
            <Alert role="status">
              <Mail aria-hidden />
              <AlertDescription>หากอีเมลนี้มีบัญชีที่รอยืนยัน ระบบจะส่งลิงก์ใหม่ให้ กรุณาตรวจสอบกล่องจดหมาย</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading || retryAfter > 0} className="min-h-[44px] w-full">
            {loading && <Loader2 data-icon="inline-start" className="motion-safe:animate-spin" />}
            {loading ? 'กำลังขอลิงก์…' : retryAfter > 0 ? `ส่งอีกครั้งได้ใน ${retryAfter} วินาที` : 'ส่งลิงก์ยืนยันอีกครั้ง'}
          </Button>
        </FieldGroup>
      </form>

      <p className="text-sm text-muted-foreground">
        กรอกอีเมลผิดตอนสมัคร?{' '}
        <Link href="/signup" className="inline-flex min-h-[44px] items-center text-primary hover:underline">กลับไปสมัครด้วยอีเมลที่ถูกต้อง</Link>
      </p>
      <Link href="/login" className={buttonVariants({ variant: 'outline', className: 'min-h-[44px] w-full' })}>ไปหน้าเข้าสู่ระบบ</Link>
    </div>
  )
}
