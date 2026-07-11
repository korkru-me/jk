'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { register } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export function RegisterForm() {
  const [loading, setLoading] = useState(false)
  const [selectedType, setSelectedType] = useState<'teacher' | 'tutor' | 'student'>('teacher')
  const router = useRouter()

  const role = selectedType === 'student' ? 'student' : 'teacher'
  const instructorType = selectedType === 'student' ? null : selectedType

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const password = formData.get('password') as string

    if (password.length < 6) {
      toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
      setLoading(false)
      return
    }

    formData.set('role', role)
    if (instructorType) formData.set('instructor_type', instructorType)

    try {
      const result = await register(formData)

      if (result?.error) {
        toast.error(result.error === 'User already registered'
          ? 'อีเมลนี้มีบัญชีอยู่แล้ว'
          : result.error
        )
        setLoading(false)
        return
      }

      router.push('/dashboard')
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Role selector */}
      <div className="space-y-2">
        <Label>ฉันคือ</Label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'teacher', label: 'ครู', icon: '👨‍🏫' },
            { value: 'tutor', label: 'ติวเตอร์', icon: '📚' },
            { value: 'student', label: 'นักเรียน', icon: '🎒' },
          ].map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setSelectedType(r.value as 'teacher' | 'tutor' | 'student')}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-colors ${
                selectedType === r.value
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="text-2xl">{r.icon}</span>
              <span className="text-sm font-medium">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="full_name">ชื่อ-นามสกุล</Label>
        <Input
          id="full_name"
          name="full_name"
          placeholder={
            selectedType === 'teacher' ? 'ครูสมชาย ใจดี' :
            selectedType === 'tutor' ? 'สมชาย ใจดี (ติวเตอร์)' :
            'สมชาย ใจดี'
          }
          required
          autoComplete="name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">อีเมล</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="example@school.ac.th"
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="อย่างน้อย 6 ตัวอักษร"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'กำลังสมัคร...' : 'สมัครใช้งาน'}
      </Button>

      <p className="text-center text-sm text-gray-600">
        มีบัญชีอยู่แล้ว?{' '}
        <Link href="/login" className="text-blue-600 hover:underline font-medium">
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  )
}
