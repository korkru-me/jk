'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { login } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, null)

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
          {state.error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">อีเมล</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="teacher@school.ac.th"
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
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
      </Button>

      <p className="text-center text-sm text-gray-600">
        ยังไม่มีบัญชี?{' '}
        <Link href="/register" className="text-blue-600 hover:underline font-medium">
          สมัครใช้งาน
        </Link>
      </p>
    </form>
  )
}
