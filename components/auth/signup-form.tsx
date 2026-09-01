'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { loginWithGoogle, register } from '@/lib/actions/auth'
import { signupSchema, type SignupInput } from '@/lib/auth/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ACCOUNT_TYPES = [
  { value: 'teacher', label: 'ครูผู้สอน', icon: '👨‍🏫', desc: 'สร้างโจทย์ ห้องเรียน และข้อสอบ' },
  { value: 'student', label: 'นักเรียน', icon: '🎒', desc: 'เข้าห้องเรียนและทำงานที่ได้รับ' },
] as const

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
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

  const {
    register: registerField,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { full_name: '', email: '', password: '' },
  })

  const selectedRole = watch('role')

  async function onSubmit(values: SignupInput) {
    setLoading(true)
    const formData = new FormData()
    formData.set('role', values.role)
    formData.set('full_name', values.full_name)
    formData.set('email', values.email)
    formData.set('password', values.password)

    try {
      const result = await register(formData)
      if ('error' in result) {
        toast.error(
          result.error === 'User already registered'
            ? 'อีเมลนี้มีบัญชีอยู่แล้ว'
            : result.error,
        )
        setLoading(false)
        return
      }

      toast.success(
        result.signedIn
          ? 'สมัครสมาชิกสำเร็จ! ยินดีต้อนรับสู่ KorKru'
          : 'สมัครสมาชิกแล้ว กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชีก่อนเข้าสู่ระบบ'
      )
      router.push(result.signedIn ? '/dashboard' : '/login')
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
      setLoading(false)
    }
  }

  async function handleGoogleSignup() {
    if (!selectedRole) {
      toast.error('กรุณาเลือกว่าคุณเป็นครูหรือนักเรียนก่อน')
      return
    }

    setGoogleLoading(true)
    const result = await loginWithGoogle(selectedRole)
    if (result?.error) {
      toast.error(result.error)
      setGoogleLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label>คุณใช้งานระบบในฐานะอะไร?</Label>
        <div className="grid grid-cols-2 gap-2">
          {ACCOUNT_TYPES.map((accountType) => (
            <button
              key={accountType.value}
              type="button"
              aria-pressed={selectedRole === accountType.value}
              onClick={() => setValue('role', accountType.value, { shouldValidate: true })}
              className={[
                'flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-sm font-medium transition-all',
                selectedRole === accountType.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-ring',
              ].join(' ')}
            >
              <span className="text-xl" aria-hidden>{accountType.icon}</span>
              <span className="text-center text-xs font-semibold leading-tight">{accountType.label}</span>
              <span className="hidden text-center text-[10px] leading-tight opacity-60 sm:block">
                {accountType.desc}
              </span>
            </button>
          ))}
        </div>
        {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="full_name">ชื่อที่ใช้แสดง</Label>
        <Input
          id="full_name"
          placeholder={selectedRole === 'teacher' ? 'เช่น ครูสมชาย ใจดี' : 'เช่น สมชาย ใจดี'}
          autoComplete="name"
          {...registerField('full_name')}
        />
        {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">อีเมล</Label>
        <Input
          id="email"
          type="email"
          placeholder="name@example.com"
          autoComplete="email"
          {...registerField('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="อย่างน้อย 8 ตัว มีตัวอักษร + ตัวเลข"
            autoComplete="new-password"
            className="pr-10"
            {...registerField('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={loading || googleLoading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            กำลังสมัครสมาชิก...
          </>
        ) : (
          'สมัครสมาชิก'
        )}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-card px-2 text-muted-foreground">หรือ</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        disabled={googleLoading || loading}
        onClick={handleGoogleSignup}
      >
        {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
        สมัครด้วย Google
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        มีบัญชีอยู่แล้ว?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  )
}
