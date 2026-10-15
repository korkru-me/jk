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
    <Card padding="sm" className="@container/recent-work border-success/30 bg-success/5" data-classroom-recent-work>
      <section aria-labelledby="recent-classroom-work-heading" className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
          <h2 id="recent-classroom-work-heading" className="text-sm font-semibold">งานที่เพิ่งมอบหมาย</h2>
        </div>
        {result.error ? <p role="alert" className="text-sm text-destructive">{result.error}</p> : (
          <ul className="grid min-w-0 grid-cols-1 gap-2 @min-[28rem]/recent-work:grid-cols-2 @min-[48rem]/recent-work:grid-cols-3">
            {items.map(item => (
              <li key={`${item.type}:${item.id}`}>
                <Link href={item.type === 'practice' ? `/practice/${item.id}/edit` : `/assignments/${item.id}`}
                  className="group block h-full min-h-11 min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card radius="sm" className="h-full min-w-0 border-success/30 px-3 py-2 transition-colors group-hover:bg-success/10">
                    <p className="line-clamp-2 break-words text-sm font-semibold" title={item.title}>{item.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs text-muted-foreground">{TYPE_LABELS[item.type]} · {formatThaiDateTime(item.createdAt)}</span>
                      <Badge variant={item.status === 'published' ? 'statusSuccess' : 'secondary'}>{item.status === 'published' ? 'เผยแพร่แล้ว' : 'บันทึกร่างแล้ว'}</Badge>
                    </div>
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
