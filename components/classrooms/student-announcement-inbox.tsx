'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowRight, CheckCheck, Clock, Megaphone, Pin, UserRound, BellRing } from 'lucide-react'
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
import { acknowledgeAssignmentReminder, getPendingAssignmentReminders } from '@/lib/actions/notifications'
import type { PendingAssignmentReminder } from '@/lib/assignment-reminders'
import { announcementReceiptKey, type PendingClassroomAnnouncement, type AcknowledgeAnnouncementAction } from '@/lib/classroom-announcement-acknowledgements'
import { isStudentNoticeSuspendedPath } from '@/lib/student-notice-path'
import { formatThaiDateTime } from '@/lib/thai-time'
import { linkify } from '@/lib/linkify'
import { cn } from '@/lib/utils'

const REMINDER_POLL_MS = 45_000
type ActiveNotice = { kind: 'announcement' | 'reminder'; key: string; pathname: string }
interface ReminderFeed { pathname: string | null; reminders: PendingAssignmentReminder[]; error?: string }

interface Props {
  initialPosts: PendingClassroomAnnouncement[]
  initialError?: string
  acknowledgeAction?: AcknowledgeAnnouncementAction
  /** Explicit opt-in keeps the existing announcement-only lab isolated. */
  remindersEnabled?: boolean
  loadReminderAction?: typeof getPendingAssignmentReminders
  acknowledgeReminderAction?: typeof acknowledgeAssignmentReminder
  pollReminders?: boolean
  /** Isolated fixtures can exercise entry/answer-route transitions. */
  pathnameOverride?: string
}

/** Announcements and missing-hand-in reminders share one automatic dialog.
 * Current-route reads and the server's eligibility check settle the latter. */
