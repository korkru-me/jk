'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { StudentAnnouncementInbox } from '@/components/classrooms/student-announcement-inbox'
import { AnnouncementAcknowledgementPanel } from '@/components/classrooms/announcement-acknowledgement-panel'
import { announcementReceiptKey, type PendingClassroomAnnouncement, type AnnouncementAcknowledgementStatus } from '@/lib/classroom-announcement-acknowledgements'
import { composeDescription, EMPTY_META } from '@/app/(app)/classrooms/_components/classroom-meta'

const STORAGE_KEY = 'korkru:announcement-ack-lab'
const student = { id: 'lab-student', full_name: 'นักเรียนจำลอง' }
const initial: PendingClassroomAnnouncement[] = ['ฟิสิกส์ 1','คณิตศาสตร์','ห้อง Homeroom'].map((name, i) => ({
  id: `lab-post-${i}`, classroomId: `lab-room-${i}`, classroomName: name, authorName: 'ครูจำลอง',
  classroomDescription: composeDescription({ ...EMPTY_META, cover: ['orange','blue','green'][i], coverPattern: i === 0 ? 'physics' : 'foreign-language', iconKey: i === 0 ? 'physics' : 'school' }),
  body: i === 0 ? 'เตรียมตัวสอบบทแรงและการเคลื่อนที่\nทบทวนใบงานก่อนวันศุกร์ และนำเครื่องเขียนมาให้พร้อม\nรายละเอียด https://example.invalid/worksheet' : 'ประกาศจำลองจากครู เพื่อทดสอบการกดรับทราบและแจ้งเตือนซ้ำ',
  attachments: i === 0 ? [
    { url: '/samples/simple-circuit.svg', name: 'ใบงานวงจรจำลอง.svg', mime: 'image/svg+xml', size: 0 },
    { url: '/exam-screen-lab/grading-workspace/assets/file-0.pdf', name: 'ใบงานประกาศห้องเรียนจำลอง.pdf', mime: 'application/pdf', size: 1024 },
  ] : [], createdAt: '2026-10-14T09:00:00+07:00', editedAt: null, pinned: i === 0, round: 1, remindedAt: null,
}))

// The lab alone persists synthetic receipt keys in sessionStorage so reload
// can exercise "acknowledged does not reopen" without database/account writes.
export function AnnouncementAcknowledgementLab({ simulateFailure = false }: { simulateFailure?: boolean }) {
  const storageKey = STORAGE_KEY + (simulateFailure ? ':error' : '')
  const [failNext, setFailNext] = useState(simulateFailure)
  const [ready, setReady] = useState(false)
  const [posts, setPosts] = useState(initial)
  const [receipts, setReceipts] = useState<string[]>([])
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as { posts?: PendingClassroomAnnouncement[]; receipts?: string[] } | null
      if (Array.isArray(saved?.posts) && Array.isArray(saved.receipts)) {
        // Keep fixture text/files current; only its synthetic rounds/receipts persist.
        setPosts(initial.map(post => {
          const old = saved.posts?.find(p => p?.id === post.id)
          return old && Number.isSafeInteger(old.round) && old.round >= 1 && old.round <= 2147483647
            ? { ...post, round: old.round, remindedAt: old.remindedAt && Number.isFinite(Date.parse(old.remindedAt)) ? old.remindedAt : null } : post
        }))
        setReceipts(saved.receipts.filter(key => typeof key === 'string'))
      }
    } catch { sessionStorage.removeItem(storageKey) }
    setReady(true)
  }, [storageKey])
  function save(next: PendingClassroomAnnouncement[], keys: string[]) {
    setPosts(next); setReceipts(keys)
    sessionStorage.setItem(storageKey, JSON.stringify({ posts: next, receipts: keys }))
  }
  const pending = ready ? posts.filter(p => !receipts.includes(announcementReceiptKey(p.id, p.round))) : []
  return <div className="flex flex-col gap-3">
    <h1 className="text-xl font-bold">ตัวอย่างประกาศและการรับทราบ</h1>
    <p className="text-sm text-muted-foreground">ข้อมูลจำลองเท่านั้น · เก็บสถานะทดสอบในแท็บนี้ ไม่ส่งการแจ้งเตือนหรือบันทึกข้อมูลจริง</p>
    <StudentAnnouncementInbox initialPosts={pending} acknowledgeAction={async (id, round) => {
      if (failNext) { setFailNext(false); return { error: 'ตัวอย่างการรับทราบไม่สำเร็จ · ลองกดใหม่ได้ ไม่มีการบันทึกจริง' } }
      const post = posts.find(p => p.id === id)
      if (!post || post.round !== round) return { error: 'รอบประกาศเปลี่ยนแล้ว', stale: true }
      save(posts, [...new Set([...receipts, announcementReceiptKey(id, round)])])
      return { success: true }
    }} />
    {posts.map(post => {
      const status: AnnouncementAcknowledgementStatus = { round: post.round, remindedAt: post.remindedAt, studentIds: receipts.includes(announcementReceiptKey(post.id, post.round)) ? [student.id] : [] }
      return <Card key={post.id} padding="md" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{post.classroomName} · มุมมองครูจำลอง</h2>
        <p className="whitespace-pre-wrap text-sm">{post.body}</p>
        <AnnouncementAcknowledgementPanel postId={post.id} students={[student]} status={status} remindAction={async id => {
          const current = posts.find(p => p.id === id)!
          const round = current.round + 1, remindedAt = new Date().toISOString()
          save(posts.map(p => p.id === id ? { ...p, round, remindedAt } : p), receipts)
          return { round, remindedAt }
        }} />
      </Card>
    })}
  </div>
}
