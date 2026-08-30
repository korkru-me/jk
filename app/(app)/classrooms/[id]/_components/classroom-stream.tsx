'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  MoreVertical, Pin, PinOff, Pencil, Trash2, Send, MessageCircle, Link2, Megaphone,
  Paperclip, Download, Eye, ChevronDown, ChevronUp, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  createClassroomPost, updateClassroomPost, togglePinClassroomPost, deleteClassroomPost,
  addComment, markPostsSeen,
} from '@/lib/actions/classroom-posts'
import { linkify, shortenUrl } from '@/lib/linkify'
import {
  attachmentKindLabel, formatFileSize, isImageAttachment, shortenFileName,
  type PostAttachment,
} from '@/lib/attachment-display'
import type { ClassroomPost } from '@/lib/types'
import { IconButton } from '@/components/ui/icon-button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Card } from '@/components/ui/card'
import { PostAttach } from '@/components/classrooms/post-attach'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * `page` — the standing list a student scrolls, one card per announcement.
 * `panel` — the bounded box on a teacher's ภาพรวม: composer pinned at the top,
 * announcements scrolling inside their own frame so a busy classroom cannot
 * push the rest of the dashboard off the screen.
 */
type StreamVariant = 'page' | 'panel'

export interface StreamStudent { id: string; full_name: string }

