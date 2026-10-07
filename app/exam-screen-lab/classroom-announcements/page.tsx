import { notFound } from 'next/navigation'
import { ClassroomStream } from '@/app/(app)/classrooms/[id]/_components/classroom-stream'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import type { ClassroomPost } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Public local assets only. No student data, Storage access, or seen-state writes.
const posts: ClassroomPost[] = [
  {
    id: 'lab-single-image',
    classroom_id: 'lab-classroom',
    author_id: 'lab-author',
    body: 'ประกาศจำลอง — กดรูปเพื่อขยายโดยไม่ออกจากหน้านี้',
    attachments: [{ url: '/logo.png', name: 'ภาพประกาศแนวตั้ง.png', mime: 'image/png', size: 0 }],
    pinned: false,
    created_at: '2026-10-05T00:00:00Z',
    updated_at: '2026-10-05T00:00:00Z',
    edited_at: null,
    users: { full_name: 'ผู้ประกาศจำลอง' },
    comments: [],
  },
  {
    id: 'lab-gallery',
    classroom_id: 'lab-classroom',
    author_id: 'lab-author',
    body: 'ประกาศจำลองหลายรูป — เปิดรูปที่เลือกและคืนโฟกัสเมื่อปิด',
    attachments: [
      { url: '/logo.png', name: 'ภาพแนวตั้งในชุด.png', mime: 'image/png', size: 0 },
      { url: '/samples/simple-circuit.svg', name: 'ภาพแนวนอนในชุด.svg', mime: 'image/svg+xml', size: 0 },
    ],
    pinned: false,
    created_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    edited_at: null,
    users: { full_name: 'ผู้ประกาศจำลอง' },
    comments: [],
  },
]

export default function ClassroomAnnouncementsLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 p-4">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">ทดสอบรูปประกาศห้องเรียน</h1>
        <p className="text-sm text-muted-foreground">
          ข้อมูลจำลองสำหรับทดสอบป๊อปอัปเท่านั้น ไม่อ่านหรือเขียนข้อมูลห้องเรียนจริง
        </p>
      </header>
      <section aria-label="ประกาศในกรอบเลื่อน">
        <ClassroomStream
          classroomId="lab-classroom"
          canPost={false}
          trackSeen={false}
          initialPosts={posts}
          variant="panel"
          maxHeightClass="max-h-[420px]"
          title="ประกาศในกรอบเลื่อน (จำลอง)"
        />
      </section>
      <section aria-label="ประกาศแบบเต็มหน้า" className="space-y-4">
        <h2 className="text-lg font-semibold">ประกาศแบบเต็มหน้า (จำลอง)</h2>
        <ClassroomStream classroomId="lab-classroom" canPost={false} trackSeen={false} initialPosts={posts} />
      </section>
    </main>
  )
}
