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
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60">
            <CheckCircle className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-slate-900 dark:text-white">
            ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณเรียบร้อยแล้ว
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ตรวจสอบกล่องจดหมายที่{' '}
            <span className="font-semibold text-slate-900 dark:text-white">
              {getValues('email')}
            </span>
          </p>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            ไม่เห็นอีเมล? ลองตรวจสอบโฟลเดอร์ Spam หรือรอสักครู่แล้วลองใหม่
          </p>
        </div>
        <Link
          href="/login"
          className="block text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
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
          <p className="text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>
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

      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        <Link
          href="/login"
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          กลับไปเข้าสู่ระบบ
        </Link>
      </p>
    </form>
  )
}
