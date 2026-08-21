'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MoreVertical, Pin, Pencil, Trash2, Send, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  createClassroomPost, updateClassroomPost, togglePinClassroomPost, deleteClassroomPost, addComment,
} from '@/lib/actions/classroom-posts'
import type { ClassroomPost } from '@/lib/types'
import { IconButton } from '@/components/ui/icon-button'
import { Card } from '@/components/ui/card'

interface Props {
  classroomId: string
  canPost: boolean
  initialPosts: ClassroomPost[]
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

export function ClassroomStream({ classroomId, canPost, initialPosts }: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState('')
  const [isPending, startTransition] = useTransition()

  function submitPost() {
    if (!draft.trim()) return
    startTransition(async () => {
      const res = await createClassroomPost(classroomId, draft)
      if (res?.error) toast.error(res.error)
      else { setDraft(''); toast.success('โพสต์ประกาศแล้ว'); router.refresh() }
    })
  }

  return (
    <div className="space-y-3">
      {canPost && (
        <Card padding="md" className="space-y-3">
          <Textarea
            placeholder="ประกาศอะไรถึงห้องเรียนนี้..."
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="min-h-20"
          />
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" disabled={isPending || !draft.trim()} onClick={submitPost}>
              <Send className="w-3.5 h-3.5" /> โพสต์ประกาศ
            </Button>
          </div>
        </Card>
      )}

      {initialPosts.length === 0 ? (
        <Card edge="dashed" padding="2xl" className="text-center">
          <p className="text-3xl mb-3">📣</p>
          <p className="font-semibold">ยังไม่มีประกาศ</p>
          <p className="text-sm text-muted-foreground mt-1">
            {canPost ? 'โพสต์ประกาศแรกถึงห้องเรียนนี้ได้เลย' : 'ครูจะประกาศข่าวสารต่าง ๆ ที่นี่'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {initialPosts.map(post => (
            <PostCard key={post.id} post={post} classroomId={classroomId} canManage={canPost} />
          ))}
        </div>
      )}
    </div>
  )
}

function PostCard({ post, classroomId, canManage }: { post: ClassroomPost; classroomId: string; canManage: boolean }) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [editBody, setEditBody] = useState(post.body)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [showComments, setShowComments] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [isCommentPending, startCommentTransition] = useTransition()

  const authorName = post.users?.full_name ?? 'ครูผู้สอน'
  const initials = authorName.slice(0, 2)

  function submitComment() {
    if (!commentDraft.trim()) return
    startCommentTransition(async () => {
      const res = await addComment(post.id, classroomId, commentDraft)
      if (res?.error) toast.error(res.error)
      else { setCommentDraft(''); router.refresh() }
    })
  }

  function saveEdit() {
    if (!editBody.trim()) return
    startTransition(async () => {
      const res = await updateClassroomPost(post.id, classroomId, editBody)
      if (res?.error) toast.error(res.error)
      else { setIsEditing(false); toast.success('แก้ไขประกาศแล้ว'); router.refresh() }
    })
  }

  function togglePin() {
    setMenuOpen(false)
    startTransition(async () => {
      const res = await togglePinClassroomPost(post.id, classroomId, !post.pinned)
      if (res?.error) toast.error(res.error)
      else { toast.success(post.pinned ? 'ยกเลิกปักหมุดแล้ว' : 'ปักหมุดประกาศแล้ว'); router.refresh() }
    })
  }

  function remove() {
    if (!confirm('ลบประกาศนี้?')) return
    setMenuOpen(false)
    startTransition(async () => {
      const res = await deleteClassroomPost(post.id, classroomId)
      if (res?.error) toast.error(res.error)
      else { toast.success('ลบประกาศแล้ว'); router.refresh() }
    })
  }

  return (
    <div className={cn(
      'bg-card border rounded-2xl p-4',
      post.pinned ? 'border-primary/20' : ''
    )}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
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
            {post.updated_at !== post.created_at && ' (แก้ไขแล้ว)'}
          </p>

          {isEditing ? (
            <div className="mt-2 space-y-2">
              <Textarea value={editBody} onChange={e => setEditBody(e.target.value)} className="min-h-20" />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => { setIsEditing(false); setEditBody(post.body) }}>ยกเลิก</Button>
                <Button size="sm" disabled={isPending || !editBody.trim()} onClick={saveEdit}>บันทึก</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm mt-2 whitespace-pre-wrap leading-relaxed">{post.body}</p>
          )}
        </div>

        {canManage && !isEditing && (
          <div className="relative shrink-0">
            <IconButton onClick={() => setMenuOpen(o => !o)} label="ตัวเลือกเพิ่มเติม" size="sm">
              <MoreVertical />
            </IconButton>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <Card radius="md" elevation="lg" className="absolute right-0 top-8 z-20 py-1 min-w-[160px]">
                  <button
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={togglePin}
                    disabled={isPending}
                  >
                    <Pin className="w-3.5 h-3.5 text-muted-foreground" /> {post.pinned ? 'ยกเลิกปักหมุด' : 'ปักหมุด'}
                  </button>
                  <button
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={() => { setIsEditing(true); setMenuOpen(false) }}
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> แก้ไข
                  </button>
                  <div className="border-t my-1" />
                  <button
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/15 transition-colors"
                    onClick={remove}
                    disabled={isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> ลบ
                  </button>
                </Card>
              </>
            )}
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="mt-3 pt-3 border-t pl-12">
        <button
          onClick={() => setShowComments(s => !s)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {post.comments.length > 0 ? `${post.comments.length} ความเห็น` : 'แสดงความคิดเห็น'}
        </button>

        {showComments && (
          <div className="mt-2.5 space-y-2.5">
            {post.comments.map(c => (
              <div key={c.id} className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-muted-foreground flex items-center justify-center text-white text-xs font-bold shrink-0">
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
    </div>
  )
}
