'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, Megaphone, Pin, UserRound, BellRing } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PostAttachments } from '@/components/classrooms/post-attachments'
import { ClassroomIcon } from '@/components/classrooms/classroom-icon'
import { ClassroomCoverPattern } from '@/components/classrooms/classroom-cover-pattern'
import { coverOf, parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { acknowledgeClassroomAnnouncement } from '@/lib/actions/classroom-announcement-acknowledgements'
import { announcementReceiptKey, type PendingClassroomAnnouncement, type AcknowledgeAnnouncementAction } from '@/lib/classroom-announcement-acknowledgements'
import { formatThaiDateTime } from '@/lib/thai-time'
import { linkify } from '@/lib/linkify'
import { cn } from '@/lib/utils'

export function StudentAnnouncementInbox({ initialPosts, initialError, acknowledgeAction = acknowledgeClassroomAnnouncement }: {
  initialPosts: PendingClassroomAnnouncement[]
  initialError?: string
  acknowledgeAction?: AcknowledgeAnnouncementAction
}) {
  const router = useRouter()
  const [receipts, setReceipts] = useState<Set<string>>(() => new Set())
  const [deferred, setDeferred] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [pending, startTransition] = useTransition()
  const lastFocus = useRef<HTMLElement | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const remaining = initialPosts.filter(p => !receipts.has(announcementReceiptKey(p.id, p.round)))
  const post = remaining[0]
  const open = !!post && !deferred
  const meta = parseDescription(post?.classroomDescription ?? null)
  const cover = coverOf(meta)

  useEffect(() => { bodyRef.current?.scrollTo(0, 0) }, [post?.id, post?.round])
  function requestClose() {
    returnFocus.current = lastFocus.current
    setConfirmClose(true)
  }
  function acknowledge() {
    if (!post || pending) return
    startTransition(async () => {
      try {
        const result = await acknowledgeAction(post.id, post.round)
        if (result.error || !result.success) {
          toast.error(result.error ?? 'รับทราบประกาศไม่สำเร็จ กรุณาลองใหม่')
          if (result.stale) router.refresh()
          return
        }
        setReceipts(previous => new Set([...previous, announcementReceiptKey(post.id, post.round)]))
        router.refresh()
      } catch { toast.error('รับทราบประกาศไม่สำเร็จ กรุณาลองใหม่') }
    })
  }
  return (
    <>
      {initialError && <p role="alert" className="mb-3 text-sm text-destructive">{initialError} <Button variant="link" size="xs" onClick={() => router.refresh()}>ลองใหม่</Button></p>}
      <Dialog open={open} onOpenChange={(next, details) => {
        if (!next) { details.cancel(); if (!pending) requestClose() }
      }}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg motion-reduce:animate-none"
          onFocusCapture={event => { lastFocus.current = event.target as HTMLElement }} aria-busy={pending}>
          {post && <>
            <DialogHeader className={cn('relative gap-2 border-b p-5 pr-12', cover?.surface)}>
              <ClassroomCoverPattern patternKey={meta.coverPattern} placement="end" className="pointer-events-none absolute inset-0 size-full opacity-30" />
              <div className="relative flex items-center gap-2 text-xs font-medium">
                <Megaphone className="size-3.5" aria-hidden="true" /> ประกาศจากครู
                {post.pinned && <Badge variant="outline"><Pin aria-hidden="true" /> ปักหมุด</Badge>}
                <span className="ml-auto text-foreground/75">เหลือ {remaining.length} ประกาศ</span>
              </div>
              <DialogTitle className={cn('relative flex items-center gap-2 text-lg font-bold leading-snug', cover?.text)}>
                <ClassroomIcon iconKey={meta.iconKey} className="size-6 shrink-0" />{post.classroomName}
              </DialogTitle>
              <DialogDescription className="relative flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground/75">
                <span className="flex items-center gap-1"><UserRound className="size-3" aria-hidden="true" />{post.authorName}</span>
                <span>ประกาศเมื่อ {formatThaiDateTime(post.createdAt)}</span>
              </DialogDescription>
            </DialogHeader>
            <div ref={bodyRef} className="max-h-[min(26rem,50dvh)] overflow-y-auto overscroll-contain p-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" tabIndex={0} role="region" aria-label="เนื้อหาประกาศ">
              {post.remindedAt && <p className="mb-3 flex items-start gap-1.5 text-xs text-muted-foreground"><BellRing className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />ครูแจ้งเตือนอีกครั้งเมื่อ {formatThaiDateTime(post.remindedAt)}</p>}
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{linkify(post.body).map((part, i) => part.type === 'link'
                ? <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2">{part.value}</a> : part.value)}</p>
              <PostAttachments attachments={post.attachments} />
              {post.editedAt && <p className="mt-3 text-xs text-muted-foreground">แก้ไขล่าสุด {formatThaiDateTime(post.editedAt)}</p>}
            </div>
            <DialogFooter className="m-0 gap-2 rounded-none">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setDeferred(true)}>ไว้ภายหลัง</Button>
              <Button type="button" disabled={pending} onClick={acknowledge}><CheckCheck className="size-4" aria-hidden="true" />{pending ? 'กำลังรับทราบ…' : 'รับทราบ'}</Button>
            </DialogFooter>
          </>}
        </DialogContent>
        <ConfirmDialog open={confirmClose} onOpenChange={setConfirmClose} title="รับทราบประกาศภายหลัง?"
          description="ประกาศที่ยังไม่รับทราบจะแสดงอีกครั้งเมื่อคุณเข้ามาใหม่" cancelLabel="อ่านประกาศต่อ" confirmLabel="ไว้ภายหลัง"
          finalFocus={open ? returnFocus : undefined} onConfirm={() => setDeferred(true)} />
      </Dialog>
    </>
  )
}
