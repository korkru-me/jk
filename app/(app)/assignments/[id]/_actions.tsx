'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateAssignmentStatus, deleteAssignment } from '@/lib/actions/assignments'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AssignmentStatus } from '@/lib/types'

interface Props {
  assignmentId: string
  currentStatus: AssignmentStatus
  mode: 'online' | 'print'
}

export function AssignmentActions({ assignmentId, currentStatus, mode }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function changeStatus(status: AssignmentStatus) {
    setLoading(true)
    const result = await updateAssignmentStatus(assignmentId, status)
    if (result?.error) toast.error(result.error)
    else {
      toast.success(
        status === 'published' ? 'เผยแพร่ชุดข้อสอบแล้ว' : 'ปิดชุดข้อสอบแล้ว'
      )
      router.refresh()
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm('ลบชุดข้อสอบนี้? ข้อมูลการสอบทั้งหมดจะถูกลบด้วย')) return
    setLoading(true)
    await deleteAssignment(assignmentId)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {currentStatus === 'draft' && (
        <Button onClick={() => changeStatus('published')} disabled={loading} className="bg-green-600 hover:bg-green-700">
          เผยแพร่
        </Button>
      )}
      {currentStatus === 'published' && (
        <Button onClick={() => changeStatus('closed')} disabled={loading} variant="destructive">
          ปิดการสอบ
        </Button>
      )}
      {mode === 'print' && (
        <Link
          href={`/assignments/${assignmentId}/print`}
          target="_blank"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          🖨️ พิมพ์ใบงาน
        </Link>
      )}
      <Link
        href={`/assignments/${assignmentId}/results`}
        className={cn(buttonVariants({ variant: 'outline' }))}
      >
        📊 ดูคะแนน
      </Link>
      <Button
        variant="outline"
        onClick={handleDelete}
        disabled={loading}
        className="text-red-600 border-red-200 hover:bg-red-50 ml-auto"
      >
        ลบ
      </Button>
    </div>
  )
}
