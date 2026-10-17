'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { loginWithGoogle, register } from '@/lib/actions/auth'
import { signupSchema, type SignupInput } from '@/lib/auth/validation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AccountRoleField, PolicyAcknowledgmentField } from '@/components/auth/account-fields'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export function SignupForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [retryAfter, setRetryAfter] = useState(0)

  const {
    register: registerField,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { full_name: '', email: '', password: '', accept_terms: false },
  })

  const selectedRole = watch('role')
  const acceptedTerms = watch('accept_terms')
  const busy = loading || googleLoading

  useEffect(() => {
    if (retryAfter <= 0) return
    const timer = window.setTimeout(() => setRetryAfter((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [retryAfter])

  async function onSubmit(values: SignupInput) {
    setLoading(true)
    setSubmitError(null)
    const formData = new FormData()
    formData.set('role', values.role)
    formData.set('full_name', values.full_name)
    formData.set('email', values.email)
    formData.set('password', values.password)
    formData.set('accept_terms', String(values.accept_terms))

    try {
      const result = await register(formData)
      if ('error' in result && result.error) {
        setSubmitError(result.error)
        setRetryAfter(result.retryAfterSeconds ?? 0)
        setLoading(false)
        return
      }

      if (result.signedIn) toast.success('สมัครสมาชิกสำเร็จ ยินดีต้อนรับสู่ KorKru')
      router.push(result.signedIn ? '/dashboard' : '/check-email')
    } catch {
      setSubmitError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      setLoading(false)
    }
  }

  async function handleGoogleSignup() {
    if (!(await trigger(['role', 'accept_terms']))) return

    setGoogleLoading(true)
    setSubmitError(null)
    try {
      const result = await loginWithGoogle(selectedRole, acceptedTerms)
      if (result?.error) {
        setSubmitError(result.error)
        setGoogleLoading(false)
      }
    } catch {
      setSubmitError('เชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      setGoogleLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2" noValidate aria-busy={busy}>
      <FieldGroup className="gap-2">
        <AccountRoleField id="signup-role" value={selectedRole} onChange={(role) => setValue('role', role, { shouldValidate: true })} error={errors.role?.message} disabled={busy} />
        <PolicyAcknowledgmentField id="accept_terms" checked={acceptedTerms === true} onChange={(checked) => setValue('accept_terms', checked, { shouldValidate: true })} error={errors.accept_terms?.message} disabled={busy} />

        <Button type="button" variant="outline" className="min-h-[44px] w-full" disabled={busy} onClick={handleGoogleSignup}>
          {googleLoading ? <Loader2 data-icon="inline-start" className="motion-safe:animate-spin" /> : <GoogleIcon />}
          สมัครด้วย Google
        </Button>
      </FieldGroup>

      <div className="flex items-center gap-3" aria-hidden>
        <Separator className="flex-1" />
        <span className="shrink-0 text-xs text-muted-foreground">หรือสมัครด้วยอีเมล</span>
        <Separator className="flex-1" />
      </div>

      <FieldGroup className="gap-2">
        <Field data-invalid={!!errors.full_name} className="gap-1">
          <FieldLabel htmlFor="full_name">ชื่อที่ใช้แสดง</FieldLabel>
          <Input
            id="full_name"
            placeholder={selectedRole === 'teacher' ? 'เช่น ครูสมชาย ใจดี' : 'เช่น สมชาย ใจดี'}
            autoComplete="name"
            aria-invalid={!!errors.full_name}
            aria-describedby={errors.full_name ? 'signup-name-error' : 'signup-name-help'}
            disabled={busy}
            className="min-h-[44px]"
            {...registerField('full_name')}
          />
          <FieldDescription id="signup-name-help">ครูและสมาชิกห้องเรียนที่เกี่ยวข้องจะเห็นชื่อนี้</FieldDescription>
          <FieldError id="signup-name-error" errors={[errors.full_name]} />
        </Field>

        <Field data-invalid={!!errors.email} className="gap-1">
          <FieldLabel htmlFor="email">อีเมล</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'signup-email-error' : undefined}
            disabled={busy}
            className="min-h-[44px]"
            {...registerField('email')}
          />
          <FieldError id="signup-email-error" errors={[errors.email]} />
        </Field>

        <Field data-invalid={!!errors.password} className="gap-1">
          <FieldLabel htmlFor="password">รหัสผ่าน</FieldLabel>
          <InputGroup className="min-h-[44px]">
            <InputGroupInput
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'signup-password-help signup-password-error' : 'signup-password-help'}
              disabled={busy}
              className="min-h-[44px]"
              {...registerField('password')}
            />
            <InputGroupAddon align="inline-end" className="py-0">
              <InputGroupButton
                size="icon-sm"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                aria-pressed={showPassword}
                disabled={busy}
              >
                {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription id="signup-password-help">8 ตัวขึ้นไป มีอักษรอังกฤษและตัวเลข</FieldDescription>
          <FieldError id="signup-password-error" errors={[errors.password]} />
        </Field>
      </FieldGroup>

      {submitError && <Alert variant="destructive"><AlertDescription>{submitError}</AlertDescription></Alert>}

      <Button type="submit" className="min-h-[44px] w-full" disabled={busy || retryAfter > 0}>
        {loading && <Loader2 data-icon="inline-start" className="motion-safe:animate-spin" />}
        {loading ? 'กำลังสมัครสมาชิก…' : retryAfter > 0 ? `ลองใหม่ได้ใน ${retryAfter} วินาที` : 'สมัครด้วยอีเมล'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        มีบัญชีอยู่แล้ว?{' '}
        <Link href="/login" className="inline-flex min-h-[44px] items-center font-medium text-primary hover:underline">เข้าสู่ระบบ</Link>
      </p>
    </form>
  )
}
