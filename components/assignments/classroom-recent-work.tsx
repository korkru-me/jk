'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatThaiDateTime } from '@/lib/thai-time'
import { RECENT_WORK_WINDOW_MS, visibleRecentClassroomWork, type RecentClassroomWorkResult } from '@/lib/classroom-recent-work'

const TYPE_LABELS = { exercise: 'แบบฝึกหัด', exam: 'ข้อสอบ', practice: 'คลังฝึก' }

export function ClassroomRecentWork({ result }: { result: RecentClassroomWorkResult }) {
  const [now, setNow] = useState(() => Date.parse(result.asOf))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    function update() {
      const current = Date.now()
      setNow(current)
      const nextExpiry = result.items.map(item => Date.parse(item.createdAt) + RECENT_WORK_WINDOW_MS)
        .filter(expiry => expiry > current).sort((a, b) => a - b)[0]
      if (nextExpiry !== undefined) timer = setTimeout(update, nextExpiry - current + 1)
    }
    update()
    return () => clearTimeout(timer)
  }, [result])

  const items = visibleRecentClassroomWork(result.items, now)
  if (!result.error && items.length === 0) return null

  return (
    <Card padding="md" className="border-success/30 bg-success/5" data-classroom-recent-work>
      <section aria-labelledby="recent-classroom-work-heading" className="flex min-w-0 flex-col gap-3">
        <div className="flex items-start gap-2">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <div>
            <h2 id="recent-classroom-work-heading" className="font-semibold">งานที่เพิ่งมอบหมาย</h2>
            <p className="text-xs text-muted-foreground">สร้างสำเร็จแล้ว</p>
          </div>
        </div>
        {result.error ? <p role="alert" className="text-sm text-destructive">{result.error}</p> : (
          <ul className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {items.map(item => (
              <li key={`${item.type}:${item.id}`}>
                <Link href={item.type === 'practice' ? `/practice/${item.id}/edit` : `/assignments/${item.id}`}
                  className="group block h-full min-h-11 min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card radius="sm" padding="sm" className="h-full min-w-0 border-success/30 transition-colors group-hover:bg-success/10">
                    <p className="break-words text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{TYPE_LABELS[item.type]} · {formatThaiDateTime(item.createdAt)}</p>
                    <Badge className="mt-1" variant={item.status === 'published' ? 'statusSuccess' : 'secondary'}>{item.status === 'published' ? 'เผยแพร่แล้ว' : 'บันทึกร่างแล้ว'}</Badge>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  )
}
