'use client'
import { useMemo, useState } from 'react'
import { NotificationsBell, type NotificationsBellActions } from '@/components/layout/notifications-bell'
import type { Notification } from '@/lib/types'
const FIXTURES: Notification[] = ['ครูตรวจคะแนนแล้ว', 'งานใกล้ถึงกำหนดส่ง', 'เลยกำหนดส่งงานแล้ว'].map((title, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i + 1}`, org_id: 'lab-org', recipient_id: 'lab-student', actor_id: i === 0 ? 'lab-teacher' : null,
  type: i === 0 ? 'grade_published' : 'assignment_reminder', title, body: i === 0 ? 'ใบงานแรงและการเคลื่อนที่' : 'ใบงานฟิสิกส์ 1 · กำหนดส่ง 27 ต.ค. 19:00',
  related_assignment_id: null, related_classroom_id: null, is_read: false, created_at: new Date().toISOString(), link: null,
}))
/** Synthetic state only. All four action boundaries are overridden. */
export function BellLab({ fail }: { fail: boolean }) {
  const [notices, setNotices] = useState(FIXTURES)
  const actions = useMemo<NotificationsBellActions>(() => ({
    getMyNotifications: async () => notices,
    getUnreadNotificationCount: async () => notices.filter(row => !row.is_read).length,
    markNotificationRead: async id => {
      if (fail) return { error: 'บันทึกการอ่านไม่สำเร็จ กรุณาลองใหม่' }
      setNotices(previous => previous.map(row => row.id === id ? { ...row, is_read: true } : row))
      return { success: true }
    },
    markAllNotificationsRead: async () => {
      if (fail) return { error: 'บันทึกการอ่านไม่สำเร็จ กรุณาลองใหม่' }
      setNotices(previous => previous.map(row => ({ ...row, is_read: true })))
      return { success: true }
    },
  }), [notices, fail])
  return <main className="flex items-center justify-between gap-3 p-4">
    <p className="text-sm text-muted-foreground">ตัวอย่างกระดิ่งนักเรียน — ข้อมูลสังเคราะห์</p>
    <NotificationsBell initialUnreadCount={3} actions={actions} />
  </main>
}
