'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { resetPassword } from '@/lib/actions/auth'
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/auth/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ResetPasswordForm() {
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) })

  async function onSubmit(values: ResetPasswordInput) {
    setLoading(true)
    const formData = new FormData()
    formData.set('password', values.password)
    formData.set('confirm_password', values.confirm_password)

    const result = await resetPassword(formData)
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    setCompleted(true)
  }

  if (completed) {
    return (
      <div className="space-y-4 py-4 text-center">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <CheckCircle className="h-7 w-7 text-success" />
          </div>
        </div>
        <div>
          <p className="font-semibold text-foreground">ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว</p>
          <p className="mt-1 text-sm text-muted-foreground">
            เพื่อความปลอดภัย ระบบออกจากบัญชีบนอุปกรณ์อื่นแล้ว
          </p>
        </div>
        <Button className="w-full" render={<Link href="/login" />}>
          เข้าสู่ระบบด้วยรหัสผ่านใหม่
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="password">รหัสผ่านใหม่</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="อย่างน้อย 8 ตัว มีตัวอักษร + ตัวเลข"
            className="pr-10"
            {...register('password')}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm_password">ยืนยันรหัสผ่านใหม่</Label>
        <Input
          id="confirm_password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          {...register('confirm_password')}
        />
        {errors.confirm_password && (
          <p className="text-xs text-destructive">{errors.confirm_password.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            กำลังตั้งรหัสผ่าน...
          </>
        ) : (
          'ตั้งรหัสผ่านใหม่'
        )}
      </Button>
    </form>
  )
}
