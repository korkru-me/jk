'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  getMyNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/actions/notifications'
import type { Notification } from '@/lib/types'
import { toast } from 'sonner'

const POLL_MS = 45000
const DEFAULT_ACTIONS = { getMyNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead }
export type NotificationsBellActions = typeof DEFAULT_ACTIONS

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'เมื่อสักครู่'
  if (min < 60) return `${min} นาทีที่แล้ว`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`
  return `${Math.floor(hr / 24)} วันที่แล้ว`
}

export function NotificationsBell({ initialUnreadCount, actions = DEFAULT_ACTIONS }: { initialUnreadCount: number; actions?: NotificationsBellActions }) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refreshCount = useCallback(() => {
    actions.getUnreadNotificationCount().then(setUnreadCount).catch(() => {})
    if (open) actions.getMyNotifications().then(list => { setNotifications(list); setError('') }).catch(() => setError('โหลดการแจ้งเตือนไม่สำเร็จ กรุณาเปิดใหม่อีกครั้ง'))
  }, [open, actions])

  useEffect(() => {
    // The server-rendered layout already supplied the initial count. Poll only
    // while the tab is visible, and refresh once when the user comes back.
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshCount()
    }
    const interval = setInterval(refreshWhenVisible, POLL_MS)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    // The student popup acknowledges the same durable notification as this bell.
    window.addEventListener('korkru:notifications-changed', refreshWhenVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('korkru:notifications-changed', refreshWhenVisible)
    }
  }, [refreshCount])

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setLoading(true)
      setError('')
      try { setNotifications(await actions.getMyNotifications()) }
      catch { setError('โหลดการแจ้งเตือนไม่สำเร็จ กรุณาเปิดใหม่อีกครั้ง') }
      finally { setLoading(false) }
    }
  }

  async function handleItemClick(id: string) {
    const wasUnread = notifications.some(n => n.id === id && !n.is_read)
    try {
      const result = await actions.markNotificationRead(id)
      if (result.error) { toast.error(result.error); return }
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1))
    } catch { toast.error('บันทึกการอ่านไม่สำเร็จ กรุณาลองใหม่') }
  }

  async function handleMarkAllRead() {
    try {
      const result = await actions.markAllNotificationsRead()
      if (result.error) { toast.error(result.error); return }
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch { toast.error('บันทึกการอ่านไม่สำเร็จ กรุณาลองใหม่') }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        aria-label="การแจ้งเตือน"
        className="relative flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted transition-colors outline-none"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">การแจ้งเตือน</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <CheckCheck size={12} /> อ่านทั้งหมด
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && (
            <p className="text-xs text-muted-foreground text-center py-6">กำลังโหลด...</p>
          )}
          {!loading && error && <p role="alert" className="px-3 py-4 text-xs text-destructive">{error}</p>}
          {!loading && !error && notifications.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">ยังไม่มีการแจ้งเตือน</p>
          )}
          {!loading && !error && notifications.map(n => {
            const row = (
              <div
                className={`px-3 py-2.5 border-b last:border-b-0 hover:bg-muted transition-colors ${!n.is_read ? 'bg-primary/10' : ''}`}
              >
                <p className="text-sm font-medium leading-snug">{n.title}</p>
                {n.body && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>}
                <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
              </div>
            )
            return n.link ? (
              <Link key={n.id} href={n.link} onClick={() => handleItemClick(n.id)}>
                {row}
              </Link>
            ) : (
              <button key={n.id} onClick={() => handleItemClick(n.id)} className="w-full text-left">
                {row}
              </button>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