interface Props {
  classroomId: string
  canPost: boolean
  initialPosts: ClassroomPost[]
  variant?: StreamVariant
  /** How tall the scrolling area may get, `panel` only. */
  maxHeightClass?: string
  /** Heading on the panel frame. A homeroom calls this channel something else. */
  title?: string
  /** Teaching side: the roster, for "who has not seen this yet". */
  students?: StreamStudent[]
  /** Teaching side: student ids that have seen each post, keyed by post id. */
  seenByPost?: Record<string, string[]>
  /** Teaching side: other classrooms the same announcement can go to. */
  crossPostTargets?: { id: string; name: string }[]
  /** Student side: record that these announcements reached the screen. */
  trackSeen?: boolean
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

export function ClassroomStream({
  classroomId, canPost, initialPosts, variant = 'page', maxHeightClass = 'max-h-[420px]',
  title = 'ประกาศห้องเรียน',
  students = [], seenByPost = {}, crossPostTargets = [], trackSeen = false,
}: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<PostAttachment[]>([])
  const [alsoIn, setAlsoIn] = useState<string[]>([])
  const [showTargets, setShowTargets] = useState(false)
  const [isPending, startTransition] = useTransition()

  const isPanel = variant === 'panel'
  const canSubmit = draft.trim().length > 0 || attachments.length > 0

  function submitPost() {
    if (!canSubmit) return
    startTransition(async () => {
      const res = await createClassroomPost(classroomId, draft, attachments, alsoIn)
      if (res?.error) { toast.error(res.error); return }
      setDraft('')
      setAttachments([])
      setAlsoIn([])
      setShowTargets(false)
      // Say where it actually landed. A cross-post that reached three rooms out
      // of four must not report itself as a plain success.
      const extra = (res?.postedTo ?? 1) - 1
      toast.success(extra > 0 ? `โพสต์ประกาศแล้ว (ห้องนี้ + อีก ${extra} ห้อง)` : 'โพสต์ประกาศแล้ว')
      if (res?.missed) toast.error(`มี ${res.missed} ห้องที่โพสต์ไม่สำเร็จ — ตรวจสิทธิ์ในห้องนั้นอีกครั้ง`)
      router.refresh()
    })
  }

  const composer = canPost && (
    <div className={cn('space-y-2.5', isPanel ? 'px-4 py-3 border-b border-border' : '')}>
      <Textarea
        placeholder="ประกาศอะไรถึงห้องเรียนนี้... วางลิงก์ในข้อความได้เลย"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        className={isPanel ? 'min-h-16' : 'min-h-20'}
      />

      {crossPostTargets.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="xs"
            className="gap-1 px-1 text-muted-foreground"
            onClick={() => setShowTargets(open => !open)}
          >
            <Users className="w-3.5 h-3.5" />
            {alsoIn.length > 0 ? `โพสต์ไปอีก ${alsoIn.length} ห้อง` : 'โพสต์ไปห้องอื่นด้วย'}
            {showTargets ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
          {showTargets && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {crossPostTargets.map(target => {
                const picked = alsoIn.includes(target.id)
                return (
                  <Button
                    key={target.id}
                    variant={picked ? 'default' : 'outline'}
                    size="xs"
                    onClick={() => setAlsoIn(ids => picked ? ids.filter(id => id !== target.id) : [...ids, target.id])}
                  >
                    {target.name}
                  </Button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex items-end justify-between gap-2 flex-wrap">
        <PostAttach attachments={attachments} onChange={setAttachments} disabled={isPending} />
        <Button size="sm" className="gap-1.5" disabled={isPending || !canSubmit} onClick={submitPost}>
          <Send className="w-3.5 h-3.5" /> โพสต์ประกาศ
        </Button>
      </div>
    </div>
  )

  const emptyState = (
    <div className={cn('text-center', isPanel ? 'px-4 py-8' : '')}>
      <p className="text-3xl mb-3">📣</p>
      <p className="font-semibold">ยังไม่มีประกาศ</p>
      <p className="text-sm text-muted-foreground mt-1">
        {canPost ? 'โพสต์ประกาศแรกถึงห้องเรียนนี้ได้เลย' : 'ครูจะประกาศข่าวสารต่าง ๆ ที่นี่'}
      </p>
    </div>
  )

  const list = initialPosts.map(post => (
    <PostCard
      key={post.id}
      post={post}
      classroomId={classroomId}
      canManage={canPost}
      variant={variant}
      students={students}
      seenBy={seenByPost[post.id] ?? []}
      trackSeen={trackSeen}
    />
  ))

  if (isPanel) {
    return (
      <Card className="overflow-hidden">
        {/* The board has no tab of its own on either side, so it says what it is. */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Megaphone className="w-3.5 h-3.5" /> {title}
          </h2>
          <span className="text-xs text-muted-foreground shrink-0">
            {initialPosts.length > 0 ? `${initialPosts.length} ประกาศ` : 'ยังไม่มีประกาศ'}
            {/* The hint only earns its space where there is space. */}
            <span className="hidden sm:inline">{initialPosts.length > 0 ? ' · เลื่อนดูในกรอบนี้' : ''}</span>
          </span>
        </div>
        {composer}
        {initialPosts.length === 0 ? emptyState : (
          <div className={cn('overflow-y-auto divide-y divide-border', maxHeightClass)}>{list}</div>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {canPost && <Card padding="md">{composer}</Card>}

      {initialPosts.length === 0 ? (
        <Card edge="dashed" padding="2xl">{emptyState}</Card>
      ) : (
        <div className="space-y-3">{list}</div>
      )}
    </div>
  )
}

/** Announcement text with its URLs turned into real links. */
function PostBody({ body }: { body: string }) {
  if (!body) return null
  return (
    <p className="text-sm mt-2 whitespace-pre-wrap leading-relaxed break-words">
      {linkify(body).map((segment, i) => (
        segment.type === 'text' ? segment.value : (
          <a
            key={i}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2 inline-flex items-baseline gap-0.5"
          >
            <Link2 className="w-3 h-3 self-center" />{shortenUrl(segment.value)}
          </a>
        )
      ))}
    </p>
  )
}

/**
 * Pictures show themselves; everything else is a file to take away.
 *
 * The `?download=` parameter is what makes Storage send the teacher's original
 * filename — a plain link hands the student "1788007637477_gv4hcdo5px4.pdf",
 * and the `download` attribute does nothing across origins.
 */
function PostAttachments({ attachments }: { attachments: PostAttachment[] }) {
  if (attachments.length === 0) return null
  const images = attachments.filter(a => isImageAttachment(a.mime))
  const files = attachments.filter(a => !isImageAttachment(a.mime))

  return (
    <div className="mt-2.5 space-y-2">
      {images.length > 0 && (
        <div className={cn('grid gap-2', images.length === 1 ? 'grid-cols-1 max-w-sm' : 'grid-cols-2 max-w-md')}>
          {images.map(image => (
            <a key={image.url} href={image.url} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.name}
                loading="lazy"
                className="w-full max-h-56 rounded-xl object-cover border border-border hover:opacity-90 transition-opacity"
              />
            </a>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map(file => (
            <a
              key={file.url}
              href={`${file.url}?download=${encodeURIComponent(file.name)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 max-w-64 rounded-xl border border-border bg-muted px-3 py-2 hover:bg-accent transition-colors"
            >
              <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="min-w-0">
                <span className="block text-xs font-medium truncate">{shortenFileName(file.name, 28)}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {attachmentKindLabel(file.mime, file.name)}
                  {file.size > 0 ? ` · ${formatFileSize(file.size)}` : ''}
                </span>
              </span>
              <Download className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * "เห็นแล้ว 12/30", and — the part a teacher can act on — who the other 18 are.
 *
 * Says เห็นแล้ว rather than อ่านแล้ว because that is all the data supports: a
 * row is written when the announcement was rendered on someone's screen.
 */
function SeenPanel({ students, seenBy }: { students: StreamStudent[]; seenBy: string[] }) {
  const [open, setOpen] = useState(false)
  if (students.length === 0) return null

  const seen = new Set(seenBy)
  const missing = students.filter(s => !seen.has(s.id))
  const seenCount = students.length - missing.length

  return (
    <div>
      <Button
        variant="ghost"
        size="xs"
        className="gap-1.5 px-1 text-muted-foreground"
        onClick={() => setOpen(o => !o)}
      >
        <Eye className="w-3.5 h-3.5" />
        เห็นแล้ว {seenCount}/{students.length}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </Button>
      {open && (
        <div className="mt-1.5 rounded-xl bg-muted px-3 py-2">
          <p className="text-[10px] text-muted-foreground mb-1">
            นับเมื่อประกาศแสดงบนหน้าจอของนักเรียนแล้ว ไม่ได้แปลว่าอ่านจบ
          </p>
          {missing.length === 0 ? (
            <p className="text-xs text-success">นักเรียนทุกคนเห็นประกาศนี้แล้ว</p>
          ) : (
            <p className="text-xs text-foreground">
              <span className="text-muted-foreground">ยังไม่เห็น: </span>
              {missing.map(s => s.full_name).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function PostCard({
  post, classroomId, canManage, variant, students, seenBy, trackSeen,
}: {
  post: ClassroomPost
  classroomId: string
  canManage: boolean
  variant: StreamVariant
  students: StreamStudent[]
  seenBy: string[]
  trackSeen: boolean
}) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [editBody, setEditBody] = useState(post.body)
  const [editAttachments, setEditAttachments] = useState<PostAttachment[]>(post.attachments ?? [])
  const [isPending, startTransition] = useTransition()
  const [showComments, setShowComments] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [isCommentPending, startCommentTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()
  const cardRef = useRef<HTMLDivElement>(null)

  const isPanel = variant === 'panel'
  const authorName = post.users?.full_name ?? 'ครูผู้สอน'
  const initials = authorName.slice(0, 2)
  const attachments = post.attachments ?? []

  // A sighting is recorded when the announcement is actually on screen, not
  // when the page happens to render it below the fold. Fires once per post.
  useEffect(() => {
    if (!trackSeen) return
    const element = cardRef.current
    if (!element || typeof IntersectionObserver !== 'function') return

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect()
        void markPostsSeen([post.id])
      }
    }, { threshold: 0.4 })

    observer.observe(element)
    return () => observer.disconnect()
  }, [trackSeen, post.id])

  function submitComment() {
    if (!commentDraft.trim()) return
    startCommentTransition(async () => {
      const res = await addComment(post.id, classroomId, commentDraft)
      if (res?.error) toast.error(res.error)
      else { setCommentDraft(''); router.refresh() }
    })
  }

  function saveEdit() {
    if (!editBody.trim() && editAttachments.length === 0) return
    startTransition(async () => {
      const res = await updateClassroomPost(post.id, classroomId, editBody, editAttachments)
      if (res?.error) toast.error(res.error)
      else { setIsEditing(false); toast.success('แก้ไขประกาศแล้ว'); router.refresh() }
    })
  }

  function togglePin() {
    startTransition(async () => {
      const res = await togglePinClassroomPost(post.id, classroomId, !post.pinned)
      if (res?.error) toast.error(res.error)
      else { toast.success(post.pinned ? 'ยกเลิกปักหมุดแล้ว' : 'ปักหมุดประกาศแล้ว'); router.refresh() }
    })
  }

  async function remove() {
    const ok = await confirm({
      title: 'ลบประกาศนี้?',
      description: 'ประกาศ ไฟล์ที่แนบ และความคิดเห็นทั้งหมดจะถูกลบถาวร กู้คืนไม่ได้',
      confirmLabel: 'ลบถาวร',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteClassroomPost(post.id, classroomId)
      if (res?.error) toast.error(res.error)
      else { toast.success('ลบประกาศแล้ว'); router.refresh() }
    })
  }

  return (
    <div
      ref={cardRef}
      className={cn(
        isPanel
          ? cn('px-4 py-3', post.pinned && 'bg-primary/5')
          : cn('bg-card border rounded-2xl p-4', post.pinned && 'border-primary/20'),
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shrink-0',
          isPanel ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm',
        )}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">{authorName}</p>
            {post.pinned && (
              <Badge variant="outline" className="gap-1 text-primary border-primary/20">
                <Pin className="w-3 h-3" /> ปักหมุด
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatTime(post.created_at)}
            {post.edited_at && ' (แก้ไขแล้ว)'}
          </p>

          {isEditing ? (
            <div className="mt-2 space-y-2">
              <Textarea value={editBody} onChange={e => setEditBody(e.target.value)} className="min-h-20" />
              <PostAttach attachments={editAttachments} onChange={setEditAttachments} disabled={isPending} />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => {
                  setIsEditing(false)
                  setEditBody(post.body)
                  setEditAttachments(post.attachments ?? [])
                }}>
                  ยกเลิก
                </Button>
                <Button
                  size="sm"
                  disabled={isPending || (!editBody.trim() && editAttachments.length === 0)}
                  onClick={saveEdit}
                >
                  บันทึก
                </Button>
              </div>
            </div>
          ) : (
            <>
              <PostBody body={post.body} />
              <PostAttachments attachments={attachments} />
              {canManage && (
                <div className="mt-2">
                  <SeenPanel students={students} seenBy={seenBy} />
                </div>
              )}
            </>
          )}
        </div>

        {canManage && !isEditing && (
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Pinning is one click, not a menu item: it is the thing a teacher
                does most to an announcement, and the icon doubles as the state. */}
            <IconButton
              onClick={togglePin}
              disabled={isPending}
              label={post.pinned ? 'ยกเลิกปักหมุด' : 'ปักหมุดไว้บนสุด'}
              size="sm"
              className={post.pinned ? 'text-primary' : ''}
            >
              {post.pinned ? <PinOff /> : <Pin />}
            </IconButton>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<IconButton label="ตัวเลือกเพิ่มเติม" size="sm"><MoreVertical /></IconButton>}
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> แก้ไข
                </DropdownMenuItem>
                <DropdownMenuItem onClick={remove} disabled={isPending}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" /> ลบประกาศ
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Comments */}
      <div className={cn('mt-3 pt-3 border-t', isPanel ? 'pl-10' : 'pl-12')}>
        <Button
          variant="ghost"
          size="xs"
          className="gap-1.5 px-1 text-muted-foreground"
          onClick={() => setShowComments(s => !s)}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {post.comments.length > 0 ? `${post.comments.length} ความเห็น` : 'แสดงความคิดเห็น'}
        </Button>

        {showComments && (
          <div className="mt-2.5 space-y-2.5">
            {post.comments.map(c => (
              <div key={c.id} className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-muted-foreground flex items-center justify-center text-background text-xs font-bold shrink-0">
                  {(c.users?.full_name ?? '?').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0 bg-muted rounded-xl px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <p className="text-xs font-semibold">{c.users?.full_name ?? 'ไม่ทราบชื่อ'}</p>
                    <p className="text-[11px] text-muted-foreground">{formatTime(c.created_at)}</p>
                  </div>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.body}</p>
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <Input
                placeholder="แสดงความคิดเห็น..."
                value={commentDraft}
                onChange={e => setCommentDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitComment() }}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 shrink-0"
                disabled={isCommentPending || !commentDraft.trim()}
                onClick={submitComment}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  )
}
