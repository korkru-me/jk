'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { joinByToken } from '@/lib/actions/org-members'
import { Button } from '@/components/ui/button'

const ROLE_LABEL: Record<string, string> = {
  owner: 'เจ้าของ',
  admin: 'ผู้ดูแล',
  teacher: 'ครู',
  student: 'นักเรียน',
}

interface Props {
  token: string
  orgName: string
  role: string
}

export function JoinOrgClient({ token, orgName, role }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [joined, setJoined] = useState(false)

  function handleJoin() {
    startTransition(async () => {
      const res = await joinByToken(token)
      if (res.error) {
        toast.error(res.error)
      } else {
        setJoined(true)
        toast.success(`เข้าร่วม ${orgName} แล้ว`)
        setTimeout(() => router.push('/dashboard'), 1500)
      }
    })
  }

  if (joined) {
    return (
      <div className="text-center space-y-3">
        <div className="text-4xl">🎉</div>
        <h1 className="text-lg font-semibold text-gray-900">เข้าร่วมสำเร็จ!</h1>
        <p className="text-sm text-gray-500">กำลังพาคุณไปหน้าหลัก…</p>
      </div>
    )
  }

  return (
    <div className="text-center space-y-5">
      <div className="text-4xl">🏫</div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-gray-900">คุณได้รับการเชิญ</h1>
        <p className="text-sm text-gray-500">
          เข้าร่วม <span className="font-medium text-gray-800">{orgName}</span> ในฐานะ{' '}
          <span className="font-medium text-blue-700">{ROLE_LABEL[role] ?? role}</span>
        </p>
      </div>
      <Button onClick={handleJoin} disabled={pending} className="w-full">
        {pending ? 'กำลังเข้าร่วม…' : 'ยืนยันเข้าร่วม'}
      </Button>
      <a href="/dashboard" className="block text-xs text-gray-400 hover:underline">
        ยกเลิก
      </a>
    </div>
  )
}
