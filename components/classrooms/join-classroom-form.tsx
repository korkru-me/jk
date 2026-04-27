'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { joinClassroom } from '@/lib/actions/classrooms'

export function JoinClassroomForm() {
  const [code, setCode] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) { toast.error('กรอกรหัสห้องเรียน'); return }
    startTransition(async () => {
      const res = await joinClassroom(code.trim())
      if (res?.error) toast.error(res.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="รหัส 6 หลัก เช่น AB3X7Y"
        maxLength={6}
        className="font-mono uppercase tracking-widest"
      />
      <Button type="submit" disabled={isPending} className="shrink-0">
        {isPending ? '...' : 'เข้าร่วม'}
      </Button>
    </form>
  )
}
