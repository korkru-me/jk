'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BellRing, CheckCheck, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { remindClassroomAnnouncement } from '@/lib/actions/classroom-announcement-acknowledgements'
import type { AnnouncementAcknowledgementStatus, RemindAnnouncementAction } from '@/lib/classroom-announcement-acknowledgements'

export function AnnouncementAcknowledgementPanel({ postId, students, status, remindAction = remindClassroomAnnouncement }: {
  postId: string
  students: { id: string; full_name: string }[]
  status: AnnouncementAcknowledgementStatus
  remindAction?: RemindAnnouncementAction
}) {
  const [current, setCurrent] = useState(status)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [confirm, confirmation] = useConfirm()
  const router = useRouter()
  useEffect(() => setCurrent(status), [status])
  const acknowledged = new Set(current.studentIds)
  const missing = students.filter(s => !acknowledged.has(s.id))
  const count = students.length - missing.length
  async function remind() {
    if (pending || !(await confirm({ title: 'แจ้งเตือนประกาศนี้อีกครั้ง?', description: 'นักเรียนทุกคนในห้องจะต้องกดรับทราบใหม่ จำนวนรับทราบในรอบใหม่จะเริ่มที่ 0 โดยประวัติรอบก่อนยังอยู่', confirmLabel: 'แจ้งเตือนอีกครั้ง' }))) return
    startTransition(async () => {
      try {
        const result = await remindAction(postId)
        if (result.error || !result.round || !result.remindedAt) { toast.error(result.error ?? 'แจ้งเตือนซ้ำไม่สำเร็จ'); return }
        setCurrent({ round: result.round, remindedAt: result.remindedAt, studentIds: [] })
        toast('แจ้งเตือนให้นักเรียนรับทราบใหม่แล้ว')
        router.refresh()
      } catch { toast.error('แจ้งเตือนซ้ำไม่สำเร็จ กรุณาลองใหม่') }
    })
  }
  return (
    <div className="flex items-center gap-1">
      <HoverCard open={open} onOpenChange={setOpen}>
        <HoverCardTrigger render={<Button type="button" variant="ghost" size="xs" />} className="gap-1.5 px-1 text-muted-foreground"
          aria-expanded={open} onClick={() => setOpen(value => !value)}>
          <CheckCheck className="size-3.5" aria-hidden="true" />รับทราบแล้ว {count}/{students.length} คน<ChevronDown className="size-3" aria-hidden="true" />
        </HoverCardTrigger>
        <HoverCardContent align="start" className="max-w-[calc(100vw-2rem)] p-3 text-xs" role="region" aria-label="สถานะรับทราบประกาศ">
          <p className="mb-1 font-medium">รอบแจ้งเตือนที่ {current.round} · นับจากการกดรับทราบ</p>
          <p className="max-w-72 whitespace-normal leading-relaxed">{students.length === 0 ? 'ยังไม่มีนักเรียนในห้อง' : missing.length === 0 ? 'นักเรียนทุกคนรับทราบแล้ว' : `ยังไม่รับทราบ: ${missing.map(s => s.full_name).join(', ')}`}</p>
        </HoverCardContent>
      </HoverCard>
      <IconButton size="xs" label="แจ้งเตือนประกาศนี้อีกครั้ง" disabled={pending || students.length === 0} onClick={() => void remind()}><BellRing className="size-3.5" /></IconButton>
      {confirmation}
    </div>
  )
}
