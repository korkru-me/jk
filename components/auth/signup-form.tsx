'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

import { register } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const SURVEY_ROLES = [
  { value: 'teacher', label: 'ครูผู้สอน', icon: '👨‍🏫', desc: 'ในโรงเรียนหรือมหาวิทยาลัย' },
  { value: 'tutor', label: 'ติวเตอร์อิสระ', icon: '📚', desc: 'หรือสถาบันกวดวิชา' },
  { value: 'admin', label: 'ผู้บริหารสถานศึกษา', icon: '🏫', desc: 'ผู้อำนวยการ / หัวหน้ากลุ่มสาระ' },
  { value: 'student', label: 'นักเรียน', icon: '🎒', desc: 'ม.ต้น / ม.ปลาย / มหาวิทยาลัย' },
  { value: 'other', label: 'อื่นๆ', icon: '✏️', desc: 'บทบาทที่ไม่ได้ระบุ' },
] as const

const schema = z
  .object({
    full_name: z.string().min(2, 'กรุณากรอกชื่อ-นามสกุล'),
    email: z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
    password: z
      .string()
      .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
      .regex(/[A-Za-z]/, 'รหัสผ่านต้องมีตัวอักษรอย่างน้อย 1 ตัว')
      .regex(/[0-9]/, 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว'),
    survey_role: z.string().min(1, 'กรุณาเลือกบทบาทของคุณ'),
    role_custom: z.string().optional(),
    agreed: z.literal(true, {
      message: 'กรุณายอมรับเงื่อนไขการให้บริการก่อนสมัคร',
    }),
  })
  .superRefine((data, ctx) => {
    if (data.survey_role === 'other' && !data.role_custom?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['role_custom'],
        message: 'กรุณาระบุบทบาทของคุณ',
      })
    }
  })

type FormValues = z.infer<typeof schema>

export function SignupForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register: reg,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { survey_role: '' },
  })

  const selectedRole = watch('survey_role')
  const agreed = watch('agreed')

  async function onSubmit(values: FormValues) {
    setLoading(true)
    const fd = new FormData()
    fd.set('full_name', values.full_name)
    fd.set('email', values.email)
    fd.set('password', values.password)
    fd.set('survey_role', values.survey_role)
    if (values.role_custom) fd.set('role_custom', values.role_custom)

    try {
      const result = await register(fd)
      if (result?.error) {
        toast.error(
          result.error === 'User already registered'
            ? 'อีเมลนี้มีบัญชีอยู่แล้ว'
            : result.error,
        )
        setLoading(false)
        return
      }
      toast.success('สมัครสมาชิกสำเร็จ! ยินดีต้อนรับสู่ KorKru')
      router.push('/dashboard')
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {/* Role selection */}
      <div className="space-y-2">
        <Label>คุณใช้งานระบบในฐานะอะไร?</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SURVEY_ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => {
                setValue('survey_role', r.value, { shouldValidate: true })
                if (r.value !== 'other') setValue('role_custom', '')
              }}
              className={[
                'flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-all',
                selectedRole === r.value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600',
              ].join(' ')}
            >
              <span className="text-xl">{r.icon}</span>
              <span className="text-center leading-tight text-xs font-semibold">{r.label}</span>
              <span className="text-center leading-tight text-[10px] opacity-60 hidden sm:block">
                {r.desc}
              </span>
            </button>
          ))}
        </div>
        {errors.survey_role && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.survey_role.message}</p>
        )}
      </div>

      {/* Other — custom text */}
      {selectedRole === 'other' && (
        <div className="space-y-1.5">
          <Label htmlFor="role_custom">โปรดระบุ</Label>
          <Input
            id="role_custom"
            placeholder="เช่น นักวิชาการ, ผู้สร้างเนื้อหา"
            {...reg('role_custom')}
          />
          {errors.role_custom && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.role_custom.message}</p>
          )}
        </div>
      )}

      {/* Full name */}
      <div className="space-y-1.5">
        <Label htmlFor="full_name">ชื่อ-นามสกุล</Label>
        <Input
          id="full_name"
          placeholder="สมชาย ใจดี"
          autoComplete="name"
          {...reg('full_name')}
        />
        {errors.full_name && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.full_name.message}</p>
        )}
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email">อีเมล</Label>
        <Input
          id="email"
          type="email"
          placeholder="example@school.ac.th"
          autoComplete="email"
          {...reg('email')}
        />
        {errors.email && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>
        )}
      </div>

      {/* Password with visibility toggle */}
      <div className="space-y-1.5">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="อย่างน้อย 8 ตัว มีตัวอักษร + ตัวเลข"
            autoComplete="new-password"
            className="pr-10"
            {...reg('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors dark:hover:text-slate-300"
            aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.password.message}</p>
        )}
      </div>

      {/* Terms & Privacy checkbox */}
      <div className="space-y-1.5">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            {...reg('agreed')}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
          />
          <span className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            ฉันยอมรับ{' '}
            <a
              href="#"
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              onClick={(e) => e.stopPropagation()}
            >
              เงื่อนไขการให้บริการ (Terms of Service)
            </a>{' '}
            และ{' '}
            <a
              href="#"
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              onClick={(e) => e.stopPropagation()}
            >
              นโยบายความเป็นส่วนตัว (Privacy Policy)
            </a>
          </span>
        </label>
        {errors.agreed && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.agreed.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={loading || !agreed}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            กำลังสมัครสมาชิก...
          </>
        ) : (
          'สมัครสมาชิก'
        )}
      </Button>

      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        มีบัญชีอยู่แล้ว?{' '}
        <Link href="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  )
}