export function StudentAnnouncementInbox({
  initialPosts, initialError, acknowledgeAction = acknowledgeClassroomAnnouncement,
  remindersEnabled = false, loadReminderAction = getPendingAssignmentReminders,
  acknowledgeReminderAction = acknowledgeAssignmentReminder, pollReminders = true, pathnameOverride,
}: Props) {
  const router = useRouter()
  const currentPathname = usePathname()
  const pathname = pathnameOverride ?? currentPathname ?? ''
  const suspended = isStudentNoticeSuspendedPath(pathname)
  const [receipts, setReceipts] = useState<Set<string>>(() => new Set())
  const [reminderReceipts, setReminderReceipts] = useState<Set<string>>(() => new Set())
  const [reminderFeed, setReminderFeed] = useState<ReminderFeed>({ pathname: null, reminders: [] })
  const [reminderLoading, setReminderLoading] = useState(false)
  const [active, setActive] = useState<ActiveNotice | null>(null)
  const [deferred, setDeferred] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [visible, setVisible] = useState(false)
  const [otherDialogOpen, setOtherDialogOpen] = useState(true)
  const [pending, startTransition] = useTransition()
  const lastFocus = useRef<HTMLElement | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  const mutationPending = useRef(false)
  const pathRef = useRef(pathname)
  pathRef.current = pathname
  const actionsRef = useRef({ loadReminderAction, acknowledgeReminderAction, acknowledgeAction })
  actionsRef.current = { loadReminderAction, acknowledgeReminderAction, acknowledgeAction }
  const reloadReminders = useRef<() => void>(() => {})
  const remainingPosts = initialPosts.filter(post => !receipts.has(announcementReceiptKey(post.id, post.round)))
  const currentReminders = remindersEnabled && reminderFeed.pathname === pathname
    ? reminderFeed.reminders.filter(reminder => !reminderReceipts.has(reminder.id)) : []
  const post = active?.pathname === pathname && active.kind === 'announcement'
    ? remainingPosts.find(item => announcementReceiptKey(item.id, item.round) === active.key) : undefined
  const reminder = active?.pathname === pathname && active.kind === 'reminder'
    ? currentReminders.find(item => item.id === active.key) : undefined
  const open = hydrated && visible && !suspended && !deferred && Boolean(post || reminder)
  const meta = parseDescription(post?.classroomDescription ?? null)
  const cover = coverOf(meta)

  useEffect(() => {
    mounted.current = true
    setHydrated(true)
    const updateVisibility = () => setVisible(document.visibilityState === 'visible')
    const updateBlockingDialog = () => {
      // Only opening is gated. A nested confirmation or attachment belonging
      // to the active inbox must not dismiss its parent or steal its draft.
      const other = Array.from(document.querySelectorAll<HTMLElement>(
        '[data-slot="dialog-content"][data-open], dialog[open]',
      )).some(element => !element.hasAttribute('data-student-notice-dialog'))
      setOtherDialogOpen(other)
    }
    updateVisibility()
    updateBlockingDialog()
    const observer = new MutationObserver(updateBlockingDialog)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-open', 'open'] })
    document.addEventListener('visibilitychange', updateVisibility)
    return () => {
      mounted.current = false
      observer.disconnect()
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [])

  useEffect(() => {
    setActive(null)
    setDeferred(false)
    setConfirmClose(false)
    // Revisiting the same pathname after answering elsewhere still needs a
    // new eligibility read; a matching old pathname is not a fresh response.
    setReminderFeed({ pathname: null, reminders: [] })
  }, [pathname])

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    if (!remindersEnabled || suspended) {
      reloadReminders.current = () => {}
      setReminderLoading(false)
      return
    }

    async function refresh() {
      if (cancelled || inFlight || document.visibilityState !== 'visible'
        || pathRef.current !== pathname || isStudentNoticeSuspendedPath(pathRef.current)) return
      inFlight = true
      setReminderLoading(true)
      try {
        const result = await actionsRef.current.loadReminderAction()
        if (cancelled || !mounted.current || pathRef.current !== pathname) return
        setReminderFeed(result.error
          ? { pathname, reminders: [], error: result.error }
          : { pathname, reminders: result.reminders })
      } catch {
        if (!cancelled && mounted.current && pathRef.current === pathname) {
          setReminderFeed({ pathname, reminders: [], error: 'โหลดการเตือนงานไม่สำเร็จ กรุณาลองใหม่' })
        }
      } finally {
        inFlight = false
        if (!cancelled && mounted.current && pathRef.current === pathname) setReminderLoading(false)
      }
    }

    reloadReminders.current = () => { void refresh() }
    void refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const interval = pollReminders ? window.setInterval(onVisible, REMINDER_POLL_MS) : undefined
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      if (interval !== undefined) window.clearInterval(interval)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pathname, remindersEnabled, pollReminders, suspended])

  useEffect(() => {
    if (active && (active.pathname !== pathname || (!post && !reminder))) {
      setActive(null)
      setConfirmClose(false)
      return
    }
    if (active || !hydrated || !visible || suspended || deferred || pending || otherDialogOpen) return
    const nextPost = remainingPosts[0]
    if (nextPost) setActive({ kind: 'announcement', key: announcementReceiptKey(nextPost.id, nextPost.round), pathname })
    else if (!reminderFeed.error && currentReminders[0]) {
      setActive({ kind: 'reminder', key: currentReminders[0].id, pathname })
    }
  }, [active, post, reminder, pathname, hydrated, visible, suspended, deferred, pending, otherDialogOpen, remainingPosts, currentReminders, reminderFeed.error])

  useEffect(() => {
    if (open) {
      bodyRef.current?.scrollTo(0, 0)
      bodyRef.current?.focus({ preventScroll: true })
    }
  }, [open, active?.key])

  function requestClose() {
    returnFocus.current = lastFocus.current
    setConfirmClose(true)
  }

  function deferNotices() {
    setConfirmClose(false)
    setDeferred(true)
    setActive(null)
  }

  function acknowledge(goToWork = false) {
    if ((!post && !reminder) || mutationPending.current || suspended) return
    const currentPost = post
    const currentReminder = reminder
    const operationPath = pathname
    mutationPending.current = true
    startTransition(async () => {
      let acknowledged = false
      try {
        const result = currentPost
          ? await actionsRef.current.acknowledgeAction(currentPost.id, currentPost.round)
          : await actionsRef.current.acknowledgeReminderAction(currentReminder!.id)
        if (!mounted.current) return
        if (result.error || !result.success) {
          toast.error(result.error ?? (currentPost ? 'รับทราบประกาศไม่สำเร็จ กรุณาลองใหม่' : 'รับทราบการเตือนงานไม่สำเร็จ กรุณาลองใหม่'))
          if (currentPost && 'stale' in result && result.stale
            && pathRef.current === operationPath && !isStudentNoticeSuspendedPath(pathRef.current)) router.refresh()
          return
        }
        acknowledged = true
        if (currentPost) setReceipts(previous => new Set([...previous, announcementReceiptKey(currentPost.id, currentPost.round)]))
        else {
          setReminderReceipts(previous => new Set([...previous, currentReminder!.id]))
          window.dispatchEvent(new Event('korkru:notifications-changed'))
        }
        setActive(null)
        setConfirmClose(false)
        if (pathRef.current !== operationPath || isStudentNoticeSuspendedPath(pathRef.current)) return
        if (goToWork && currentReminder) {
          setDeferred(true)
          router.push(currentReminder.href)
        } else if (currentPost) router.refresh()
      } catch {
        if (mounted.current) {
          if (acknowledged) toast.warning('รับทราบแล้ว แต่ยังเปิดหน้าถัดไปไม่ได้ กรุณาลองเปิดใหม่')
          else toast.error(currentPost ? 'รับทราบประกาศไม่สำเร็จ กรุณาลองใหม่' : 'รับทราบการเตือนงานไม่สำเร็จ กรุณาลองใหม่')
        }
      }
      finally { mutationPending.current = false }
    })
  }

  const feedError = remindersEnabled && reminderFeed.pathname === pathname ? reminderFeed.error : undefined
  const errorsVisible = hydrated && visible && !suspended
  const reminderError = feedError && <p role="alert" className="text-sm text-destructive">
    {feedError} <Button type="button" variant="link" size="xs" disabled={reminderLoading} onClick={() => reloadReminders.current()}>ลองใหม่</Button>
  </p>

  return <>
    {errorsVisible && initialError && <p role="alert" className="mb-3 text-sm text-destructive">{initialError} <Button type="button" variant="link" size="xs" onClick={() => router.refresh()}>ลองใหม่</Button></p>}
    {errorsVisible && !reminder && reminderError && <div className="mb-3">{reminderError}</div>}
    <Dialog open={open} onOpenChange={(next, details) => {
      if (!next) { details.cancel(); if (!mutationPending.current) requestClose() }
    }}>
      <DialogContent data-student-notice-dialog className="gap-0 overflow-hidden p-0 sm:max-w-lg motion-reduce:animate-none" initialFocus={bodyRef}
        onFocusCapture={event => { lastFocus.current = event.target as HTMLElement }} aria-busy={pending}>
        {post ? <>
          <DialogHeader className={cn('relative gap-1.5 border-b px-4 py-3 pr-12', cover?.surface)}>
            <ClassroomCoverPattern patternKey={meta.coverPattern} placement="end" className="pointer-events-none absolute inset-0 size-full opacity-30" />
            <div className="relative flex items-center gap-2 text-xs font-medium">
              <Megaphone className="size-3.5" aria-hidden="true" /> ประกาศจากครู
              {post.pinned && <Badge variant="outline"><Pin aria-hidden="true" /> ปักหมุด</Badge>}
              <span className="ml-auto text-foreground/75">เหลือ {remainingPosts.length} ประกาศ</span>
            </div>
            <DialogTitle className={cn('relative flex items-center gap-2 text-lg font-bold leading-snug', cover?.text)}>
              <ClassroomIcon iconKey={meta.iconKey} className="size-6 shrink-0" />{post.classroomName}
            </DialogTitle>
            <DialogDescription className="relative flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground/75">
              <span className="flex items-center gap-1"><UserRound className="size-3" aria-hidden="true" />{post.authorName}</span>
              <span>ประกาศเมื่อ {formatThaiDateTime(post.createdAt)}</span>
            </DialogDescription>
          </DialogHeader>
          <div ref={bodyRef} className="max-h-[min(26rem,50dvh)] overflow-y-auto overscroll-contain px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" tabIndex={0} role="region" aria-label="เนื้อหาประกาศ">
            {post.remindedAt && <p className="mb-3 flex items-start gap-1.5 text-xs text-muted-foreground"><BellRing className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />ครูแจ้งเตือนอีกครั้งเมื่อ {formatThaiDateTime(post.remindedAt)}</p>}
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{linkify(post.body).map((part, index) => part.type === 'link'
              ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2">{part.value}</a> : part.value)}</p>
            <PostAttachments attachments={post.attachments} />
            {post.editedAt && <p className="mt-3 text-xs text-muted-foreground">แก้ไขล่าสุด {formatThaiDateTime(post.editedAt)}</p>}
          </div>
          <DialogFooter className="m-0 gap-2 rounded-none px-4 py-3">
            <Button type="button" variant="ghost" disabled={pending} className="pointer-coarse:min-h-[44px]" onClick={deferNotices}>ไว้ภายหลัง</Button>
            <Button type="button" disabled={pending} className="pointer-coarse:min-h-[44px]" onClick={() => acknowledge()}><CheckCheck data-icon="inline-start" aria-hidden="true" />{pending ? 'กำลังรับทราบ…' : 'รับทราบ'}</Button>
          </DialogFooter>
        </> : reminder ? <>
          <DialogHeader className="gap-1.5 border-b bg-primary/5 px-4 py-3 pr-12">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-primary">
              <BellRing className="size-3.5" aria-hidden="true" /> ครูเตือนให้ส่งงาน
              <span className="ml-auto text-muted-foreground">เหลือ {currentReminders.length} งาน</span>
            </div>
            <DialogTitle className="break-words text-lg font-bold leading-snug">{reminder.assignmentTitle}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>{reminder.classroomName}</span>
              {reminder.teacherName && <span className="inline-flex items-center gap-1"><UserRound className="size-3" aria-hidden="true" />{reminder.teacherName}</span>}
              <span>เตือนเมื่อ {formatThaiDateTime(reminder.createdAt)}</span>
            </DialogDescription>
          </DialogHeader>
          <div ref={bodyRef} className="flex max-h-[min(26rem,50dvh)] flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" tabIndex={0} role="region" aria-label="รายละเอียดการเตือนงาน">
            <Badge variant="statusWarning">{reminder.inProgress ? 'กำลังทำ · ยังไม่ส่ง' : 'ยังไม่ได้ส่งงาน'}</Badge>
            <p className="text-sm leading-relaxed">{reminder.inProgress
              ? 'คุณเริ่มงานนี้แล้ว แต่ยังไม่ได้ส่งคำตอบ สามารถกลับไปทำต่อได้'
              : 'ครูแจ้งเตือนให้ทำงานนี้ กรุณาเข้าไปทำให้เสร็จและส่งคำตอบ'}</p>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{reminder.endAt ? `ปิดรับ ${formatThaiDateTime(reminder.endAt)}` : 'ไม่กำหนดเวลาปิดรับ'}</p>
            {reminderError}
          </div>
          <DialogFooter className="m-0 flex-row flex-wrap items-center gap-2 rounded-none px-4 py-3">
            <Button type="button" variant="ghost" disabled={pending} className="mr-auto pointer-coarse:min-h-[44px]" onClick={deferNotices}>ไว้ภายหลัง</Button>
            <Button type="button" variant="outline" disabled={pending} className="pointer-coarse:min-h-[44px]" onClick={() => acknowledge()}><CheckCheck data-icon="inline-start" aria-hidden="true" />รับทราบ</Button>
            <Button type="button" disabled={pending} className="pointer-coarse:min-h-[44px]" onClick={() => acknowledge(true)}>
              {pending ? 'กำลังดำเนินการ…' : reminder.inProgress ? 'ทำต่อ' : 'ไปทำงาน'}<ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          </DialogFooter>
        </> : null}
      </DialogContent>
      <ConfirmDialog open={confirmClose && open} onOpenChange={setConfirmClose} title={post ? 'รับทราบประกาศภายหลัง?' : 'ดูการเตือนงานภายหลัง?'}
        description={post ? 'ประกาศและการเตือนงานที่ยังไม่รับทราบจะแสดงอีกครั้งเมื่อคุณเข้ามาใหม่' : 'การเตือนนี้ยังไม่ถูกทำเครื่องหมายว่าอ่านแล้ว และจะแสดงอีกครั้งเมื่อคุณเข้ามาใหม่'}
        cancelLabel={post ? 'อ่านประกาศต่อ' : 'ดูการเตือนต่อ'} confirmLabel="ไว้ภายหลัง"
        finalFocus={open ? returnFocus : undefined} onConfirm={deferNotices} />
    </Dialog>
  </>
}
