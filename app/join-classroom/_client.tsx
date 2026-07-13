'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { acceptClassroomInvitation } from '@/lib/actions/co-teachers'
import { Button } from '@/components/ui/button'
import type { CoTeacherPermission } from '@/lib/types'

const PERM_LABEL: Record<CoTeacherPermission, string> = {
  admin: 'แอดมินเต็มตัว',
  manage: 'ผู้ช่วยสอน (จัดการข้อสอบ)',
  view: 'ดูได้อย่างเดียว',
}

interface Props {
  token: string
  classroomName: string
  permission: CoTeacherPermission
}

export function JoinClassroomClient({ token, classroomName, permission }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [joined, setJoined] = useState(false)
  const [classroomId, setClassroomId] = useState<string | null>(null)

  function handleJoin() {
    startTransition(async () => {
      const res = await acceptClassroomInvitation(token)
      if (res.error) {
        toast.error(res.error)
      } else {
        setJoined(true)
        setClassroomId(res.classroomId ?? null)
        toast.success(`เข้าร่วม ${classroomName} แล้ว`)
        setTimeout(() => router.push(res.classroomId ? `/classrooms/${res.classroomId}` : '/classrooms'), 1500)
      }
    })
  }

  if (joined) {
    return (
      <div className="text-center space-y-3">
        <div className="text-4xl">🎉</div>
        <h1 className="text-lg font-semibold text-gray-900">เข้าร่วมสำเร็จ!</h1>
        <p className="text-sm text-gray-500">กำลังพาคุณไปหน้าห้องเรียน…</p>
      </div>
    )
  }

  return (
    <div className="text-center space-y-5">
      <div className="text-4xl">👩‍🏫</div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-gray-900">คุณได้รับเชิญเป็นผู้ช่วยสอน</h1>
        <p className="text-sm text-gray-500">
          เข้าร่วมห้องเรียน <span className="font-medium text-gray-800">{classroomName}</span> ในฐานะ{' '}
          <span className="font-medium text-blue-700">{PERM_LABEL[permission] ?? permission}</span>
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
