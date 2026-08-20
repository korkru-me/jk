'use client'

import { Clock, FileEdit, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'

const DRAFTS = [
  {
    id: 1,
    title: 'ข้อสอบกลางภาค ม.4 บทกลศาสตร์',
    subject: 'ฟิสิกส์ ม.4',
    progress: 80,
    updatedAt: '2 ชั่วโมงที่แล้ว',
    questionCount: 40,
  },
  {
    id: 2,
    title: 'แบบทดสอบย่อย: ฟิสิกส์อนุภาค ครั้งที่ 2',
    subject: 'ฟิสิกส์ ม.5',
    progress: 45,
    updatedAt: 'เมื่อวาน',
    questionCount: 20,
  },
  {
    id: 3,
    title: 'ชุดทบทวนก่อนสอบปลายภาค ม.6',
    subject: 'ฟิสิกส์ ม.6',
    progress: 20,
    updatedAt: '3 วันที่แล้ว',
    questionCount: 60,
  },
]

export function RecentDrafts() {
  return (
    <Card radius="md" edge="ring" className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <FileEdit className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">แบบร่างที่ค้างไว้</p>
        </div>
        <button className="text-xs text-primary hover:underline">ดูทั้งหมด</button>
      </div>
      <div className="divide-y divide-border">
        {DRAFTS.map(draft => (
          <div key={draft.id} className="px-4 py-3 hover:bg-muted/50 transition-colors group cursor-pointer">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-primary truncate transition-colors">
                  {draft.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{draft.subject}</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {draft.updatedAt}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs font-semibold text-muted-foreground">{draft.progress}%</span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-primary transition-colors" />
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  draft.progress >= 70 ? 'bg-success' :
                  draft.progress >= 40 ? 'bg-primary' : 'bg-muted'
                }`}
                style={{ width: `${draft.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
