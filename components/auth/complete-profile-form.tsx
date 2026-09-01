'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { completeProfile } from '@/lib/actions/auth'
import {
  completeProfileSchema,
  type AccountRole,
  type CompleteProfileInput,
} from '@/lib/auth/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ACCOUNT_TYPES = [
  { value: 'teacher', label: 'ครูผู้สอน', icon: '👨‍🏫' },
  { value: 'student', label: 'นักเรียน', icon: '🎒' },
] as const

type Props = {
  defaultName: string
  defaultRole?: AccountRole
}

export function CompleteProfileForm({ defaultName, defaultRole }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CompleteProfileInput>({
    resolver: zodResolver(completeProfileSchema),
    defaultValues: { full_name: defaultName, role: defaultRole },
  })

  const selectedRole = watch('role')

  async function onSubmit(values: CompleteProfileInput) {
    setLoading(true)
    const formData = new FormData()
    formData.set('role', values.role)
    formData.set('full_name', values.full_name)

    const result = await completeProfile(formData)
    if (result.error) {
      toast.error(result.error)
      setLoading(false)
      return
    }

    toast.success('ตั้งค่าบัญชีเรียบร้อยแล้ว')
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label>คุณใช้งานระบบในฐานะอะไร?</Label>
        <div className="grid grid-cols-2 gap-2">
          {ACCOUNT_TYPES.map((accountType) => (
            <Button
              key={accountType.value}
              type="button"
              variant="outline"
              size="lg"
              aria-pressed={selectedRole === accountType.value}
              onClick={() => setValue('role', accountType.value, { shouldValidate: true })}
              className={[
                'flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-semibold transition-colors',
                selectedRole === accountType.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-ring',
              ].join(' ')}
            >
              <span aria-hidden>{accountType.icon}</span>
              {accountType.label}
            </Button>
          ))}
        </div>
        {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="full_name">ชื่อที่ใช้แสดง</Label>
        <Input id="full_name" autoComplete="name" {...register('full_name')} />
        {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            กำลังบันทึก...
          </>
        ) : (
          'เริ่มใช้งาน KorKru'
        )}
      </Button>
    </form>
  )
}
