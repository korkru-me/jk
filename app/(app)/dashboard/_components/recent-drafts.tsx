'use client'

import { Clock, FileEdit, ChevronRight } from 'lucide-react'

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
    <div className="bg-white rounded-xl ring-1 ring-black/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <FileEdit className="w-4 h-4 text-gray-400" />
          <p className="text-sm font-semibold text-gray-900">แบบร่างที่ค้างไว้</p>
        </div>
        <button className="text-xs text-blue-600 hover:underline">ดูทั้งหมด</button>
      </div>
      <div className="divide-y divide-gray-50">
        {DRAFTS.map(draft => (
          <div key={draft.id} className="px-4 py-3 hover:bg-gray-50/50 transition-colors group cursor-pointer">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 group-hover:text-blue-600 truncate transition-colors">
                  {draft.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">{draft.subject}</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    {draft.updatedAt}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs font-semibold text-gray-600">{draft.progress}%</span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 transition-colors" />
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  draft.progress >= 70 ? 'bg-emerald-400' :
                  draft.progress >= 40 ? 'bg-blue-400' : 'bg-gray-300'
                }`}
                style={{ width: `${draft.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
