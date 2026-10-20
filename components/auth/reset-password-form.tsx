'use client'

import { useEffect, useState } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

import { resetPassword } from '@/lib/actions/auth'
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/auth/validation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'

export function ResetPasswordForm() {
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pendingFocus, setPendingFocus] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) })

  useEffect(() => {
    if (pendingFocus && !loading) {
      setFocus('password')
      setPendingFocus(false)
    }
  }, [pendingFocus, loading, setFocus])

  async function onSubmit(values: ResetPasswordInput) {
    setLoading(true)
    setSubmitError(null)
    const formData = new FormData()
    formData.set('password', values.password)
    formData.set('confirm_password', values.confirm_password)

    try {
      const result = await resetPassword(formData)
      if (result.field === 'password') {
        setError('password', { type: 'server', message: result.error })
        setPendingFocus(true)
      } else {
        setSubmitError(result.error)
      }
    } catch (error) {
      unstable_rethrow(error)
      setSubmitError('เชื่อมต่อไม่สำเร็จ กรุณาลองตั้งรหัสผ่านใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate aria-busy={loading}>
      <FieldGroup className="gap-3">
        <Field data-invalid={!!errors.password} className="gap-1">
          <FieldLabel htmlFor="password">รหัสผ่านใหม่</FieldLabel>
          <InputGroup className="min-h-[44px]">
            <InputGroupInput
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoCapitalize="none"
              spellCheck={false}
              disabled={loading}
              placeholder="อย่างน้อย 8 ตัว มีตัวอักษร + ตัวเลข"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'reset-password-error' : undefined}
              {...register('password')}
            />
            <InputGroupAddon align="inline-end" className="py-0">
              <InputGroupButton
                size="icon-sm"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={loading}
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldError id="reset-password-error" errors={[errors.password]} />
        </Field>

        <Field data-invalid={!!errors.confirm_password} className="gap-1">
          <FieldLabel htmlFor="confirm_password">ยืนยันรหัสผ่านใหม่</FieldLabel>
          <InputGroup className="min-h-[44px]">
            <InputGroupInput
              id="confirm_password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoCapitalize="none"
              spellCheck={false}
              disabled={loading}
              aria-invalid={!!errors.confirm_password}
              aria-describedby={errors.confirm_password ? 'reset-confirm-password-error' : undefined}
              {...register('confirm_password')}
            />
          </InputGroup>
          <FieldError id="reset-confirm-password-error" errors={[errors.confirm_password]} />
        </Field>
      </FieldGroup>

      {submitError && <Alert variant="destructive"><AlertDescription>{submitError}</AlertDescription></Alert>}
      <Button type="submit" className="min-h-[44px] w-full" disabled={loading}>
        {loading && <Loader2 data-icon="inline-start" className="motion-safe:animate-spin" />}
        {loading ? 'กำลังตั้งรหัสผ่าน...' : 'ตั้งรหัสผ่านใหม่'}
      </Button>
    </form>
  )
}
