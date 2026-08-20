'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { startSubmission } from '@/lib/actions/submissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AccessCodeForm({ assignmentId }: { assignmentId: string }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!code.trim()) return
    startTransition(async () => {
      const res = await startSubmission(assignmentId, code.trim())
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="max-w-sm mx-auto mt-16 text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
        <KeyRound className="w-6 h-6" />
      </div>
      <div>
        <p className="text-lg font-semibold text-foreground">กรอกรหัสผ่านเข้าสอบ</p>
        <p className="text-sm text-muted-foreground mt-1">ครูผู้สอนจะแจ้งรหัสนี้ในห้องเรียน</p>
      </div>
      <div className="space-y-2">
        <Input
          value={code}
          onChange={e => { setCode(e.target.value); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="รหัสผ่าน"
          autoFocus
          className="text-center"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={submit} disabled={isPending || !code.trim()} className="w-full">
          {isPending ? 'กำลังตรวจสอบ...' : 'เข้าสอบ'}
        </Button>
      </div>
    </div>
  )
}
