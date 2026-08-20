'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

import { forgotPassword } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
})

type FormValues = z.infer<typeof schema>

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setLoading(true)
    const result = await forgotPassword(values.email)
    setLoading(false)

    if (result?.error) {
      toast.error(result.error)
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-4 py-4 text-center">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <CheckCircle className="h-7 w-7 text-success" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณเรียบร้อยแล้ว
          </p>
          <p className="text-sm text-muted-foreground">
            ตรวจสอบกล่องจดหมายที่{' '}
            <span className="font-semibold text-foreground">
              {getValues('email')}
            </span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            ไม่เห็นอีเมล? ลองตรวจสอบโฟลเดอร์ Spam หรือรอสักครู่แล้วลองใหม่
          </p>
        </div>
        <Link
          href="/login"
          className="block text-sm font-medium text-primary hover:underline"
        >
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">อีเมลของคุณ</Label>
        <Input
          id="email"
          type="email"
          placeholder="example@school.ac.th"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            กำลังส่งลิงก์...
          </>
        ) : (
          'ส่งลิงก์รีเซ็ตรหัสผ่าน'
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          กลับไปเข้าสู่ระบบ
        </Link>
      </p>
    </form>
  )
}
